/**
 * BinanceSyncService — Phase 2 orchestrator.
 *
 * Iterates the 13 Binance endpoints respecting per-endpoint window limits,
 * persists raw events idempotently and updates job progress so the UI can
 * render a real-time progress bar.
 *
 * Concurrency: p-limit(BINANCE_SYNC_CONCURRENCY) caps in-flight HTTP calls.
 * Errors:      a single endpoint failure marks the job as failed but lets
 *              the BinanceClient's internal retry loop handle 429/418.
 */
import pLimit from 'p-limit';
import {
  API_ERROR,
  BINANCE_GENESIS_DATE,
  BINANCE_SYNC_CONCURRENCY,
  BINANCE_WINDOW_DAYS,
  CRYPTO_EVENT_TYPE,
  CRYPTO_SYNC_MODE,
  type CryptoEventType,
  type CryptoExchange,
  type CryptoSyncMode,
} from '@/constants/finance';
import {
  bulkInsertRawEventsForUser,
  listInteractedAssetsForUser,
  type RawEventInput,
} from '@/services/database/BinanceRawEventsRepository';
import {
  type EndpointProgress,
  isJobCancelled,
  markJobCompleted,
  markJobFailed,
  markJobRunning,
  updateJobProgress,
} from '@/services/database/CryptoSyncJobsRepository';
import {
  type DecryptedCredentials,
  getDecryptedActiveForUser,
} from '@/services/database/ExchangeCredentialsRepository';
import {
  BinanceClient,
  BinanceClientError,
  candidateSymbolsFor,
  defaultSyncBaseAssets,
  generateWindows,
} from './BinanceClient';
import { syncDebug } from './syncDebug';

export interface RunSyncInput {
  userId: number;
  jobId: number;
  exchange: CryptoExchange;
  mode: CryptoSyncMode;
  scopeFrom: Date;
  scopeTo: Date;
}

interface ProgressMap {
  [eventType: string]: EndpointProgress;
}

const PROGRESS_FLUSH_EVERY = 5; // flush to DB every N completed windows

