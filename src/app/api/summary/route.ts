/**
 * BudgetGuard Summary API
 * GET /api/summary - Get monthly summary (from SQL views)
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { MONTH_FORMAT_REGEX } from '@/constants/finance';
import { getMonthlySummary } from '@/services/database/TransactionRepository';
import { getCurrentMonth } from '@/utils/helpers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') ?? getCurrentMonth();

    // Validate month format
    if (!MONTH_FORMAT_REGEX.test(month)) {
      return NextResponse.json({ success: false, error: 'Formato de mes invalido. Usa YYYY-MM' }, { status: 400 });
    }

    const summary = await getMonthlySummary(month);

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('GET /api/summary error:', error);
    return NextResponse.json({ success: false, error: 'Error al obtener resumen' }, { status: 500 });
  }
}
