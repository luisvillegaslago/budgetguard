/**
 * BudgetGuard Deferrals (aplazamientos/fraccionamientos AEAT) API
 * GET  /api/fiscal/deferrals?year=2026&modeloType=130 - Stored resolutions, most recent period first
 * POST /api/fiscal/deferrals - Import a confirmed resolution: the letter + its pending instalments
 *
 * Amounts travel in CENTS here, unlike every other module: this payload is a machine reading a
 * printed table, not a human typing euros, so there is no euro edge to convert (see
 * src/schemas/deferral.ts). CreateDeferralSchema is the arithmetic gate — it checks the letter
 * against itself and rejects a payload whose fracciones do not add up to its own totals row.
 *
 * Failures are mapped by withApiHandler: AuthError → 401, ConflictError → 409 (the same expediente
 * imported twice), NotFoundError → 404, anything else → 500.
 */

import { CreateDeferralSchema, DeferralFiltersSchema } from '@/schemas/deferral';
import { validateRequest } from '@/schemas/transaction';
import { importDeferral } from '@/services/DeferralImportService';
import { getDeferrals } from '@/services/database/DeferralRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async (request) => {
  const { searchParams } = new URL(request.url);

  const validation = validateRequest(DeferralFiltersSchema, {
    year: searchParams.get('year') ?? undefined,
    modeloType: searchParams.get('modeloType') ?? undefined,
  });
  if (!validation.success) return validationError(validation.errors);

  const deferrals = await getDeferrals(validation.data);
  return { data: deferrals, meta: { count: deferrals.length } };
}, 'GET /api/fiscal/deferrals');

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const validation = validateRequest(CreateDeferralSchema, body);
  if (!validation.success) return validationError(validation.errors);

  // The letter and every instalment it books land in one transaction: a resolution with half its
  // fracciones booked is worse than none. The verdict travels back with them — it can report an
  // interés that does not match its own days even though the totals reconcile.
  const result = await importDeferral(validation.data);
  return { data: result, status: 201 };
}, 'POST /api/fiscal/deferrals');