export async function runSync(input: RunSyncInput): Promise<void> {
  const credentials = await getDecryptedActiveForUser(input.userId, input.exchange);
  if (!credentials) {
    await markJobFailed(input.jobId, 'no_credentials', 'No active credentials for this exchange');
    return;
  }

  await markJobRunning(input.jobId);
  syncDebug.jobStart(input.jobId, input.mode, { from: input.scopeFrom, to: input.scopeTo });

  const client = new BinanceClient({ apiKey: credentials.apiKey, apiSecret: credentials.apiSecret });
  const limit = pLimit(BINANCE_SYNC_CONCURRENCY);
  const progress: ProgressMap = {};
  let totalIngested = 0;

  // Aggregate per-endpoint failures so we can surface them in the job's
  // ErrorMessage without aborting the whole sync over a single bad symbol.
  const taskFailures: Array<{ eventType: CryptoEventType; code: string; message: string }> = [];
  let fatalError: BinanceClientError | null = null;
  let cancelled = false;

  // Cheap cancellation poll: every 30 tasks check the DB once. Avoids
  // bombarding the DB with one query per task while still aborting within a
  // few seconds of the user pressing "Stop".
  const CANCEL_CHECK_EVERY = 30;
  let tasksSinceCancelCheck = 0;

  try {
    const tasks = await buildTasks(client, input);

    initializeProgress(progress, tasks);
    await updateJobProgress(input.jobId, progress, 0);

    let completedSinceFlush = 0;

    await Promise.all(
      tasks.map((task) =>
        limit(async () => {
          if (fatalError || cancelled) return;

          tasksSinceCancelCheck++;
          if (tasksSinceCancelCheck >= CANCEL_CHECK_EVERY) {
            tasksSinceCancelCheck = 0;
            if (await isJobCancelled(input.jobId)) {
              cancelled = true;
              return;
            }
          }

          let events: RawEventInput[] = [];
          try {
            events = await task.execute();
          } catch (error) {
            const isFatal = error instanceof BinanceClientError && error.code === API_ERROR.CRYPTO.INVALID_SIGNATURE;
            if (isFatal) {
              fatalError = error as BinanceClientError;
              syncDebug.taskFailure(task.eventType, {
                code: error.code,
                binanceCode: error.binanceCode,
                statusCode: error.statusCode,
                cause: error.cause,
              });
              return;
            }
            const code = error instanceof BinanceClientError ? error.code : 'task_failed';
            const message = error instanceof Error ? error.message : String(error);
            taskFailures.push({ eventType: task.eventType, code, message });
            syncDebug.taskFailure(task.eventType, {
              code,
              binanceCode: error instanceof BinanceClientError ? error.binanceCode : undefined,
              statusCode: error instanceof BinanceClientError ? error.statusCode : undefined,
              cause: error instanceof BinanceClientError ? error.cause : error,
            });
          }

          if (events.length > 0) {
            try {
              const inserted = await bulkInsertRawEventsForUser(input.userId, events, input.jobId);
              totalIngested += inserted;
            } catch (insertError) {
              const message = insertError instanceof Error ? insertError.message : String(insertError);
              taskFailures.push({ eventType: task.eventType, code: 'insert_failed', message });
            }
          }

          const endpointProgress = progress[task.eventType] ?? emptyProgress();
          endpointProgress.fetched += events.length;
          endpointProgress.completedWindows += 1;
          endpointProgress.lastWindowEnd = task.windowEnd.toISOString();
          progress[task.eventType] = endpointProgress;

          completedSinceFlush++;
          if (completedSinceFlush >= PROGRESS_FLUSH_EVERY) {
            completedSinceFlush = 0;
            await updateJobProgress(input.jobId, progress, totalIngested);
          }
        }),
      ),
    );

    await updateJobProgress(input.jobId, progress, totalIngested);

    // Per-endpoint summary for the debug log (no-op when CRYPTO_SYNC_DEBUG=0).
    const failuresByEndpoint = countFailuresByEndpoint(taskFailures);
    Object.entries(progress).forEach(([endpoint, p]) => {
      syncDebug.endpointSummary(endpoint, p.fetched, failuresByEndpoint[endpoint] ?? 0, p.totalWindows);
    });

    if (cancelled) {
      // The cancel endpoint already moved the row to status='cancelled'. We
      // only persist the final progress so the UI shows what was ingested
      // before the abort.
      syncDebug.jobEnd(input.jobId, 'cancelled', totalIngested, taskFailures.length);
      return;
    }

    if (fatalError) {
      const err = fatalError as BinanceClientError;
      await markJobFailed(input.jobId, err.code, err.message);
      syncDebug.jobEnd(input.jobId, 'failed', totalIngested, taskFailures.length);
      return;
    }

    if (taskFailures.length === 0) {
      await markJobCompleted(input.jobId);
      syncDebug.jobEnd(input.jobId, 'completed', totalIngested, 0);
    } else {
      // Partial success: some endpoints worked, others didn't. We still mark
      // the job completed so the UI doesn't show the panel as "failed", but
      // we surface a warning summary in ErrorMessage.
      const summary = summariseFailures(taskFailures);
      await markJobCompleted(input.jobId);
      await updateJobProgress(input.jobId, progress, totalIngested);
      // biome-ignore lint/suspicious/noConsole: surface partial failures in dev logs
      console.warn(`Sync job ${input.jobId} completed with ${taskFailures.length} task failures:\n${summary}`);
      syncDebug.jobEnd(input.jobId, 'completed_with_failures', totalIngested, taskFailures.length);
    }
  } catch (error) {
    // Only "buildTasks" failure or unexpected throws land here.
    const code = error instanceof BinanceClientError ? error.code : 'sync_failed';
    const message = error instanceof Error ? error.message : String(error);
    await markJobFailed(input.jobId, code, message);
    throw error;
  } finally {
    redactCredentials(credentials);
  }
}

function countFailuresByEndpoint(
  failures: Array<{ eventType: CryptoEventType; code: string; message: string }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  failures.forEach((f) => {
    counts[f.eventType] = (counts[f.eventType] ?? 0) + 1;
  });
  return counts;
}

function summariseFailures(failures: Array<{ eventType: CryptoEventType; code: string; message: string }>): string {
  const grouped = new Map<string, number>();
  failures.forEach((f) => {
    const key = `${f.eventType}/${f.code}`;
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  });
  return Array.from(grouped.entries())
    .map(([key, count]) => `  ${key} ×${count}`)
    .join('\n');
}

// ============================================================
// Task building
// ============================================================

interface SyncTask {
  eventType: CryptoEventType;
  windowEnd: Date;
  execute: () => Promise<RawEventInput[]>;
}

