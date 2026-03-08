/**
 * BudgetGuard Subcategory Summary API
 * GET /api/summary/subcategories?month=2025-01&categoryId=4
 * Returns drill-down breakdown for a parent category
 */

import { NextResponse } from 'next/server';
import { MONTH_FORMAT_REGEX } from '@/constants/finance';
import { getSubcategorySummary } from '@/services/database/TransactionRepository';
import { parseIdParam, withApiHandler } from '@/utils/apiHandler';
import { getCurrentMonth } from '@/utils/helpers';

export const GET = withApiHandler(async (request) => {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month') ?? getCurrentMonth();
  const categoryIdParam = searchParams.get('categoryId');

  if (!MONTH_FORMAT_REGEX.test(month)) {
    return NextResponse.json({ success: false, error: 'Formato de mes invalido. Usa YYYY-MM' }, { status: 400 });
  }

  if (!categoryIdParam) {
    return NextResponse.json({ success: false, error: 'categoryId es requerido' }, { status: 400 });
  }

  const categoryId = parseIdParam(categoryIdParam);
  if (typeof categoryId !== 'number') return categoryId;

  const subcategories = await getSubcategorySummary(month, categoryId);

  return { data: subcategories };
}, 'GET /api/summary/subcategories');
