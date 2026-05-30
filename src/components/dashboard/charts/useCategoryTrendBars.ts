'use client';

/**
 * useCategoryTrendBars
 * Pivots per-category expense rows into stacked-area chart data for the selected period,
 * keeping the top-N categories and bucketing the rest into "Others". Auto-switches
 * monthly/yearly granularity, mirroring useTrendBars.
 */

import { useMemo } from 'react';
import type { TrendPeriod } from '@/constants/finance';
import { useCategoryTrends } from '@/hooks/useCategoryTrends';
import { useTranslate } from '@/hooks/useTranslations';
import type { CategoryTrendRow } from '@/types/finance';
import { addMonths, formatMonthShort } from '@/utils/helpers';
import { CATEGORY_PALETTE, CHART_COLORS } from './chartConfig';
import { MONTHLY_MAX_BARS, resolveTrendRange, type TrendGranularity } from './useTrendBars';

const TOP_N = 6;
const MAX_BUCKETS = 600;
const OTHERS_KEY = 'others';

export interface CategorySeries {
  key: string;
  name: string;
  color: string;
}

export interface PivotSeries {
  key: string;
  categoryId: number | null;
  name: string;
  color: string | null;
}

export interface PivotBucket {
  bucket: string;
  values: Record<string, number>; // cents, keyed by series key
}

/**
 * Pure pivot: rows → top-N category series (+ "others") and per-bucket cent totals.
 * `months` is the full ordered month sequence (zero-fill base); buckets derive from granularity.
 */
export function pivotCategoryTrends(
  rows: CategoryTrendRow[],
  months: string[],
  granularity: TrendGranularity,
  topN: number,
): { series: PivotSeries[]; data: PivotBucket[] } {
  const bucketOf = (month: string) => (granularity === 'year' ? month.slice(0, 4) : month);

  // Ordered unique buckets from the month sequence.
  const buckets: string[] = [];
  months.forEach((month) => {
    const b = bucketOf(month);
    if (buckets[buckets.length - 1] !== b) buckets.push(b);
  });

  // Totals per category across the whole range, to pick the top N.
  const totals = new Map<number, { name: string; color: string | null; total: number }>();
  rows.forEach((row) => {
    const acc = totals.get(row.categoryId);
    if (acc) {
      acc.total += row.totalCents;
    } else {
      totals.set(row.categoryId, { name: row.categoryName, color: row.categoryColor, total: row.totalCents });
    }
  });

  const ranked = Array.from(totals.entries()).sort((a, b) => b[1].total - a[1].total);
  const topIds = new Set(ranked.slice(0, topN).map(([id]) => id));
  const hasOthers = ranked.length > topN;

  const series: PivotSeries[] = ranked
    .slice(0, topN)
    .map(([id, info]) => ({ key: String(id), categoryId: id, name: info.name, color: info.color }));
  if (hasOthers) {
    series.push({ key: OTHERS_KEY, categoryId: null, name: '', color: null });
  }

  // Initialise every bucket with zeroed series keys.
  const byBucket = new Map<string, Record<string, number>>();
  buckets.forEach((b) => {
    const values: Record<string, number> = {};
    series.forEach((s) => {
      values[s.key] = 0;
    });
    byBucket.set(b, values);
  });

  rows.forEach((row) => {
    const values = byBucket.get(bucketOf(row.month));
    if (!values) return;
    const key = topIds.has(row.categoryId) ? String(row.categoryId) : OTHERS_KEY;
    values[key] = (values[key] ?? 0) + row.totalCents;
  });

  const data: PivotBucket[] = buckets.map((bucket) => ({ bucket, values: byBucket.get(bucket) ?? {} }));

  return { series, data };
}

export interface CategoryTrendBar {
  label: string;
  [seriesKey: string]: number | string;
}

export function useCategoryTrendBars(period: TrendPeriod) {
  const { t, locale } = useTranslate();
  const range = resolveTrendRange(period);
  const query = useCategoryTrends(range.fromMonth, range.toMonth);
  const data = query.data;

  const result = useMemo(() => {
    if (!data || data.rows.length === 0) {
      return {
        series: [] as CategorySeries[],
        bars: [] as CategoryTrendBar[],
        granularity: 'month' as TrendGranularity,
      };
    }

    // Build the full month sequence from the resolved range (zero-fill base).
    const months: string[] = [];
    let cursor = data.fromMonth;
    while (cursor <= data.toMonth && months.length < MAX_BUCKETS) {
      months.push(cursor);
      cursor = addMonths(cursor, 1);
    }

    const granularity: TrendGranularity = months.length > MONTHLY_MAX_BARS ? 'year' : 'month';
    const { series: pivotSeries, data: pivot } = pivotCategoryTrends(data.rows, months, granularity, TOP_N);

    const series: CategorySeries[] = pivotSeries.map((s, index) => ({
      key: s.key,
      name: s.categoryId === null ? t('dashboard.charts.others') : s.name,
      color:
        s.categoryId === null
          ? CHART_COLORS.muted
          : (s.color ?? CATEGORY_PALETTE[index % CATEGORY_PALETTE.length] ?? CHART_COLORS.balance),
    }));

    const bars: CategoryTrendBar[] = pivot.map((bucket) => {
      const row: CategoryTrendBar = {
        label: granularity === 'year' ? bucket.bucket : formatMonthShort(bucket.bucket, locale),
      };
      pivotSeries.forEach((s) => {
        row[s.key] = (bucket.values[s.key] ?? 0) / 100;
      });
      return row;
    });

    return { series, bars, granularity };
  }, [data, t, locale]);

  return {
    ...result,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