async function buildTasks(client: BinanceClient, input: RunSyncInput): Promise<SyncTask[]> {
  const { scopeFrom, scopeTo } = input;
  const tasks: SyncTask[] = [];

  // Spot trades — ONE task per candidate symbol. Internally fetchSpotTrades
  // paginates with `fromId` until the scope is covered (or returns empty
  // immediately for pairs the user never touched).
  //
  // Discovery merges three sources (in priority order):
  //   1. getBalances() — every coin the user currently has any balance in
  //      (free/locked/freeze/withdrawing/ipoable/ipoing/storage > 0). This
  //      catches assets parked in Earn/Vault/staking that don't show up in
  //      the spot-only getAccountInformation.
  //   2. listInteractedAssetsForUser() — assets seen in already-ingested
  //      events (dividend, dust, deposit, withdraw, earn_*, convert, etc.).
  //      Catches obscure airdrops and tokens the user has since fully
  //      withdrawn.
  //   3. defaultSyncBaseAssets() — held + top-40 fallback for users with
  //      empty wallets and no prior sync history.
  const [allCoins, dbAssets, heldAssets] = await Promise.all([
    safeDiscoverAllCoins(client),
    listInteractedAssetsForUser(input.userId),
    client.discoverHeldAssets(),
  ]);
  const baseAssets = unique([...allCoins, ...dbAssets, ...defaultSyncBaseAssets(heldAssets)]);
  syncDebug.discovery({ allCoins, dbAssets, heldAssets, merged: baseAssets });
  const candidatePairs = unique(baseAssets.flatMap(candidateSymbolsFor));
  candidatePairs.forEach((symbol) => {
    tasks.push({
      eventType: CRYPTO_EVENT_TYPE.SPOT_TRADE,
      windowEnd: scopeTo,
      execute: () => client.fetchSpotTrades(symbol, scopeFrom.getTime(), scopeTo.getTime()),
    });
  });

  // Convert
  generateWindows(scopeFrom, scopeTo, BINANCE_WINDOW_DAYS.CONVERT).forEach(({ start, end }) => {
    tasks.push({
      eventType: CRYPTO_EVENT_TYPE.CONVERT,
      windowEnd: end,
      execute: () => client.fetchConvertTrades(start.getTime(), end.getTime()),
    });
  });

  // Earn — flexible + locked
  generateWindows(scopeFrom, scopeTo, BINANCE_WINDOW_DAYS.EARN_REWARDS).forEach(({ start, end }) => {
    tasks.push({
      eventType: CRYPTO_EVENT_TYPE.EARN_FLEX,
      windowEnd: end,
      execute: () => client.fetchFlexibleEarnRewards(start.getTime(), end.getTime()),
    });
    tasks.push({
      eventType: CRYPTO_EVENT_TYPE.EARN_LOCKED,
      windowEnd: end,
      execute: () => client.fetchLockedEarnRewards(start.getTime(), end.getTime()),
    });
  });

  // ETH staking
  generateWindows(scopeFrom, scopeTo, BINANCE_WINDOW_DAYS.ETH_STAKING).forEach(({ start, end }) => {
    tasks.push({
      eventType: CRYPTO_EVENT_TYPE.ETH_STAKING,
      windowEnd: end,
      execute: () => client.fetchEthStakingRewards(start.getTime(), end.getTime()),
    });
  });

  // On-chain staking interest
  generateWindows(scopeFrom, scopeTo, BINANCE_WINDOW_DAYS.STAKING_INTEREST).forEach(({ start, end }) => {
    tasks.push({
      eventType: CRYPTO_EVENT_TYPE.STAKING_INTEREST,
      windowEnd: end,
      execute: () => client.fetchStakingInterest(start.getTime(), end.getTime()),
    });
  });

  // Asset dividends (airdrops + distributions)
  generateWindows(scopeFrom, scopeTo, BINANCE_WINDOW_DAYS.DIVIDEND).forEach(({ start, end }) => {
    tasks.push({
      eventType: CRYPTO_EVENT_TYPE.DIVIDEND,
      windowEnd: end,
      execute: () => client.fetchAssetDividends(start.getTime(), end.getTime()),
    });
  });

  // Deposits / withdrawals
  generateWindows(scopeFrom, scopeTo, BINANCE_WINDOW_DAYS.DEPOSIT).forEach(({ start, end }) => {
    tasks.push({
      eventType: CRYPTO_EVENT_TYPE.DEPOSIT,
      windowEnd: end,
      execute: () => client.fetchDeposits(start.getTime(), end.getTime()),
    });
    tasks.push({
      eventType: CRYPTO_EVENT_TYPE.WITHDRAW,
      windowEnd: end,
      execute: () => client.fetchWithdrawals(start.getTime(), end.getTime()),
    });
  });

  // Fiat orders + payments (deposit transactionType=0, withdraw=1)
  generateWindows(scopeFrom, scopeTo, BINANCE_WINDOW_DAYS.FIAT_ORDER).forEach(({ start, end }) => {
    (['0', '1'] as const).forEach((tt) => {
      tasks.push({
        eventType: CRYPTO_EVENT_TYPE.FIAT_ORDER,
        windowEnd: end,
        execute: () => client.fetchFiatOrders(start.getTime(), end.getTime(), tt),
      });
      tasks.push({
        eventType: CRYPTO_EVENT_TYPE.FIAT_PAYMENT,
        windowEnd: end,
        execute: () => client.fetchFiatPayments(start.getTime(), end.getTime(), tt),
      });
    });
  });

  // Dust → BNB
  generateWindows(scopeFrom, scopeTo, BINANCE_WINDOW_DAYS.DUST).forEach(({ start, end }) => {
    tasks.push({
      eventType: CRYPTO_EVENT_TYPE.DUST,
      windowEnd: end,
      execute: () => client.fetchDust(start.getTime(), end.getTime()),
    });
  });

  // C2C — buy + sell legs (only last 6 months are returned by Binance regardless of scope)
  generateWindows(scopeFrom, scopeTo, BINANCE_WINDOW_DAYS.C2C).forEach(({ start, end }) => {
    (['BUY', 'SELL'] as const).forEach((tt) => {
      tasks.push({
        eventType: CRYPTO_EVENT_TYPE.C2C,
        windowEnd: end,
        execute: () => client.fetchC2CTrades(start.getTime(), end.getTime(), tt),
      });
    });
  });

  return tasks;
}

