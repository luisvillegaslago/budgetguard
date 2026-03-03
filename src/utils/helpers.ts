import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a date for display
 * @param date - Date string or Date object
 * @param format - Format type: 'short' | 'long' | 'month'
 */
export function formatDate(date: string | Date, format: 'short' | 'long' | 'month' = 'short'): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  switch (format) {
    case 'month':
      return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(d);
    case 'long':
      return new Intl.DateTimeFormat('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(d);
    default:
      return new Intl.DateTimeFormat('es-ES', {
        day: 'numeric',
        month: 'short',
      }).format(d);
  }
}

/**
 * Get the current month in YYYY-MM format
 * Uses local time methods to avoid UTC timezone shift
 */
export function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Parse a month string to start and end dates
 * @param month - Month string in YYYY-MM format
 * @returns Object with start and end dates
 */
export function getMonthDateRange(month: string): { start: Date; end: Date } {
  const [year, monthNum] = month.split('-').map(Number);

  if (!year || !monthNum) {
    throw new Error(`Invalid month format: ${month}`);
  }

  const start = new Date(year, monthNum - 1, 1);
  const end = new Date(year, monthNum, 0); // Last day of month

  return { start, end };
}

/**
 * Add months to a date string
 * @param month - Month string in YYYY-MM format
 * @param offset - Number of months to add (negative to subtract)
 * @returns New month string in YYYY-MM format
 */
export function addMonths(month: string, offset: number): string {
  const [year, monthNum] = month.split('-').map(Number);

  if (!year || !monthNum) {
    throw new Error(`Invalid month format: ${month}`);
  }

  // Use Date.UTC to avoid local timezone shift when converting back via toISOString
  const date = new Date(Date.UTC(year, monthNum - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

/**
 * Debounce function for input handlers
 */
export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
