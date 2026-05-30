/**
 * BudgetGuard Summary Trends API
 * GET /api/summary/trends - Get multi-month income/expense/balance trends (from SQL views)
 */

import { NextResponse } from 'next/server';
import { API_ERROR, MONTH_FORMAT_REGEX } from '@/constants/finance';
import { getEarliestActivityMonth, getMonthlyTrends } from '@/services/database/TransactionRepository';
import { withApiHandler } from '@/utils/apiHandler';
import { addMonths, getCurrentMonth } from '@/utils/helpers';

// Default range: trailing 12 months ending at the current month.
const DEFAULT_RANGE_MONTHS = 11;
// Sentinel for the "all time" period — resolved to the earliest month with activity.
const ALL_TIME = 'all';

export const GET = withApiHandler(async (request) => {
  const { searchParams } = new URL(request.url);
  const toMonth = searchParams.get('toMonth') ?? getCurrentMonth();

  // Validate toMonth before deriving the default fromMonth (addMonths would throw on bad input).
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

  const trends = await getMonthlyTrends(fromMonth, toMonth);

  return { data: trends };
}, 'GET /api/summary/trends');
