/**
 * POST /api/crypto/sync
 *
 * Triggers a background sync job. Returns 201 with the jobId immediately and
 * runs the actual ingestion via Next.js `after()` so the request returns
 * before any Binance call completes.
 *
 * If a job is already running for this exchange we return 409 with
 * SYNC_ALREADY_RUNNING so the UI can keep polling the existing job instead
 * of starting a duplicate run.
 */

import { after, NextResponse } from 'next/server';
import { API_ERROR, CRYPTO_EXCHANGE, type CryptoExchange } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import { StartSyncSchema } from '@/schemas/crypto';
import { validateRequest } from '@/schemas/transaction';
import {
  createSyncJob,
  findActiveJob,
  getLastCompletedJob,
  listRecentJobs,
} from '@/services/database/CryptoSyncJobsRepository';
import { getDecryptedActive } from '@/services/database/ExchangeCredentialsRepository';
import { computeSyncScope, runSync } from '@/services/exchanges/binance/BinanceSyncService';
import { conflict, notFound, validationError, withApiHandler } from '@/utils/apiHandler';

const SUPPORTED_EXCHANGES = new Set<CryptoExchange>([CRYPTO_EXCHANGE.BINANCE]);

/**
 * GET /api/crypto/sync?exchange=binance
 *
 * Returns the current active job (pending/running) for the exchange, or — if
 * no job is active — the most recent finished one. The UI calls this on mount
 * so users who navigate away and back can re-attach to a long-running sync.
 */
export const GET = withApiHandler(async (request) => {
  const url = new URL(request.url);
  const requested = url.searchParams.get('exchange') ?? CRYPTO_EXCHANGE.BINANCE;
  const exchange: CryptoExchange = SUPPORTED_EXCHANGES.has(requested as CryptoExchange)
    ? (requested as CryptoExchange)
    : CRYPTO_EXCHANGE.BINANCE;

  const active = await findActiveJob(exchange);
  if (active) return { data: active };

  // Fall back to the most recent job for this exchange (any status) so the UI
  // can show "Last sync finished at …" instead of an empty panel.
  const recent = await listRecentJobs(5);
  const latestForExchange = recent.find((job) => job.exchange === exchange);
  return { data: latestForExchange ?? null };
}, 'GET /api/crypto/sync');

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const validation = validateRequest(StartSyncSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const { exchange, mode, scopeFrom: requestedFrom } = validation.data;

  const userId = await getUserIdOrThrow();
  const credentials = await getDecryptedActive(exchange);
  if (!credentials) return notFound(API_ERROR.NOT_FOUND.CRYPTO_CREDENTIALS);

  const active = await findActiveJob(exchange);
  if (active) {
    return conflict(API_ERROR.CRYPTO.SYNC_ALREADY_RUNNING, { jobId: active.jobId });
  }

  const lastCompleted = await getLastCompletedJob(exchange);
  const lastCompletedAt = lastCompleted?.finishedAt ? new Date(lastCompleted.finishedAt) : null;
  const { scopeFrom, scopeTo } = computeSyncScope(mode, lastCompletedAt, requestedFrom ?? null);

  const job = await createSyncJob({ exchange, mode, scopeFrom, scopeTo });

  // Fire-and-forget: the sync runs after the response is sent.
  after(async () => {
    try {
      await runSync({
        userId,
        jobId: job.jobId,
        exchange,
        mode,
        scopeFrom,
        scopeTo,
      });
    } catch (error) {
      // markJobFailed already called inside runSync; just swallow here so the
      // background promise doesn't surface as an unhandled rejection.
      // biome-ignore lint/suspicious/noConsole: background worker error logging
      console.error(`Background sync job ${job.jobId} failed:`, error);
    }
  });

  return NextResponse.json(
    {
      success: true,
      data: {
        jobId: job.jobId,
        exchange: job.exchange,
        mode: job.mode,
        scopeFrom: job.scopeFrom,
        scopeTo: job.scopeTo,
        status: job.status,
      },
    },
    { status: 202 },
  );
}, 'POST /api/crypto/sync');
