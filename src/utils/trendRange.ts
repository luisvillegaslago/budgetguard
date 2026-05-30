/**
 * Shared trend-range resolution for the /api/summary/* trends endpoints.
 * Centralizes month validation, the "all time" sentinel and the default range so
 * the trends and category-trends routes don't duplicate the logic.
 */

import { NextResponse } from 'next/server';
import { API_ERROR, MONTH_FORMAT_REGEX, TREND_ALL_SENTINEL, TREND_DEFAULT_RANGE_MONTHS } from '@/constants/finance';
import { getEarliestActivityMonth } from '@/services/database/TransactionRepository';
import { addMonths, getCurrentMonth } from '@/utils/helpers';

export interface TrendRange {
  fromMonth: string;
  toMonth: string;
}

function invalidMonth(): NextResponse {
  return NextResponse.json({ success: false, error: API_ERROR.VALIDATION.INVALID_MONTH }, { status: 400 });
}

/**
 * Resolve { fromMonth, toMonth } from request params, or a 400 NextResponse when
 * a month is malformed. `fromMonth=all` resolves to the earliest month with activity.
 */
export async function resolveTrendRangeFromParams(searchParams: URLSearchParams): Promise<TrendRange | NextResponse> {
  const toMonth = searchParams.get('toMonth') ?? getCurrentMonth();

  // Validate toMonth before deriving the default fromMonth (addMonths would throw on bad input).
  if (!MONTH_FORMAT_REGEX.test(toMonth)) return invalidMonth();

  const rawFrom = searchParams.get('fromMonth');
  const fromMonth =
    rawFrom === TREND_ALL_SENTINEL
      ? ((await getEarliestActivityMonth()) ?? addMonths(toMonth, -TREND_DEFAULT_RANGE_MONTHS))
      : (rawFrom ?? addMonths(toMonth, -TREND_DEFAULT_RANGE_MONTHS));

  if (!MONTH_FORMAT_REGEX.test(fromMonth)) return invalidMonth();

  return { fromMonth, toMonth };
}
