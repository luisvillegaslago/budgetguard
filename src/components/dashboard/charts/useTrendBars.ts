'use client';

/**
 * useTrendBars
 * Shared data source for the dashboard time-series charts (cash flow + cumulative balance).
 * Resolves the date range from the selected period, fetches formatted trends, and
 * auto-switches granularity (monthly for short spans, yearly for long ones).
 */

import { useMemo } from 'react';
import { TREND_PERIOD, type TrendPeriod } from '@/constants/finance';
import { useFormattedSummaryTrends } from '@/hooks/useSummaryTrends';
import { useTranslate } from '@/hooks/useTranslations';
import type { FormattedTrendPoint } from '@/types/finance';
import { addMonths, formatMonthShort, getCurrentMonth } from '@/utils/helpers';
import { formatEuroValue } from './chartConfig';

// Sentinel understood by the trends endpoint as "earliest month with activity".
const ALL_TIME = 'all';

// Inclusive month offsets per preset (1 year = 12 months → offset 11).
const PERIOD_OFFSET: Record<Exclude<TrendPeriod, 'all'>, number> = {
  [TREND_PERIOD.ONE_YEAR]: 11,
  [TREND_PERIOD.FIVE_YEARS]: 59,
  [TREND_PERIOD.TEN_YEARS]: 119,
};

// Above this many months, bars are aggregated by year to stay readable.
export const MONTHLY_MAX_BARS = 24;

export type TrendGranularity = 'month' | 'year';

/**
 * Resolve the [fromMonth, toMonth] range for a period preset.
 * Historical charts always end at the current month; "all" is a sentinel the
 * endpoint resolves to the earliest month with activity.
 */
export function resolveTrendRange(period: TrendPeriod): { fromMonth: string; toMonth: string } {
  const toMonth = getCurrentMonth();
  const fromMonth = period === TREND_PERIOD.ALL ? ALL_TIME : addMonths(toMonth, -PERIOD_OFFSET[period]);
  return { fromMonth, toMonth };
}

export interface YearBucket {
  year: string;
  income: number;
  expense: number;
  balance: number;
  cumulative: number;
}

export interface TrendBar {
  key: string;
  label: string;
  income: number;
  expense: number;
  balance: number;
  cumulative: number;
  incomeLabel: string;
  expenseLabel: string;
  balanceLabel: string;
  cumulativeLabel: string;
}

/**
 * Aggregate sorted monthly points into yearly buckets with a running cumulative balance.
 * Assumes points are ordered ascending by month (as returned by the API).
 */
export function aggregateByYear(points: FormattedTrendPoint[]): YearBucket[] {
  const buckets: Array<{ year: string; income: number; expense: number; balance: number }> = [];

  points.forEach((point) => {
    const year = point.month.slice(0, 4);
    const last = buckets[buckets.length - 1];
    if (last && last.year === year) {
      last.income += point.incomeValue;
      last.expense += point.expenseValue;
      last.balance += point.balanceValue;
    } else {
      buckets.push({ year, income: point.incomeValue, expense: point.expenseValue, balance: point.balanceValue });
    }
  });

  let cumulative = 0;
  return buckets.map((bucket) => {
    cumulative += bucket.balance;
    return { ...bucket, cumulative };
  });
}

export function useTrendBars(period: TrendPeriod) {
  const { locale } = useTranslate();
  const { fromMonth, toMonth } = resolveTrendRange(period);

  const query = useFormattedSummaryTrends(fromMonth, toMonth);
  const points = query.formatted?.points ?? [];
  const granularity: TrendGranularity = points.length > MONTHLY_MAX_BARS ? 'year' : 'month';

  const bars = useMemo<TrendBar[]>(() => {
    if (points.length === 0) return [];

    if (granularity === 'month') {
      return points.map((point) => ({
        key: point.month,
        label: formatMonthShort(point.month, locale),
        income: point.incomeValue,
        expense: point.expenseValue,
        balance: point.balanceValue,
        cumulative: point.cumulativeBalanceValue,
        incomeLabel: point.income,
        expenseLabel: point.expense,
        balanceLabel: point.balance,
        cumulativeLabel: formatEuroValue(point.cumulativeBalanceValue),
      }));
    }

    return aggregateByYear(points).map((bucket) => ({
      key: bucket.year,
      label: bucket.year,
      income: bucket.income,
      expense: bucket.expense,
      balance: bucket.balance,
      cumulative: bucket.cumulative,
      incomeLabel: formatEuroValue(bucket.income),
      expenseLabel: formatEuroValue(bucket.expense),
      balanceLabel: formatEuroValue(bucket.balance),
      cumulativeLabel: formatEuroValue(bucket.cumulative),
    }));
  }, [points, granularity, locale]);

  return {
    bars,
    granularity,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
