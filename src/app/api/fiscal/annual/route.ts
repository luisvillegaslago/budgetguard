/**
 * BudgetGuard Annual Fiscal API
 * GET /api/fiscal/annual?year=2025 - Get annual fiscal report (Modelo 390 + Modelo 100)
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { AnnualFiscalFiltersSchema } from '@/schemas/fiscal';
import { validateRequest } from '@/schemas/transaction';
import { getModelo100Summary, getModelo390Summary } from '@/services/database/FiscalRepository';
import type { AnnualFiscalReport } from '@/types/finance';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const filters = {
      year: searchParams.get('year') ?? undefined,
    };

    const validation = validateRequest(AnnualFiscalFiltersSchema, filters);
    if (!validation.success) {
      return NextResponse.json({ success: false, errors: validation.errors }, { status: 400 });
    }

    const { year } = validation.data;

    const [modelo390, modelo100] = await Promise.all([getModelo390Summary(year), getModelo100Summary(year)]);

    const report: AnnualFiscalReport = {
      fiscalYear: year,
      modelo390,
      modelo100,
    };

    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('GET /api/fiscal/annual error:', error);
    return NextResponse.json({ success: false, error: 'Error al obtener informe fiscal anual' }, { status: 500 });
  }
}
