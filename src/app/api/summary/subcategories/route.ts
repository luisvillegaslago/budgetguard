/**
 * BudgetGuard Subcategory Summary API
 * GET /api/summary/subcategories?month=2025-01&categoryId=4
 * Returns drill-down breakdown for a parent category
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { MONTH_FORMAT_REGEX } from '@/constants/finance';
import { getSubcategorySummary } from '@/services/database/TransactionRepository';
import { getCurrentMonth } from '@/utils/helpers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') ?? getCurrentMonth();
    const categoryIdParam = searchParams.get('categoryId');

    if (!MONTH_FORMAT_REGEX.test(month)) {
      return NextResponse.json({ success: false, error: 'Formato de mes invalido. Usa YYYY-MM' }, { status: 400 });
    }

    if (!categoryIdParam) {
      return NextResponse.json({ success: false, error: 'categoryId es requerido' }, { status: 400 });
    }

    const categoryId = Number.parseInt(categoryIdParam, 10);
    if (Number.isNaN(categoryId) || categoryId <= 0) {
      return NextResponse.json({ success: false, error: 'categoryId invalido' }, { status: 400 });
    }

    const subcategories = await getSubcategorySummary(month, categoryId);

    return NextResponse.json({
      success: true,
      data: subcategories,
    });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('GET /api/summary/subcategories error:', error);
    return NextResponse.json({ success: false, error: 'Error al obtener resumen de subcategorias' }, { status: 500 });
  }
}
