/**
 * BudgetGuard Fiscal API
 * GET /api/fiscal?year=2025&quarter=1 - Get fiscal report (Modelo 303 + Modelo 130)
 */

import { FiscalReportFiltersSchema } from '@/schemas/fiscal';
import { validateRequest } from '@/schemas/transaction';
import {
  getFiscalExpenses,
  getFiscalInvoices,
  getModelo130Summary,
  getModelo303Summary,
} from '@/services/database/FiscalRepository';
import type { FiscalReport } from '@/types/finance';
import { validationError, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async (request) => {
  const { searchParams } = new URL(request.url);

  const filters = {
    year: searchParams.get('year') ?? undefined,
    quarter: searchParams.get('quarter') ?? undefined,
  };

  const validation = validateRequest(FiscalReportFiltersSchema, filters);
  if (!validation.success) return validationError(validation.errors);

  const { year, quarter } = validation.data;

  // Execute all queries in parallel for minimum latency
  const [modelo303, modelo130, expenses, invoices] = await Promise.all([
    getModelo303Summary(year, quarter),
    getModelo130Summary(year, quarter),
    getFiscalExpenses(year, quarter),
    getFiscalInvoices(year, quarter),
  ]);

  const report: FiscalReport = {
    fiscalYear: year,
    fiscalQuarter: quarter,
    modelo303,
    modelo130,
    expenses,
    invoices,
  };

  return { data: report };
}, 'GET /api/fiscal');
