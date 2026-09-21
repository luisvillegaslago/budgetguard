/**
 * BudgetGuard Summary Period Helpers
 * The dashboard summary is read through one of two lenses — a single month or a
 * whole year — and both need the same three answers: which period is this, which
 * one came before it (for the delta), and how many days it spans so far (for the
 * daily average). Keeping them here makes the lens a value, not a branch in the UI.
 */

import { SUMMARY_GRANULARITY, type SummaryGranularity } from '@/constants/finance';
import type { SummaryPeriod } from '@/types/finance';
import { addMonths } from './helpers';

export function monthPeriod(month: string): SummaryPeriod {
  return { granularity: SUMMARY_GRANULARITY.MONTH, value: month };
}

export function yearPeriod(year: string): SummaryPeriod {
  return { granularity: SUMMARY_GRANULARITY.YEAR, value: year };
}

/** The current year as a "YYYY" string. */
export function getCurrentYear(now: Date = new Date()): string {
  return String(now.getFullYear());
}

/** Build the period for a lens out of the two selections the store holds. */
export function resolvePeriod(granularity: SummaryGranularity, month: string, year: string): SummaryPeriod {
  return granularity === SUMMARY_GRANULARITY.YEAR ? yearPeriod(year) : monthPeriod(month);
}

/**
 * The period immediately before this one — the comparison the KPI deltas are
 * measured against (previous month, or previous year).
 */
export function previousPeriod(period: SummaryPeriod): SummaryPeriod {
  if (period.granularity === SUMMARY_GRANULARITY.YEAR) {
    return yearPeriod(String(Number(period.value) - 1));
  }
  return monthPeriod(addMonths(period.value, -1));
}

/** The year a period belongs to ("2025-03" and "2025" both give "2025"). */
export function periodYear(period: SummaryPeriod): string {
  return period.value.slice(0, 4);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Days elapsed in the current year, today included. */
function daysElapsedThisYear(now: Date): number {
  const startOfYear = Date.UTC(now.getFullYear(), 0, 1);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today - startOfYear) / 86_400_000) + 1;
}

/**
 * Number of days to divide a period's spend by for the daily average.
 * - Past periods: their full calendar length.
 * - The running period: the days elapsed so far, so the average is not diluted
 *   by days that have not happened yet.
 * - Future periods: null (no elapsed days → the average is not meaningful).
 */
export function dailyAverageDivisor(period: SummaryPeriod, now: Date = new Date()): number | null {
  if (period.granularity === SUMMARY_GRANULARITY.YEAR) {
    const year = Number(period.value);
    const currentYear = now.getFullYear();

    if (year > currentYear) return null;
    if (year === currentYear) return daysElapsedThisYear(now);

    return isLeapYear(year) ? 366 : 365;
  }

  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  if (period.value > currentMonth) return null;
  if (period.value === currentMonth) return now.getDate();

  const [year, month] = period.value.split('-').map(Number);
  if (!year || !month) return null;

  // Day 0 of the next month is the last day of this one.
  return new Date(year, month, 0).getDate();
}
