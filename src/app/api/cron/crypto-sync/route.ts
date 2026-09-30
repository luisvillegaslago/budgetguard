/**
 * Vercel Cron handler — weekly incremental crypto sync.
 *
 * Triggered every Monday 05:00 UTC (see vercel.json). Validates the
 * Authorization: Bearer ${CRON_SECRET} header, fails the jobs failStuckJobs
 * finds stuck, then creates an incremental sync job per active (user,
 * exchange) credential and starts the first of them through
 * POST /api/crypto/sync/[jobId]/continue.
 *
 * It runs no sync itself. Each job runs in its own invocations, with its own
 * time budget and its own continuation, so one user's long sync cannot take
 * this invocation past its limit. The jobs still run one after another, as
 * they did when the cron ran them inline: Binance counts request weight per
 * IP, and each job's client keeps only its own count, so users syncing at once
 * would add up to a 429 or a 418 ban. The round that ends a job starts the next
 * one waiting (startNextQueuedSyncJob); this handler only waits for the first
 * round of the first job to be claimed.
 *
 * Runs as system context (no session). Skips users that already have a
 * pending/running job to avoid duplicate work.
 */

import { NextResponse } from 'next/server';
import {
  CRYPTO_CRON_SKIP_REASON,
  CRYPTO_SYNC_HANDOFF_OUTCOME,
  CRYPTO_SYNC_MODE,
  type CryptoExchange,
} from '@/constants/finance';
import {
  createSyncJobForUser,
  failStuckJobs,
  findActiveJobForUser,
  getLastCompletedJobForUser,
} from '@/services/database/CryptoSyncJobsRepository';
import { listAllActiveCredentials } from '@/services/database/ExchangeCredentialsRepository';
import { computeSyncScope } from '@/services/exchanges/binance/BinanceSyncService';
import { type QueuedJobStart, startNextQueuedSyncJob } from '@/services/exchanges/binance/syncRounds';
import { type SyncBudget, startSyncBudget } from '@/services/exchanges/shared/syncBudget';
import { verifyCronSecret } from '@/utils/apiHandler';

// It waits on the continue route, up to two calls per job whose first round is
// not accepted, and the budget it passes keeps those calls inside this limit.
// Next.js reads it statically, so it is a literal.
export const maxDuration = 300;

interface CronJobEntry {
  userId: number;
  exchange: string;
  jobId: number;
}

interface CronRunReport {
  // Jobs whose first round this run had claimed.
  triggered: CronJobEntry[];
  // Jobs created and waiting for their turn: the round that ends the job
  // before each one starts it.
  queued: CronJobEntry[];
  skipped: Array<{ userId: number; exchange: string; reason: string; jobId?: number }>;
}

export async function GET(request: Request) {
  // Started first: the continue calls must end before this invocation does.
  const budget = startSyncBudget();
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  // A job left pending or running by an earlier run would otherwise make
  // findActiveJobForUser skip its user every week.
  await failStuckJobs();

  const credentials = await listAllActiveCredentials();

  const report = await credentials.reduce<Promise<CronRunReport>>(
    async (previous, { userId, exchange }) => {
      const current = await previous;
      try {
        await createIncrementalJob(userId, exchange, current);
      } catch (error) {
        // One credential's database error must not keep the others from syncing.
        // biome-ignore lint/suspicious/noConsole: cron failures only reach the server log
        console.error(`Cron crypto sync for user ${userId} (${exchange}) threw:`, error);
        current.skipped.push({ userId, exchange, reason: CRYPTO_CRON_SKIP_REASON.NOT_STARTED });
      }
      return current;
    },
    Promise.resolve({ triggered: [], queued: [], skipped: [] }),
  );

  const starts = await startFirstQueuedJob(budget);
  reportStarts(report, starts);

  return NextResponse.json({ success: true, data: report });
}

/** Creates the credential's job, waiting in the queue with round 1 unclaimed. */
async function createIncrementalJob(userId: number, exchange: CryptoExchange, report: CronRunReport): Promise<void> {
  const active = await findActiveJobForUser(userId, exchange);
  if (active) {
    report.skipped.push({ userId, exchange, reason: CRYPTO_CRON_SKIP_REASON.ALREADY_RUNNING });
    return;
  }

  const lastCompleted = await getLastCompletedJobForUser(userId, exchange);
  const lastCompletedAt = lastCompleted?.finishedAt ? new Date(lastCompleted.finishedAt) : null;
  const { scopeFrom, scopeTo } = computeSyncScope(CRYPTO_SYNC_MODE.INCREMENTAL, lastCompletedAt, null);

  const job = await createSyncJobForUser(userId, {
    exchange,
    mode: CRYPTO_SYNC_MODE.INCREMENTAL,
    scopeFrom,
    scopeTo,
    awaitsContinuation: true,
  });
  report.queued.push({ userId, exchange, jobId: job.jobId });
}

async function startFirstQueuedJob(budget: SyncBudget): Promise<QueuedJobStart[]> {
  try {
    return await startNextQueuedSyncJob(budget);
  } catch (error) {
    // The jobs stay queued; failStuckJobs fails them if nothing starts them.
    // biome-ignore lint/suspicious/noConsole: cron failures only reach the server log
    console.error('Cron crypto sync could not start the first queued job:', error);
    return [];
  }
}

/** Moves each job the cron tried to start out of `queued`, to where its start left it. */
function reportStarts(report: CronRunReport, starts: QueuedJobStart[]): void {
  starts.forEach(({ userId, exchange, jobId, outcome }) => {
    report.queued = report.queued.filter((entry) => entry.jobId !== jobId);
    if (outcome === CRYPTO_SYNC_HANDOFF_OUTCOME.ACCEPTED) {
      report.triggered.push({ userId, exchange, jobId });
      return;
    }
    // A refusal means the route answered: origin and secret work, and the job
    // says why its round was not taken. Any other outcome never reached it.
    const reason =
      outcome === CRYPTO_SYNC_HANDOFF_OUTCOME.REFUSED
        ? CRYPTO_CRON_SKIP_REASON.CONTINUATION_REFUSED
        : CRYPTO_CRON_SKIP_REASON.NOT_STARTED;
    report.skipped.push({ userId, exchange, reason, jobId });
  });
}
