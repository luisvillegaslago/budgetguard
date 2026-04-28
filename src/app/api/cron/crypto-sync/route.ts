/**
 * Vercel Cron handler — weekly incremental crypto sync.
 *
 * Triggered every Monday 05:00 UTC (see vercel.json). Validates the
 * Authorization: Bearer ${CRON_SECRET} header, then iterates every active
 * exchange credential and dispatches an incremental sync per (user, exchange).
 *
 * Runs as system context (no session). Skips users that already have a
 * pending/running job to avoid duplicate work.
 */

import { NextResponse } from 'next/server';
import { API_ERROR, CRYPTO_SYNC_MODE } from '@/constants/finance';
import {
  createSyncJobForUser,
  findActiveJobForUser,
  getLastCompletedJobForUser,
} from '@/services/database/CryptoSyncJobsRepository';
import { listAllActiveCredentials } from '@/services/database/ExchangeCredentialsRepository';
import { computeSyncScope, runSync } from '@/services/exchanges/binance/BinanceSyncService';

interface CronRunReport {
  triggered: Array<{ userId: number; exchange: string; jobId: number }>;
  skipped: Array<{ userId: number; exchange: string; reason: string }>;
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: API_ERROR.CRYPTO.UNAUTHORISED_CRON }, { status: 503 });
  }

  const auth = request.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: API_ERROR.UNAUTHORIZED }, { status: 401 });
  }

  const credentials = await listAllActiveCredentials();
  const report: CronRunReport = { triggered: [], skipped: [] };

  // Sequential: each runSync is itself parallelised internally and the cron
  // budget on Vercel free/pro is bounded; we don't want to hammer Binance
  // from N users at once.
  for (const { userId, exchange } of credentials) {
    const active = await findActiveJobForUser(userId, exchange);
    if (active) {
      report.skipped.push({ userId, exchange, reason: 'already_running' });
      continue;
    }

    const lastCompleted = await getLastCompletedJobForUser(userId, exchange);
    const lastCompletedAt = lastCompleted?.finishedAt ? new Date(lastCompleted.finishedAt) : null;
    const { scopeFrom, scopeTo } = computeSyncScope(CRYPTO_SYNC_MODE.INCREMENTAL, lastCompletedAt, null);

    const job = await createSyncJobForUser(userId, {
      exchange,
      mode: CRYPTO_SYNC_MODE.INCREMENTAL,
      scopeFrom,
      scopeTo,
    });

    // Fire-and-forget for THIS user; sequential outer loop keeps total
    // concurrent users at 1, but each user's endpoints fan out via p-limit.
    try {
      await runSync({
        userId,
        jobId: job.jobId,
        exchange,
        mode: CRYPTO_SYNC_MODE.INCREMENTAL,
        scopeFrom,
        scopeTo,
      });
      report.triggered.push({ userId, exchange, jobId: job.jobId });
    } catch (error) {
      // markJobFailed already called inside runSync
      report.skipped.push({
        userId,
        exchange,
        reason: error instanceof Error ? error.message : 'sync_threw',
      });
    }
  }

  return NextResponse.json({ success: true, data: report });
}
