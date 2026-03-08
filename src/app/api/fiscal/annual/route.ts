/**
 * BudgetGuard Annual Fiscal API
 * GET /api/fiscal/annual?year=2025 - Get annual fiscal report (Modelo 390 + Modelo 100)
 */

import { AnnualFiscalFiltersSchema } from '@/schemas/fiscal';
import { validateRequest } from '@/schemas/transaction';
import { getModelo100Summary, getModelo390Summary } from '@/services/database/FiscalRepository';
import type { AnnualFiscalReport } from '@/types/finance';
import { validationError, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async (request) => {
  const { searchParams } = new URL(request.url);

  const filters = {
    year: searchParams.get('year') ?? undefined,
  };

  const validation = validateRequest(AnnualFiscalFiltersSchema, filters);
  if (!validation.success) return validationError(validation.errors);

  const { year } = validation.data;

  const [modelo390, modelo100] = await Promise.all([getModelo390Summary(year), getModelo100Summary(year)]);

  const report: AnnualFiscalReport = {
    fiscalYear: year,
    modelo390,
    modelo100,
  };

  return { data: report };
}, 'GET /api/fiscal/annual');
