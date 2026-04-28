/**
 * POST /api/crypto/fiscal/recompute
 *
 * Body: { year: number }
 *
 * Triggers a full FIFO recomputation for the given fiscal year. Reads
 * every TaxableEvent up to the end of `year`, runs FIFO from genesis,
 * and atomically replaces the CryptoDisposals rows for that year.
 *
 * Idempotent: calling twice in a row yields the same disposals (FIFO is
 * deterministic given the same input set).
 */

import { z } from 'zod';
import { getUserIdOrThrow } from '@/libs/auth';
import { validateRequest } from '@/schemas/transaction';
import { recomputeYearForUser } from '@/services/database/CryptoFiscalRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';

const RecomputeSchema = z.object({
  year: z.number().int().min(2000).max(2100),
});

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const validation = validateRequest(RecomputeSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const userId = await getUserIdOrThrow();
  const result = await recomputeYearForUser(userId, validation.data.year);
  return { data: result };
}, 'POST /api/crypto/fiscal/recompute');
