/**
 * GET /api/crypto/sync/[jobId] — poll job status + progress.
 * Returns 404 if the job doesn't belong to the authenticated user.
 */

import { API_ERROR } from '@/constants/finance';
import { getJobById } from '@/services/database/CryptoSyncJobsRepository';
import { notFound, parseIdParam, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async (_request, { params }) => {
  const { jobId } = await params;
  const parsed = parseIdParam(jobId);
  if (typeof parsed !== 'number') return parsed;

  const job = await getJobById(parsed);
  if (!job) return notFound(API_ERROR.NOT_FOUND.CRYPTO_SYNC_JOB);

  return { data: job };
}, 'GET /api/crypto/sync/[jobId]');
