/**
 * BudgetGuard Summary API
 * GET /api/summary?month=YYYY-MM - Monthly summary (from SQL views)
 * GET /api/summary?year=YYYY     - Yearly summary, same shape, rolled up from the same views
 */

import { NextResponse } from 'next/server';
import { API_ERROR, MONTH_FORMAT_REGEX, YEAR_FORMAT_REGEX } from '@/constants/finance';
import { getMonthlySummary, getYearlySummary } from '@/services/database/TransactionRepository';
import { withApiHandler } from '@/utils/apiHandler';
import { getCurrentMonth } from '@/utils/helpers';

export const GET = withApiHandler(async (request) => {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get('year');

  // The year lens takes precedence: a request carrying ?year= never falls back to a month.
  if (year !== null) {
    if (!YEAR_FORMAT_REGEX.test(year)) {
      return NextResponse.json({ success: false, error: API_ERROR.VALIDATION.INVALID_YEAR }, { status: 400 });
    }

    return { data: await getYearlySummary(year) };
  }

  const month = searchParams.get('month') ?? getCurrentMonth();

  if (!MONTH_FORMAT_REGEX.test(month)) {
    return NextResponse.json({ success: false, error: API_ERROR.VALIDATION.INVALID_MONTH }, { status: 400 });
  }

  const summary = await getMonthlySummary(month);

  return { data: summary };
}, 'GET /api/summary');
