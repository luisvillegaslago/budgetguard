/**
 * BudgetGuard Fixed Assets (inmovilizado) API
 * GET  /api/fiscal/assets?year=2026 - Assets with a dotación in that fiscal year (all when omitted)
 * POST /api/fiscal/assets - Register an asset whose cost is spread over its useful life
 *
 * The amortizable base travels in euros and is converted with eurosToCents() at this edge, like
 * every other module. Nothing here computes a dotación: that is derived on read from the base, the
 * in-service date and the rate (src/utils/amortization.ts), so no yearly figure can drift.
 * Failures are mapped by withApiHandler: AuthError → 401, anything else → 500.
 */

import { CreateFixedAssetSchema, FixedAssetFiltersSchema } from '@/schemas/fixed-asset';
import { validateRequest } from '@/schemas/transaction';
import { createFixedAsset, getFixedAssets } from '@/services/database/FixedAssetRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';
import { eurosToCents } from '@/utils/money';

export const GET = withApiHandler(async (request) => {
  const { searchParams } = new URL(request.url);

  const validation = validateRequest(FixedAssetFiltersSchema, { year: searchParams.get('year') ?? undefined });
  if (!validation.success) return validationError(validation.errors);

  const assets = await getFixedAssets(validation.data.year);
  return { data: assets, meta: { count: assets.length } };
}, 'GET /api/fiscal/assets');

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const validation = validateRequest(CreateFixedAssetSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const { baseAmount, inServiceDate, amortizationGroup, transactionId, notes, ...rest } = validation.data;

  const asset = await createFixedAsset({
    ...rest,
    baseCents: eurosToCents(baseAmount),
    // The coerced date is a UTC instant; the column is a calendar day, so keep the UTC day
    inServiceDate: inServiceDate.toISOString().split('T')[0]!,
    // An omitted optional is stored as NULL: no group means the rate does not come from the tabla
    amortizationGroup: amortizationGroup ?? null,
    transactionId: transactionId ?? null,
    notes: notes ?? null,
  });

  return { data: asset, status: 201 };
}, 'POST /api/fiscal/assets');
