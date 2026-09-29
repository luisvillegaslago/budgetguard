/**
 * BinanceSyncService — Phase 2 orchestrator.
 *
 * Iterates the 13 Binance endpoints respecting per-endpoint window limits,
 * persists raw events idempotently and updates job progress so the UI can
 * render a real-time progress bar.
 *
 * Concurrency: p-limit(BINANCE_SYNC_CONCURRENCY) caps in-flight HTTP calls.
 * Errors:      the BinanceClient's retry loop absorbs 429/418. A task that
 *              still fails, or whose events cannot be stored, does not stop
 *              the other tasks. classifyTaskFailure decides the outcome: a
 *              transient failure ends the job failed, because the next
 *              incremental sync anchors on the last completed job and so
 *              fetches the missing windows again. A permanent one would fail
 *              the same way on every run and freeze that anchor, so a job whose
 *              only failures are permanent or resumable completes and records
 *              them instead.
 * Spot trades: an incremental sync resumes each pair right after the newest
 *              fill an earlier API sync stored, instead of walking its history
 *              from the first fill. A walk that runs out of pages still hands
 *              over the fills it walked; they are stored like any others, so
 *              the next run resumes after them.
 * Dedup:       API events whose operation a CSV import already stored are
 *              dropped with the same cross-source filter the CSV upload uses,
 *              as are rewards stored under their earlier position-based id.
 *              How many were dropped is kept in each endpoint's progress.
 */
import pLimit from 'p-limit';
import {
  API_ERROR,
  BINANCE_GENESIS_DATE,
  BINANCE_SYNC_CONCURRENCY,
  BINANCE_WINDOW_DAYS,
  CRYPTO_EVENT_TYPE,
  CRYPTO_SYNC_COMPLETED_WITH_GAPS,
  CRYPTO_SYNC_FAILURE_KIND,
  CRYPTO_SYNC_MODE,
  CRYPTO_SYNC_TASK_FAILURE,
  type CryptoEventType,
  type CryptoExchange,
  type CryptoSyncFailureKind,
  type CryptoSyncMode,
} from '@/constants/finance';
import {
  bulkInsertRawEventsForUser,
  dropCrossSourceDuplicates,
  listInteractedAssetsForUser,
  loadCrossSourceIndex,
  loadLastApiTradeIds,
  type RawEventInput,
} from '@/services/database/CryptoRawEventsRepository';
import {
  type EndpointProgress,
  isJobCancelled,
  markJobCompleted,
  markJobFailed,
  markJobRunning,
  type TaskFailureSummary,
  updateJobProgress,
} from '@/services/database/CryptoSyncJobsRepository';
import {
  type DecryptedCredentials,
  getDecryptedActiveForUser,
} from '@/services/database/ExchangeCredentialsRepository';
import { countUnnormalisedRawEventsForUser } from '@/services/database/TaxableEventsRepository';
import {
  BinanceClient,
  BinanceClientError,
  candidateSymbolsFor,
  classifyTaskFailure,
  defaultSyncBaseAssets,
  eventsFetchedBeforeFailure,
  generateWindows,
  SpotHistoryTruncatedError,
  type TaskFailureClass,
} from './BinanceClient';
import { normalizeForUser } from './NormalizationService';
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

/** A task that failed without stopping the job (fatal failures are kept apart). */
interface TaskFailure {
  eventType: CryptoEventType;
  kind: CryptoSyncFailureKind;
  code: string;
  binanceCode: number | undefined;
  symbol: string | null;
  message: string;
}

/** What storing one task's events came to, after the cross-source dedup. */
interface StoreOutcome {
  // Rows the insert added: duplicates dropped by the dedup or absorbed by the
  // UNIQUE key are not counted.
  inserted: number;
  // What the database threw when it refused the insert, as a message.
  insertFailure: string | null;
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
  const taskFailures: TaskFailure[] = [];
  let fatalError: BinanceClientError | null = null;
  let cancelled = false;

