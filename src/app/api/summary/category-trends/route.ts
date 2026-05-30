/**
 * BudgetGuard Category Trends API
 * GET /api/summary/category-trends - Per-category expense totals across a month range
 */

import { NextResponse } from 'next/server';
import { API_ERROR, MONTH_FORMAT_REGEX } from '@/constants/finance';
import { getCategoryTrends, getEarliestActivityMonth } from '@/services/database/TransactionRepository';
import { withApiHandler } from '@/utils/apiHandler';
import { addMonths, getCurrentMonth } from '@/utils/helpers';

const DEFAULT_RANGE_MONTHS = 11;
const ALL_TIME = 'all';

export const GET = withApiHandler(async (request) => {
  const { searchParams } = new URL(request.url);
  const toMonth = searchParams.get('toMonth') ?? getCurrentMonth();

  if (!MONTH_FORMAT_REGEX.test(toMonth)) {
    return NextResponse.json({ success: false, error: API_ERROR.VALIDATION.INVALID_MONTH }, { status: 400 });
  }

  const rawFrom = searchParams.get('fromMonth');
  const fromMonth =
    rawFrom === ALL_TIME
      ? ((await getEarliestActivityMonth()) ?? addMonths(toMonth, -DEFAULT_RANGE_MONTHS))
      : (rawFrom ?? addMonths(toMonth, -DEFAULT_RANGE_MONTHS));

  if (!MONTH_FORMAT_REGEX.test(fromMonth)) {
    return NextResponse.json({ success: false, error: API_ERROR.VALIDATION.INVALID_MONTH }, { status: 400 });
  }

  const trends = await getCategoryTrends(fromMonth, toMonth);

  return { data: trends };
}, 'GET /api/summary/category-trends');
