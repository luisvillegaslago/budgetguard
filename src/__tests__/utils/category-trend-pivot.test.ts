/**
 * Unit Tests: pivotCategoryTrends
 * Verifies top-N selection, "Others" aggregation and per-bucket sums.
 */

import { pivotCategoryTrends } from '@/components/dashboard/charts/useCategoryTrendBars';
import type { CategoryTrendRow } from '@/types/finance';

function row(month: string, categoryId: number, name: string, color: string, cents: number): CategoryTrendRow {
  return { month, categoryId, categoryName: name, categoryColor: color, totalCents: cents };
}

describe('pivotCategoryTrends', () => {
  const months = ['2025-01', '2025-02', '2025-03'];
  const rows = [
    row('2025-01', 1, 'A', '#111', 1000),
    row('2025-02', 1, 'A', '#111', 2000),
    row('2025-01', 2, 'B', '#222', 500),
    row('2025-03', 2, 'B', '#222', 700),
  ];

  it('keeps the top-N categories and aggregates the rest into Others', () => {
    const { series, data } = pivotCategoryTrends(rows, months, 'month', 1);

    // Top category A + an Others bucket for B.
    expect(series.map((s) => s.key)).toEqual(['1', 'others']);
    expect(series[0]?.categoryId).toBe(1);
    expect(series[1]?.categoryId).toBeNull();

    expect(data).toHaveLength(3);
    expect(data[0]?.values).toEqual({ '1': 1000, others: 500 });
    expect(data[1]?.values).toEqual({ '1': 2000, others: 0 });
    expect(data[2]?.values).toEqual({ '1': 0, others: 700 });
  });

  it('omits Others when all categories fit within top-N', () => {
    const { series } = pivotCategoryTrends(rows, months, 'month', 5);
    expect(series.map((s) => s.key)).toEqual(['1', '2']);
    expect(series.some((s) => s.key === 'others')).toBe(false);
  });

  it('buckets by year when granularity is year', () => {
    const yearRows = [row('2023-05', 1, 'A', '#111', 1000), row('2024-02', 1, 'A', '#111', 3000)];
    const { data } = pivotCategoryTrends(yearRows, ['2023-05', '2024-02'], 'year', 5);

    expect(data.map((d) => d.bucket)).toEqual(['2023', '2024']);
    expect(data[0]?.values['1']).toBe(1000);
    expect(data[1]?.values['1']).toBe(3000);
  });
});