  // Cheap cancellation poll: every 30 tasks check the DB once. Avoids
  // bombarding the DB with one query per task while still aborting within a
  // few seconds of the user pressing "Stop".
  const CANCEL_CHECK_EVERY = 30;
  let tasksSinceCancelCheck = 0;

  try {
    const tasks = await buildTasks(client, input);
    // Loaded once per job: it scans every stored row of the user. Events this
    // job inserts are deliberately not added, see dropCrossSourceDuplicates.
    const crossSourceIndex = await loadCrossSourceIndex(input.userId);

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
          let taskError: { error: unknown; failure: TaskFailureClass } | null = null;
          try {
            events = await task.execute();
          } catch (error) {
            // A spot walk that ran out of pages hands over the fills it walked.
            // They go through the same dedup and insert as any other events,
            // so the next incremental sync resumes after the newest of them.
            events = eventsFetchedBeforeFailure(error);
            const failure = classifyTaskFailure(error);
            if (failure.kind === CRYPTO_SYNC_FAILURE_KIND.FATAL) {
              reportTaskFailure(task.eventType, failure, error);
              // Only a BinanceClientError is ever classified FATAL.
              fatalError = error instanceof BinanceClientError ? error : null;
              return;
            }
            taskError = { error, failure };
          }

          const { kept, skipped } = dropCrossSourceDuplicates(crossSourceIndex, events);
          const stored: StoreOutcome = { inserted: 0, insertFailure: null };
          if (kept.length > 0) {
            try {
              stored.inserted = await bulkInsertRawEventsForUser(input.userId, kept, input.jobId);
              totalIngested += stored.inserted;
            } catch (insertError) {
              stored.insertFailure = insertError instanceof Error ? insertError.message : String(insertError);
            }
          }

          // Classified once the walked fills went through the dedup and the
          // insert, since whether the next run continues depends on what was
          // actually stored.
          if (taskError !== null) {
            const failure = confirmResumableWalk(taskError.failure, taskError.error, task.storedTradeId, stored);
            reportTaskFailure(task.eventType, failure, taskError.error);
            taskFailures.push({
              eventType: task.eventType,
              kind: failure.kind,
              code: failure.code,
              binanceCode: taskError.error instanceof BinanceClientError ? taskError.error.binanceCode : undefined,
              symbol: task.symbol ?? null,
              message: taskError.error instanceof Error ? taskError.error.message : String(taskError.error),
            });
          }
          if (stored.insertFailure !== null) {
            // The database refused them, not Binance: a later run stores them.
            taskFailures.push({
              eventType: task.eventType,
              kind: CRYPTO_SYNC_FAILURE_KIND.TRANSIENT,
              code: CRYPTO_SYNC_TASK_FAILURE.INSERT_FAILED,
              binanceCode: undefined,
              symbol: task.symbol ?? null,
              message: stored.insertFailure,
            });
          }

          const endpointProgress = progress[task.eventType] ?? emptyProgress();
          endpointProgress.fetched += events.length;
          if (skipped > 0) endpointProgress.duplicatesSkipped = (endpointProgress.duplicatesSkipped ?? 0) + skipped;
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
      syncDebug.endpointSummary(
        endpoint,
        p.fetched,
        failuresByEndpoint[endpoint] ?? 0,
        p.totalWindows,
        p.duplicatesSkipped ?? 0,
      );
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

    const failures = await confirmEndpointRefusals(client, taskFailures);
    const transientFailures = failures.filter((f) => f.kind === CRYPTO_SYNC_FAILURE_KIND.TRANSIENT);
    // Gaps a retry of the same windows would not fill: permanent ones repeat on
    // every run, resumable ones are already stored as far as they got.
    const gapFailures = failures.filter(
      (f) => f.kind === CRYPTO_SYNC_FAILURE_KIND.PERMANENT || f.kind === CRYPTO_SYNC_FAILURE_KIND.RESUMABLE,
    );
    attachGaps(progress, gapFailures);
    await updateJobProgress(input.jobId, progress, totalIngested);

    // Normalise raw → taxable BEFORE marking the job as completed, so the UI
    // shows the work in progress. Tolerant: failures here are logged but
    // never demote the sync from 'completed' — the next sync picks up
    // anything missed thanks to the LEFT-JOIN-on-RawEventID query.
    try {
      const totalToNormalize = await countUnnormalisedRawEventsForUser(input.userId);
      if (totalToNormalize > 0) {
        // Surface as a synthetic endpoint in the progress map so the
        // existing UI progress bar covers normalization automatically.
        progress.normalize = {
          fetched: 0,
          totalWindows: totalToNormalize,
          completedWindows: 0,
          lastWindowEnd: null,
        };
        await updateJobProgress(input.jobId, progress, totalIngested);

        const normalizeResult = await normalizeForUser(input.userId, async (processed, inserted) => {
          progress.normalize = {
            fetched: inserted,
            totalWindows: totalToNormalize,
            completedWindows: Math.min(processed, totalToNormalize),
            lastWindowEnd: new Date().toISOString(),
          };
          await updateJobProgress(input.jobId, progress, totalIngested + inserted);
        });

        // biome-ignore lint/suspicious/noConsole: surface normalize summary in dev logs
        console.log(
          `Sync job ${input.jobId} normalized ${normalizeResult.inserted} taxable events ` +
            `(${normalizeResult.processed} processed, ${normalizeResult.skipped} skipped, ${normalizeResult.failed} failed)`,
        );
      }
    } catch (normError) {
      // biome-ignore lint/suspicious/noConsole: surface in dev logs
      console.error(`Sync job ${input.jobId} post-sync normalize threw:`, normError);
    }

    if (transientFailures.length > 0) {
      // Some windows were not fetched or not stored and a later run can fetch
      // them. Whatever did come in stays (every insert is idempotent), but the
      // job must not read as completed: the UI would show a green check over
      // missing disposals and rewards, and the next incremental sync would
      // start after the windows that failed.
      const summary = summariseFailures(failures);
      await markJobFailed(input.jobId, API_ERROR.CRYPTO.SYNC_FAILED, summary);
      // biome-ignore lint/suspicious/noConsole: surface the failing endpoints and their raw errors in the server log
      console.warn(
        `Sync job ${input.jobId} failed with ${failures.length} task failures:\n${summary}\n` +
          failures.map((f) => `  ${f.eventType}: ${f.message}`).join('\n'),
      );
      syncDebug.jobEnd(input.jobId, 'failed', totalIngested, failures.length);
    } else if (gapFailures.length > 0) {
      // Failing the job would not bring these either: a permanent one fails the
      // same way on every run, and a resumable one continues from what it
      // stored, whatever the anchor. Failing would keep the incremental anchor
      // where it is and re-fetch every other window each week, so the job
      // completes and records the gaps for the panel.
      const summary = summariseFailures(gapFailures);
      await markJobCompleted(input.jobId, { code: CRYPTO_SYNC_COMPLETED_WITH_GAPS, message: summary });
      // biome-ignore lint/suspicious/noConsole: surface the gaps a retry of the same windows will not fill in the server log
      console.warn(`Sync job ${input.jobId} completed with ${gapFailures.length} gaps:\n${summary}`);
      syncDebug.jobEnd(input.jobId, 'completed', totalIngested, gapFailures.length);
    } else {
      await markJobCompleted(input.jobId);
      syncDebug.jobEnd(input.jobId, 'completed', totalIngested, 0);
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

function countFailuresByEndpoint(failures: TaskFailure[]): Record<string, number> {
  const counts: Record<string, number> = {};
  failures.forEach((f) => {
    counts[f.eventType] = (counts[f.eventType] ?? 0) + 1;
  });
  return counts;
}

/**
 * One line per endpoint, failure code and Binance code, with the spot pairs it
 * hit. The Binance code is what a new permanent failure would be recognised
 * by, so it is kept in the message the user and the log both see.
 */
function summariseFailures(failures: TaskFailure[]): string {
  const grouped = new Map<string, { count: number; symbols: string[] }>();
  failures.forEach((f) => {
    const binance = f.binanceCode == null ? '' : ` (binance ${f.binanceCode})`;
    const key = `${f.eventType}/${f.code}${binance}`;
    const entry = grouped.get(key) ?? { count: 0, symbols: [] };
    entry.count += 1;
    if (f.symbol !== null) entry.symbols.push(f.symbol);
    grouped.set(key, entry);
  });
  return Array.from(grouped.entries())
    .map(([key, { count, symbols }]) => `  ${key} ×${count}${symbols.length > 0 ? `: ${symbols.join(', ')}` : ''}`)
    .join('\n');
}

/**
 * classifyTaskFailure trusts a -2015 as "this endpoint is closed to this key"
 * because spot discovery got through GET /api/v3/account before any task ran.
 * A key revoked, or an IP whitelist changed, while the job was running gives
 * the same code, and completing the job would then move the incremental anchor
 * past data a later run could fetch. So the key is asked once more; if it is
 * no longer accepted, those failures count as transient.
 */
async function confirmEndpointRefusals(client: BinanceClient, failures: TaskFailure[]): Promise<TaskFailure[]> {
  const isRefusal = (f: TaskFailure) =>
    f.kind === CRYPTO_SYNC_FAILURE_KIND.PERMANENT && f.code === CRYPTO_SYNC_TASK_FAILURE.ENDPOINT_NOT_PERMITTED;
  if (!failures.some(isRefusal) || (await client.isKeyAccepted())) return failures;
  return failures.map((f) => (isRefusal(f) ? { ...f, kind: CRYPTO_SYNC_FAILURE_KIND.TRANSIENT } : f));
}

function reportTaskFailure(eventType: CryptoEventType, failure: TaskFailureClass, error: unknown): void {
  const binanceError = error instanceof BinanceClientError ? error : null;
  syncDebug.taskFailure(eventType, {
    code: failure.code,
    binanceCode: binanceError?.binanceCode,
    statusCode: binanceError?.statusCode,
    cause: binanceError ? binanceError.cause : error,
  });
}

/**
 * classifyTaskFailure calls a walk that ran out of pages after walking fills
 * resumable: the next incremental sync resumes after the newest fill the API
 * stored for the pair. That continues this walk only if both hold:
 * - The walk reached the fills already stored. A full sync walks from the
 *   first fill, and on a pair whose newest fills an earlier run stored (every
 *   API sync before 2026-09-29 stored only the newest ~1000 per pair) it can
 *   stop below them. The next run then starts above those stored fills, and no
 *   run fetches the ones in between.
 * - The walk stored at least one fill. The walked fills go through the
 *   cross-source dedup first, and those a CSV import already holds are
 *   dropped; when that is every one of them, the resume point does not move
 *   and each run walks the same pages into the same cap.
 * Otherwise the gap is permanent, to be imported by CSV. When the insert
 * itself failed the walk stays resumable: that failure is transient, it fails
 * the job, and the next run stores the same fills.
 */
function confirmResumableWalk(
  failure: TaskFailureClass,
  error: unknown,
  storedTradeId: number | undefined,
  stored: StoreOutcome,
): TaskFailureClass {
  if (failure.kind !== CRYPTO_SYNC_FAILURE_KIND.RESUMABLE) return failure;
  const reachedStoredFills =
    storedTradeId == null || (error instanceof SpotHistoryTruncatedError && error.newestWalkedId >= storedTradeId);
  const advancesResumePoint = stored.inserted > 0 || stored.insertFailure !== null;
  if (reachedStoredFills && advancesResumePoint) return failure;
  return { kind: CRYPTO_SYNC_FAILURE_KIND.PERMANENT, code: CRYPTO_SYNC_TASK_FAILURE.HISTORY_TRUNCATED };
}

/**
 * Records each endpoint's gaps in its Progress entry, for the sync panel:
 * permanent ones in `permanentFailures`, resumable ones in `resumableFailures`,
 * because the panel tells the user to import a CSV for the first and to wait
 * for the next sync for the second.
 */
function attachGaps(progress: ProgressMap, failures: TaskFailure[]): void {
  failures.forEach((f) => {
    const endpoint = progress[f.eventType] ?? emptyProgress();
    const resumable = f.kind === CRYPTO_SYNC_FAILURE_KIND.RESUMABLE;
    const summaries: TaskFailureSummary[] = (resumable ? endpoint.resumableFailures : endpoint.permanentFailures) ?? [];
    const summary = summaries.find((s) => s.code === f.code);
    if (summary) {
      summary.count += 1;
      if (f.symbol !== null) summary.symbols.push(f.symbol);
    } else {
      summaries.push({ code: f.code, count: 1, symbols: f.symbol === null ? [] : [f.symbol] });
    }
    if (resumable) endpoint.resumableFailures = summaries;
    else endpoint.permanentFailures = summaries;
    progress[f.eventType] = endpoint;
  });
}

// ============================================================
// Task building
// ============================================================

interface SyncTask {
  eventType: CryptoEventType;
  windowEnd: Date;
  // The spot pair of a myTrades task, named in its failure so the user knows
  // which pair to import by CSV. Windowed endpoints leave it out.
  symbol?: string;
  // The newest fill an earlier API sync stored for that pair, in both modes,
  // which the next incremental sync resumes after (see confirmResumableWalk).
  storedTradeId?: number;
  execute: () => Promise<RawEventInput[]>;
}

async function buildTasks(client: BinanceClient, input: RunSyncInput): Promise<SyncTask[]> {
  const { scopeFrom, scopeTo } = input;
  const tasks: SyncTask[] = [];

  // Spot trades — ONE task per candidate symbol. Internally fetchSpotTrades
  // paginates with `fromId` until the scope is covered (or returns empty
  // immediately for pairs the user never touched). An incremental sync hands
  // it the newest fill an earlier API sync stored for the pair, so the walk
  // resumes there instead of at the pair's first fill. A full sync keeps
  // walking from the first fill: it is how a hole below the newest stored fill
  // gets filled.
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
  // Every pair an earlier API sync stored fills for is added on top, in both
  // modes: once its base asset is sold off it is in none of the three sources,
  // and its later fills (the sale among them) would never be fetched again.
  const [allCoins, dbAssets, heldAssets, storedTradeIds] = await Promise.all([
    safeDiscoverAllCoins(client),
    listInteractedAssetsForUser(input.userId),
    client.discoverHeldAssets(),
    loadLastApiTradeIds(input.userId),
  ]);
  const resumeFrom = input.mode === CRYPTO_SYNC_MODE.INCREMENTAL ? storedTradeIds : new Map<string, number>();
  const baseAssets = unique([...allCoins, ...dbAssets, ...defaultSyncBaseAssets(heldAssets)]);
  syncDebug.discovery({ allCoins, dbAssets, heldAssets, merged: baseAssets });
  const candidatePairs = unique([...baseAssets.flatMap(candidateSymbolsFor), ...storedTradeIds.keys()]);
  candidatePairs.forEach((symbol) => {
    tasks.push({
      eventType: CRYPTO_EVENT_TYPE.SPOT_TRADE,
      windowEnd: scopeTo,
      symbol,
      storedTradeId: storedTradeIds.get(symbol),
      execute: () => client.fetchSpotTrades(symbol, scopeFrom.getTime(), scopeTo.getTime(), resumeFrom.get(symbol)),
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
