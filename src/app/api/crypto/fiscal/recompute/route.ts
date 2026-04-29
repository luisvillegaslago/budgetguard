/**
 * POST /api/crypto/fiscal/recompute
 *
 * Body:
 *   - {} or { year: undefined } → recompute EVERY year that has data
 *   - { year: 2025 }            → recompute just that year
 *
 * "All years" is the default because most rule changes (transfer_in basis,
 * stablecoin classification, normalizer fixes) propagate cost basis across
 * every year — recomputing one year in isolation leaves the others stale.
 *
 * Idempotent: same inputs → same outputs (FIFO is deterministic).
 */

import { z } from 'zod';
import { getUserIdOrThrow } from '@/libs/auth';
import { validateRequest } from '@/schemas/transaction';
import { recomputeAllYearsForUser, recomputeYearForUser } from '@/services/database/CryptoFiscalRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';

const RecomputeSchema = z.object({
  year: z.number().int().min(2000).max(2100).optional(),
});

export const POST = withApiHandler(async (request) => {
  const body = await request.json().catch(() => ({}));
  const validation = validateRequest(RecomputeSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const userId = await getUserIdOrThrow();

  if (validation.data.year != null) {
    const result = await recomputeYearForUser(userId, validation.data.year);
    return { data: { mode: 'year', ...result, years: [result] } };
  }

  const result = await recomputeAllYearsForUser(userId);
  return { data: { mode: 'all', ...result } };
}, 'POST /api/crypto/fiscal/recompute');
