/**
 * BudgetGuard Recurring Expense Utilities
 * Pure functions for calculating occurrence dates
 */

import { RECURRING_FREQUENCY } from '@/constants/finance';
import type { RecurringFrequency } from '@/types/finance';

interface RecurringRule {
  frequency: RecurringFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  startDate: string;
  endDate: string | null;
}

/**
 * Get the last day of a given month
 */
function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Clamp a day to the actual last day of the month
 * e.g. day 31 in February → 28 (or 29 in leap year)
 */
function clampDay(day: number, year: number, month: number): number {
  const lastDay = getLastDayOfMonth(year, month);
  return Math.min(day, lastDay);
}

/**
 * Format a date as YYYY-MM-DD
 */
function formatDateISO(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Check if a date string is within the rule's active range
 */
function isDateInRange(dateStr: string, rule: RecurringRule): boolean {
  if (dateStr < rule.startDate) return false;
  if (rule.endDate && dateStr > rule.endDate) return false;
  return true;
}

/**
 * Calculate occurrence dates for a single month
 * Returns an array of ISO date strings (YYYY-MM-DD)
 */
export function calculateOccurrenceDates(rule: RecurringRule, month: string): string[] {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthNum = Number(monthStr);

  if (!year || !monthNum) return [];

  switch (rule.frequency) {
    case RECURRING_FREQUENCY.MONTHLY: {
      if (rule.dayOfMonth === null) return [];
      const day = clampDay(rule.dayOfMonth, year, monthNum);
      const dateStr = formatDateISO(year, monthNum, day);
      return isDateInRange(dateStr, rule) ? [dateStr] : [];
    }

    case RECURRING_FREQUENCY.YEARLY: {
      if (rule.dayOfMonth === null || rule.monthOfYear === null) return [];
      if (rule.monthOfYear !== monthNum) return [];
      const day = clampDay(rule.dayOfMonth, year, monthNum);
      const dateStr = formatDateISO(year, monthNum, day);
      return isDateInRange(dateStr, rule) ? [dateStr] : [];
    }

    case RECURRING_FREQUENCY.WEEKLY: {
      if (rule.dayOfWeek === null) return [];
      const dates: string[] = [];
      const lastDay = getLastDayOfMonth(year, monthNum);

      // Iterate through all days of the month
      Array.from({ length: lastDay }, (_, i) => i + 1).forEach((day) => {
        const date = new Date(year, monthNum - 1, day);
        if (date.getDay() === rule.dayOfWeek) {
          const dateStr = formatDateISO(year, monthNum, day);
          if (isDateInRange(dateStr, rule)) {
            dates.push(dateStr);
          }
        }
      });

      return dates;
    }

    default:
      return [];
  }
}

/**
 * Calculate all pending occurrence dates across a range of months
 * Used for retroactive generation (from startDate to current month)
 */
export function calculateAllPendingDates(rule: RecurringRule, fromMonth: string, toMonth: string): string[] {
  const dates: string[] = [];
  let current = fromMonth;

  while (current <= toMonth) {
    const monthDates = calculateOccurrenceDates(rule, current);
    dates.push(...monthDates);
    current = incrementMonth(current);
  }

  return dates;
}

/**
 * Increment a month string by one month
 */
function incrementMonth(month: string): string {
  const [yearStr, monthStr] = month.split('-');
  let year = Number(yearStr);
  let monthNum = Number(monthStr);

  monthNum++;
  if (monthNum > 12) {
    monthNum = 1;
    year++;
  }

  return `${year}-${String(monthNum).padStart(2, '0')}`;
}

/**
 * Get the month string (YYYY-MM) from a date string (YYYY-MM-DD)
 */
export function getMonthFromDate(dateStr: string): string {
  return dateStr.substring(0, 7);
}
