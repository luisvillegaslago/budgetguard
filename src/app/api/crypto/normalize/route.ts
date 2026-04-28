/**
 * POST /api/crypto/normalize
 *
 * Manually trigger the normalization pass for the authenticated user.
 * Idempotent: only un-normalised raw events are processed. Returns the
 * counts (processed, inserted, skipped, failed) and the first 10 failures
 * for diagnostic purposes.
 *
 * This is also auto-triggered at the end of every successful sync, so
 * normally users don't need to call this directly. Kept around for the
 * "re-process everything after a classifier change" admin flow.
 */

import { getUserIdOrThrow } from '@/libs/auth';
import { normalizeForUser } from '@/services/exchanges/binance/NormalizationService';
import { withApiHandler } from '@/utils/apiHandler';

export const POST = withApiHandler(async () => {
  const userId = await getUserIdOrThrow();
  const result = await normalizeForUser(userId);
  return {
    data: {
      processed: result.processed,
      inserted: result.inserted,
      skipped: result.skipped,
      failed: result.failed,
      failures: result.failures.slice(0, 10),
    },
  };
}, 'POST /api/crypto/normalize');
