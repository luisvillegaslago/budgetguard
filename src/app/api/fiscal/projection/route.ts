/**
 * BudgetGuard IRPF Projection API
 * GET /api/fiscal/projection?year=2026&projectedIncome=77237 - IRPF provision projection
 * `projectedIncome` is optional and expressed in euros (overrides the run-rate projection)
 */

import { IrpfProjectionFiltersSchema } from '@/schemas/fiscal';
import { validateRequest } from '@/schemas/transaction';
import { getIrpfProjection } from '@/services/database/FiscalRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';
import { eurosToCents } from '@/utils/money';

export const GET = withApiHandler(async (request) => {
  const { searchParams } = new URL(request.url);

  const filters = {
    year: searchParams.get('year') ?? undefined,
    // `|| undefined`, not `??`: an empty param would coerce to a 0 € override instead of
    // falling back to the run-rate projection.
    projectedIncome: searchParams.get('projectedIncome') || undefined,
  };

  const validation = validateRequest(IrpfProjectionFiltersSchema, filters);
  if (!validation.success) return validationError(validation.errors);

  const { year, projectedIncome } = validation.data;

  const projection = await getIrpfProjection(year, {
    projectedIncomeCents: projectedIncome === undefined ? undefined : eurosToCents(projectedIncome),
  });

  return { data: projection };
}, 'GET /api/fiscal/projection');
