/**
 * AEAT Fiscal Deadline Calculator (server-side only)
 * Computes all filing deadlines for Spanish tax models based on verified AEAT rules.
 * Pure functions — no database calls, no side effects.
 */

import { FILING_STATUS, MODELO_TYPE } from '@/constants/finance';
import type { FilingStatus, FiscalDeadline, ModeloType } from '@/types/finance';

/**
 * Format a Date as YYYY-MM-DD using local time (avoids UTC timezone shift)
 */
function formatDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface DeadlineRule {
  modeloType: ModeloType;
  fiscalQuarter: number | null;
  getStartDate: (year: number) => Date;
  getEndDate: (year: number) => Date;
}

/**
 * AEAT deadline rules (verified):
 * - 303/130 Q1: 1-20 April
 * - 303/130 Q2: 1-20 July
 * - 303/130 Q3: 1-20 October
 * - 303/130 Q4: 1-30 January (year+1)
 * - 390 Annual: 1-30 January (year+1)
 * - 100 Annual: 8 April - 30 June (year+1)
 */
const DEADLINE_RULES: DeadlineRule[] = [
  // Modelo 303 quarterly
  {
    modeloType: MODELO_TYPE.M303,
    fiscalQuarter: 1,
    getStartDate: (y) => new Date(y, 3, 1),
    getEndDate: (y) => new Date(y, 3, 20),
  },
  {
    modeloType: MODELO_TYPE.M303,
    fiscalQuarter: 2,
    getStartDate: (y) => new Date(y, 6, 1),
    getEndDate: (y) => new Date(y, 6, 20),
  },
  {
    modeloType: MODELO_TYPE.M303,
    fiscalQuarter: 3,
    getStartDate: (y) => new Date(y, 9, 1),
    getEndDate: (y) => new Date(y, 9, 20),
  },
  {
    modeloType: MODELO_TYPE.M303,
    fiscalQuarter: 4,
    getStartDate: (y) => new Date(y + 1, 0, 1),
    getEndDate: (y) => new Date(y + 1, 0, 30),
  },
  // Modelo 130 quarterly
  {
    modeloType: MODELO_TYPE.M130,
    fiscalQuarter: 1,
    getStartDate: (y) => new Date(y, 3, 1),
    getEndDate: (y) => new Date(y, 3, 20),
  },
  {
    modeloType: MODELO_TYPE.M130,
    fiscalQuarter: 2,
    getStartDate: (y) => new Date(y, 6, 1),
    getEndDate: (y) => new Date(y, 6, 20),
  },
  {
    modeloType: MODELO_TYPE.M130,
    fiscalQuarter: 3,
    getStartDate: (y) => new Date(y, 9, 1),
    getEndDate: (y) => new Date(y, 9, 20),
  },
  {
    modeloType: MODELO_TYPE.M130,
    fiscalQuarter: 4,
    getStartDate: (y) => new Date(y + 1, 0, 1),
    getEndDate: (y) => new Date(y + 1, 0, 30),
  },
  // Modelo 390 annual (same window as Q4 303/130)
  {
    modeloType: MODELO_TYPE.M390,
    fiscalQuarter: null,
    getStartDate: (y) => new Date(y + 1, 0, 1),
    getEndDate: (y) => new Date(y + 1, 0, 30),
  },
  // Modelo 100 annual (Renta)
  {
    modeloType: MODELO_TYPE.M100,
    fiscalQuarter: null,
    getStartDate: (y) => new Date(y + 1, 3, 8),
    getEndDate: (y) => new Date(y + 1, 5, 30),
  },
];

/**
 * Build a unique key for a filing (used to check filed status)
 */
function filingKey(modeloType: string, year: number, quarter: number | null): string {
  return quarter !== null ? `${modeloType}-${year}-${quarter}` : `${modeloType}-${year}`;
}

/**
 * Compute the filing status for a deadline relative to the current date
 */
function computeFilingStatus(
  startDate: Date,
  endDate: Date,
  isFiled: boolean,
  now: Date,
  reminderDaysBefore: number,
): FilingStatus {
  if (isFiled) return FILING_STATUS.FILED;

  // End of day comparison: deadline is the end of endDate
  const endOfDeadline = new Date(endDate);
  endOfDeadline.setHours(23, 59, 59, 999);

  if (now > endOfDeadline) return FILING_STATUS.OVERDUE;

  if (now >= startDate) return FILING_STATUS.DUE;

  // Check if within reminder window
  const reminderDate = new Date(startDate);
  reminderDate.setDate(reminderDate.getDate() - reminderDaysBefore);
  if (now >= reminderDate) return FILING_STATUS.UPCOMING;

  return FILING_STATUS.NOT_DUE;
}

/**
 * Calculate days remaining until deadline end date
 */
function daysUntil(endDate: Date, now: Date): number | null {
  const diffMs = endDate.getTime() - now.getTime();
  if (diffMs < 0) return null;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Compute all AEAT deadlines for a given fiscal year.
 * @param year - Fiscal year
 * @param filedSet - Set of filing keys already filed (e.g. "303-2025-1")
 * @param reminderDaysBefore - Days before deadline to show as "upcoming"
 * @param now - Current date (injectable for testing)
 */
export function computeDeadlines(
  year: number,
  filedSet: Set<string>,
  reminderDaysBefore = 7,
  now: Date = new Date(),
): FiscalDeadline[] {
  return DEADLINE_RULES.map((rule) => {
    const startDate = rule.getStartDate(year);
    const endDate = rule.getEndDate(year);
    const key = filingKey(rule.modeloType, year, rule.fiscalQuarter);
    const isFiled = filedSet.has(key);
    const status = computeFilingStatus(startDate, endDate, isFiled, now, reminderDaysBefore);
    const remaining = daysUntil(endDate, now);

    // Aplazamiento can be requested within the voluntary payment period (same window)
    const needsPostponement = !isFiled && now >= startDate && now <= endDate;

    return {
      modeloType: rule.modeloType,
      fiscalYear: year,
      fiscalQuarter: rule.fiscalQuarter,
      startDate: formatDateLocal(startDate),
      endDate: formatDateLocal(endDate),
      status,
      isFiled,
      daysRemaining: remaining,
      needsPostponement,
    };
  });
}

/**
 * Filter deadlines to only upcoming, due, or overdue (for banners and badges)
 */
export function getActiveDeadlines(deadlines: FiscalDeadline[]): FiscalDeadline[] {
  return deadlines.filter(
    (d) => d.status === FILING_STATUS.UPCOMING || d.status === FILING_STATUS.DUE || d.status === FILING_STATUS.OVERDUE,
  );
}
