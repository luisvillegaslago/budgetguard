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

/**
 * Derive dayOfWeek/dayOfMonth/monthOfYear from startDate based on frequency.
 * Uses UTC methods to match the app's date convention (PostgreSQL DATE = UTC midnight).
 */
export function extractRecurrenceFields(
  startDate: string,
  frequency: RecurringFrequency,
): { dayOfWeek: number | null; dayOfMonth: number | null; monthOfYear: number | null } {
  const date = new Date(`${startDate}T00:00:00Z`);

  switch (frequency) {
    case RECURRING_FREQUENCY.WEEKLY:
      return { dayOfWeek: date.getUTCDay(), dayOfMonth: null, monthOfYear: null };
    case RECURRING_FREQUENCY.MONTHLY:
      return { dayOfWeek: null, dayOfMonth: date.getUTCDate(), monthOfYear: null };
    case RECURRING_FREQUENCY.YEARLY:
      return { dayOfWeek: null, dayOfMonth: date.getUTCDate(), monthOfYear: date.getUTCMonth() + 1 };
    default:
      return { dayOfWeek: null, dayOfMonth: null, monthOfYear: null };
  }
}

/**
 * Compute the date of the Nth occurrence from startDate.
 * Returns the endDate (inclusive) as YYYY-MM-DD.
 * count=1 means only the startDate occurrence, count=12 means 12 occurrences total.
 */
export function computeEndDateFromOccurrences(startDate: string, frequency: RecurringFrequency, count: number): string {
  const date = new Date(`${startDate}T00:00:00Z`);
  const n = count - 1; // startDate is the 1st occurrence

  switch (frequency) {
    case RECURRING_FREQUENCY.WEEKLY: {
      date.setUTCDate(date.getUTCDate() + n * 7);
      break;
    }
    case RECURRING_FREQUENCY.MONTHLY: {
      const targetDay = date.getUTCDate();
      // Set day to 1 to prevent overflow, then advance month, then clamp
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + n);
      const lastDay = getLastDayOfMonth(date.getUTCFullYear(), date.getUTCMonth() + 1);
      date.setUTCDate(Math.min(targetDay, lastDay));
      break;
    }
    case RECURRING_FREQUENCY.YEARLY: {
      const targetDay = date.getUTCDate();
      const targetMonth = date.getUTCMonth();
      date.setUTCDate(1);
      date.setUTCFullYear(date.getUTCFullYear() + n);
      date.setUTCMonth(targetMonth);
      const lastDay = getLastDayOfMonth(date.getUTCFullYear(), date.getUTCMonth() + 1);
      date.setUTCDate(Math.min(targetDay, lastDay));
      break;
    }
  }

  return formatDateISO(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}
