/**
 * Unit Tests: aggregateByYear
 * Verifies yearly bucketing and the running cumulative balance for long trend periods.
 */

import { aggregateByYear } from '@/components/dashboard/charts/useTrendBars';
import type { FormattedTrendPoint } from '@/types/finance';

function point(month: string, income: number, expense: number, balance: number): FormattedTrendPoint {
  return {
    month,
    income: `${income}`,
    incomeValue: income,
    expense: `${expense}`,
    expenseValue: expense,
    balance: `${balance}`,
    balanceValue: balance,
    cumulativeBalanceValue: 0,
  };
}

describe('aggregateByYear', () => {
  it('groups months into yearly buckets and sums each metric', () => {
    const points = [point('2023-11', 100, 60, 40), point('2023-12', 200, 50, 150), point('2024-01', 300, 100, 200)];

    const buckets = aggregateByYear(points);

    expect(buckets.map((b) => b.year)).toEqual(['2023', '2024']);
    expect(buckets[0]?.income).toBe(300);
    expect(buckets[0]?.expense).toBe(110);
    expect(buckets[0]?.balance).toBe(190);
    expect(buckets[1]?.balance).toBe(200);
  });

  it('accumulates the running balance across years', () => {
    const points = [point('2022-01', 0, 0, 100), point('2023-01', 0, 0, -30), point('2024-01', 0, 0, 50)];

    const buckets = aggregateByYear(points);

    // Cumulative: 100, 70, 120
    expect(buckets.map((b) => b.cumulative)).toEqual([100, 70, 120]);
  });

  it('returns an empty array for no points', () => {
    expect(aggregateByYear([])).toEqual([]);
  });
});
