/**
 * POST /api/crypto/sync/[jobId]/cancel
 *
 * Marks a pending/running sync job as cancelled. The background worker polls
 * `isJobCancelled` between tasks and aborts cleanly. Already-finished jobs
 * (completed/failed/cancelled) return 404.
 */

import { API_ERROR } from '@/constants/finance';
import { cancelJob } from '@/services/database/CryptoSyncJobsRepository';
import { notFound, parseIdParam, withApiHandler } from '@/utils/apiHandler';

export const POST = withApiHandler(async (_request, { params }) => {
  const { jobId } = await params;
  const parsed = parseIdParam(jobId);
  if (typeof parsed !== 'number') return parsed;

  const cancelled = await cancelJob(parsed);
  if (!cancelled) return notFound(API_ERROR.NOT_FOUND.CRYPTO_SYNC_JOB);

  return { data: { jobId: parsed, cancelled: true } };
}, 'POST /api/crypto/sync/[jobId]/cancel');
