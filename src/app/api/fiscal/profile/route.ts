/**
 * BudgetGuard Annual Fiscal Profile API
 * GET /api/fiscal/profile?year=2026 - Annual fiscal profile (zeroed when never saved)
 * PUT /api/fiscal/profile - Create or update it
 *
 * Contributions travel in euros and are converted with eurosToCents() at this edge, the same
 * boundary the projection endpoint uses for `projectedIncome`.
 * Failures are mapped by withApiHandler: AuthError → 401 with API_ERROR.UNAUTHORIZED and any
 * other throw → 500 with API_ERROR.INTERNAL; the client falls back to
 * API_ERROR.MUTATION.UPDATE.FISCAL_PROFILE.
 */

import { AnnualFiscalFiltersSchema, FiscalProfileSchema } from '@/schemas/fiscal';
import { validateRequest } from '@/schemas/transaction';
import { getFiscalProfile, upsertFiscalProfile } from '@/services/database/FiscalProfileRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';
import { eurosToCents } from '@/utils/money';

export const GET = withApiHandler(async (request) => {
  const { searchParams } = new URL(request.url);

  const validation = validateRequest(AnnualFiscalFiltersSchema, { year: searchParams.get('year') ?? undefined });
  if (!validation.success) return validationError(validation.errors);

  const profile = await getFiscalProfile(validation.data.year);
  return { data: profile };
}, 'GET /api/fiscal/profile');

export const PUT = withApiHandler(async (request) => {
  const body = await request.json();
  const validation = validateRequest(FiscalProfileSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const { fiscalYear, pensionIndividual, pensionEmployment } = validation.data;

  const profile = await upsertFiscalProfile(fiscalYear, {
    pensionIndividualCents: eurosToCents(pensionIndividual),
    pensionEmploymentCents: eurosToCents(pensionEmployment),
  });

  return { data: profile };
}, 'PUT /api/fiscal/profile');
