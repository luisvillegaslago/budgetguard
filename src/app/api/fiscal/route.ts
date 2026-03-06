/**
 * BudgetGuard Fiscal API
 * GET /api/fiscal?year=2025&quarter=1 - Get fiscal report (Modelo 303 + Modelo 130)
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { FiscalReportFiltersSchema } from '@/schemas/fiscal';
import { validateRequest } from '@/schemas/transaction';
import {
  getFiscalExpenses,
  getFiscalInvoices,
  getModelo130Summary,
  getModelo303Summary,
} from '@/services/database/FiscalRepository';
import type { FiscalReport } from '@/types/finance';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const filters = {
      year: searchParams.get('year') ?? undefined,
      quarter: searchParams.get('quarter') ?? undefined,
    };

    const validation = validateRequest(FiscalReportFiltersSchema, filters);
    if (!validation.success) {
      return NextResponse.json({ success: false, errors: validation.errors }, { status: 400 });
    }

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

    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('GET /api/fiscal error:', error);
    return NextResponse.json({ success: false, error: 'Error al obtener informe fiscal' }, { status: 500 });
  }
}
