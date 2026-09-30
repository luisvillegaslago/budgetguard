/**
 * POST /api/crypto/sync/[jobId]/continue — internal, body `{ round }`.
 *
 * Runs one round of a sync job in a fresh invocation, with a fresh time
 * budget. Called by the round before it when that one runs out of time, and to
 * start the first round of each job of the weekly cron's queue, by the cron or
 * by the round that ends the queued job before it. Authenticated with
 * CRON_SECRET, never a session: the round runs as the job's owner, in system
 * context like the cron.
 *
 * Answers 202 once the round is claimed and runs it in `after()`, so the caller
 * waits for the claim only. claimSyncRound is the guard: a round is claimed
 * once, and only while the job is running (pending, for the cron's first
 * round). A duplicate call, a stale round, or a job cancelled or finished
 * meanwhile gets 409 and starts nothing, as does a round whose saved state
 * cannot be read: claimSyncRound fails that job on the spot rather than leave
 * a claimed round nobody runs.
 */

import { after } from 'next/server';
import { API_ERROR } from '@/constants/finance';
import { ContinueSyncSchema } from '@/schemas/crypto';
import { validateRequest } from '@/schemas/transaction';
import { claimSyncRound } from '@/services/database/CryptoSyncJobsRepository';
import { runSync } from '@/services/exchanges/binance/BinanceSyncService';
import { startSyncBudget } from '@/services/exchanges/shared/syncBudget';
import { conflict, parseIdParam, validationError, verifyCronSecret, withApiHandler } from '@/utils/apiHandler';

// The round's budget (CRYPTO_SYNC_ROUND_BUDGET_MS) is measured against this
// limit, the plan's ceiling. Next.js reads it statically, so it is a literal.
export const maxDuration = 300;

export const POST = withApiHandler(async (request, { params }) => {
  // Started first: the round's time runs from the start of this invocation.
  const budget = startSyncBudget();

  const denied = verifyCronSecret(request);
  if (denied) return denied;

  const { jobId } = await params;
  const parsed = parseIdParam(jobId);
  if (typeof parsed !== 'number') return parsed;

  const body: unknown = await request.json().catch(() => null);
  const validation = validateRequest(ContinueSyncSchema, body);
  if (!validation.success) return validationError(validation.errors);
  const { round } = validation.data;

  const claimed = await claimSyncRound(parsed, round);
  if (!claimed) return conflict(API_ERROR.CRYPTO.SYNC_CONTINUATION_REFUSED);

  const { job, userId, resume } = claimed;
  after(async () => {
    try {
      await runSync({
        userId,
        jobId: job.jobId,
        exchange: job.exchange,
        mode: job.mode,
        scopeFrom: new Date(job.scopeFrom),
        scopeTo: new Date(job.scopeTo),
        budget,
        resume: { state: resume, progress: job.progress },
      });
    } catch (error) {
      // runSync already marked the job failed; this keeps the background
      // promise from surfacing as an unhandled rejection.
      // biome-ignore lint/suspicious/noConsole: background worker error logging
      console.error(`Sync job ${job.jobId} round ${round} failed:`, error);
    }
  });

  return { data: { jobId: job.jobId, round }, status: 202 };
}, 'POST /api/crypto/sync/[jobId]/continue');
