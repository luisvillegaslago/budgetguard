/**
 * AEAT Fiscal Deadline Calculator
 * Computes all filing deadlines for Spanish tax models based on verified AEAT rules.
 * Pure functions — no database calls, no side effects.
 */

import { FILING_STATUS, MODELO_TYPE } from '@/constants/finance';
import type { FilingStatus, FiscalDeadline, ModeloType } from '@/types/finance';
import { nextWorkingDay } from '@/utils/workingDays';

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
  /** Last day to file with the payment direct-debited, when the model admits it */
  getDomiciliacionDate?: (year: number) => Date;
}

/**
 * Renta filing windows, per campaign. They are set by an Orden ministerial every year and
 * have moved (2 April in 2025, 8 April in 2026), so a formula would be inventing dates: a
 * year with no published Orden yet returns nothing rather than a plausible-looking guess.
 */
/** The most recent campaign whose Orden is published; later years reuse its window as a guess. */
const LAST_PUBLISHED_RENTA_CAMPAIGN = 2025;

const RENTA_WINDOWS: Record<number, readonly [start: readonly [number, number], end: readonly [number, number]]> = {
  2023: [
    [4, 3],
    [7, 1],
  ],
  2024: [
    [4, 2],
    [6, 30],
  ],
  2025: [
    [4, 8],
    [6, 30],
  ],
};

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
    getDomiciliacionDate: (y) => new Date(y, 3, 15),
  },
  {
    modeloType: MODELO_TYPE.M303,
    fiscalQuarter: 2,
    getStartDate: (y) => new Date(y, 6, 1),
    getEndDate: (y) => new Date(y, 6, 20),
    getDomiciliacionDate: (y) => new Date(y, 6, 15),
  },
  {
    modeloType: MODELO_TYPE.M303,
    fiscalQuarter: 3,
    getStartDate: (y) => new Date(y, 9, 1),
    getEndDate: (y) => new Date(y, 9, 20),
    getDomiciliacionDate: (y) => new Date(y, 9, 15),
  },
  {
    modeloType: MODELO_TYPE.M303,
    fiscalQuarter: 4,
    getStartDate: (y) => new Date(y + 1, 0, 1),
    getEndDate: (y) => new Date(y + 1, 0, 30),
    getDomiciliacionDate: (y) => new Date(y + 1, 0, 27),
  },
  // Modelo 130 quarterly
  {
    modeloType: MODELO_TYPE.M130,
    fiscalQuarter: 1,
    getStartDate: (y) => new Date(y, 3, 1),
    getEndDate: (y) => new Date(y, 3, 20),
    getDomiciliacionDate: (y) => new Date(y, 3, 15),
  },
  {
    modeloType: MODELO_TYPE.M130,
    fiscalQuarter: 2,
    getStartDate: (y) => new Date(y, 6, 1),
    getEndDate: (y) => new Date(y, 6, 20),
    getDomiciliacionDate: (y) => new Date(y, 6, 15),
  },
  {
    modeloType: MODELO_TYPE.M130,
    fiscalQuarter: 3,
    getStartDate: (y) => new Date(y, 9, 1),
    getEndDate: (y) => new Date(y, 9, 20),
    getDomiciliacionDate: (y) => new Date(y, 9, 15),
  },
  {
    modeloType: MODELO_TYPE.M130,
    fiscalQuarter: 4,
    getStartDate: (y) => new Date(y + 1, 0, 1),
    getEndDate: (y) => new Date(y + 1, 0, 30),
    getDomiciliacionDate: (y) => new Date(y + 1, 0, 27),
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
    getStartDate: (y) => rentaWindowDate(y, 'start'),
    getEndDate: (y) => rentaWindowDate(y, 'end'),
  },
];

/**
 * Start or end of the Renta window of a campaign. Years with no published Orden fall back to
 * the last known window so the calendar still has something to show; the caller marks them as
 * unconfirmed rather than presenting an invented date as a fact.
 */
function rentaWindowDate(fiscalYear: number, edge: 'start' | 'end'): Date {
  const campaign = RENTA_WINDOWS[fiscalYear] ?? RENTA_WINDOWS[LAST_PUBLISHED_RENTA_CAMPAIGN];
  const [month, day] = campaign![edge === 'start' ? 0 : 1];
  return new Date(fiscalYear + 1, month - 1, day);
}

/** True while the Orden that fixes this campaign's Renta window has not been published yet. */
const isRentaWindowConfirmed = (fiscalYear: number): boolean => fiscalYear in RENTA_WINDOWS;

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
    // A deadline landing on a día inhábil runs to the next working day, and the AEAT extends
    // the domiciliación one by the same number of days.
    const nominalEndDate = rule.getEndDate(year);
    const endDate = nextWorkingDay(nominalEndDate);
    // The AEAT extends the domiciliación deadline "con carácter general" by the same days as
    // the filing one, but each year's calendar is what settles it. This keeps the rule date
    // instead of the extension: filing a day early costs nothing, a day late costs a recargo.
    const domiciliacionEndDate = rule.getDomiciliacionDate?.(year) ?? null;
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
      // Kept apart so the card can say the rule date fell on a weekend, instead of silently
      // moving it and leaving the user wondering which one is right.
      nominalEndDate: formatDateLocal(nominalEndDate),
      domiciliacionEndDate: domiciliacionEndDate ? formatDateLocal(domiciliacionEndDate) : null,
      isWindowConfirmed: rule.modeloType === MODELO_TYPE.M100 ? isRentaWindowConfirmed(year) : true,
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

/**
 * The deadlines of a fiscal year that is already over but whose filing window is still running.
 *
 * A period is always filed in the one after it, so the year being filed is not always the year on
 * the calendar. Q4, the 390 and the Renta all fall due after their fiscal year has ended: on 10
 * January the 303 and the 130 of Q4 are due, and in May the Modelo 100 of the previous year is.
 * A surface that only ever asks for `new Date().getFullYear()` finds all of those NOT_DUE — it
 * shows nothing at all precisely on the days something is owed.
 *
 * Bounded to windows that are still open, and deliberately not to overdue ones. A filing missed in
 * a closed year is a different conversation, and surfacing it here would park a permanent warning
 * on the dashboard of anyone who ever skipped one.
 *
 * Pure, like everything else in this file: the caller decides which year to compute and does the
 * reading. Nothing new is invented — these are the entries computeDeadlines() already emits for
 * that year, filtered.
 */
export function getCarryOverDeadlines(deadlines: FiscalDeadline[]): FiscalDeadline[] {
  return deadlines.filter((d) => d.status === FILING_STATUS.UPCOMING || d.status === FILING_STATUS.DUE);
}