// ============================================================
// Helpers
// ============================================================

function emptyProgress(): EndpointProgress {
  return { fetched: 0, totalWindows: 0, completedWindows: 0, lastWindowEnd: null };
}

function initializeProgress(progress: ProgressMap, tasks: SyncTask[]): void {
  tasks.forEach((task) => {
    const current = progress[task.eventType] ?? emptyProgress();
    current.totalWindows += 1;
    progress[task.eventType] = current;
  });
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

/**
 * Wrap discoverAllInteractedAssets() so a transient failure here doesn't
 * abort the whole sync — we still have the held + DB + fallback sources.
 */
async function safeDiscoverAllCoins(client: BinanceClient): Promise<string[]> {
  try {
    return await client.discoverAllInteractedAssets();
  } catch {
    return [];
  }
}

/**
 * Best-effort: zero out the in-memory copy of the secret. JavaScript strings
 * are immutable so this is mostly symbolic, but it prevents the secret from
 * lingering in object inspection during a debugger pause.
 */
function redactCredentials(creds: DecryptedCredentials): void {
  // biome-ignore lint/suspicious/noExplicitAny: deliberate mutation to clear a sensitive field
  (creds as any).apiKey = '';
  // biome-ignore lint/suspicious/noExplicitAny: deliberate mutation to clear a sensitive field
  (creds as any).apiSecret = '';
}

// ============================================================
// Scope computation (called by the API handler / cron)
// ============================================================

/**
 * Compute (scopeFrom, scopeTo) for a sync request.
 *
 * Priority order:
 *  1. Explicit `requestedFrom` from the caller — UI lets the user pick a year
 *     to avoid scanning since 2017 unnecessarily.
 *  2. Mode='incremental' → last completed job's FinishedAt minus 24h overlap
 *     (to absorb out-of-order events Binance emits).
 *  3. Mode='full' → BINANCE_GENESIS_DATE (2017-07-14).
 *
 * Note: we deliberately ignore the API key's createTime — that's the key's
 * timestamp, NOT the account's, and using it would make a "full" backfill
 * miss everything older than the key.
 */
export function computeSyncScope(
  mode: CryptoSyncMode,
  lastCompletedAt: Date | null,
  requestedFrom: Date | null,
): { scopeFrom: Date; scopeTo: Date } {
  const now = new Date();

  if (requestedFrom) {
    return { scopeFrom: requestedFrom, scopeTo: now };
  }

  if (mode === CRYPTO_SYNC_MODE.INCREMENTAL && lastCompletedAt) {
    const overlap = new Date(lastCompletedAt.getTime() - 24 * 60 * 60 * 1000);
    return { scopeFrom: overlap, scopeTo: now };
  }

  return { scopeFrom: new Date(BINANCE_GENESIS_DATE), scopeTo: now };
}
