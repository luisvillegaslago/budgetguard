/**
 * BudgetGuard Deferral verification
 *
 * When AEAT grants an aplazamiento/fraccionamiento it sends a "RESOLUCIÓN DE
 * APLAZAMIENTO/FRACCIONAMIENTO" whose ANEXO I is a table of fracciones and whose ANEXO II is the
 * liquidación de intereses de demora behind them. The extractor READS that letter; this module
 * CHECKS it, and it is the only reason the reading can be trusted enough to book six pending
 * movements off the back of it.
 *
 * WHAT IT NEVER DOES: recompute the split. AEAT does not keep the principal constant across the
 * fracciones — it loads the rounding remainder onto the last one (781,66 ×5 then 781,69; 489,17 ×3
 * then 489,20). A split derived by dividing the total is off by up to three cents per instalment,
 * and that error is exactly what this module exists to stop. The letter's own numbers are the
 * source; everything below only asks whether they agree with each other.
 *
 * The verdict is a list of findings, not a boolean. A three-cent disagreement is worth putting in
 * front of the human, and widening a tolerance until it disappears defeats the whole feature.
 *
 * Dates are 'YYYY-MM-DD' strings and the arithmetic runs in UTC, as in `amortization.ts`: a
 * vencimiento is a calendar day, and reading it as an instant would move it by one day.
 */

import { DEFERRAL_CHECK } from '@/constants/finance';
import type { DeferralFraccion, DeferralTotals, DeferralVerdict, DeferralVerificationIssue } from '@/types/finance';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Art. 26.6 LGT and art. 53 RGR compute interés de demora on a 365-day year, leap years included. */
const DAYS_PER_YEAR = 365;

/**
 * Slack allowed on the recomputed interest, on top of the rate-precision band below.
 *
 * AEAT rounds each row half-up to the cent, and on the last fracción it absorbs the remainder of
 * the interest column just as it does with the principal: letter 282640560363H prints 18,71 where
 * the row on its own works out to 18,70, so that the column adds to the 72,12 of the totals row.
 * One cent, and no more — two cents of drift is a misreading, not a rounding.
 */
const ROUNDING_TOLERANCE_CENTS = 1;

/**
 * Decimals the tipo de interés is assumed to carry, however few the letter prints.
 *
 * AEAT prints "4,062" while the tipo actually applied is 4,0625 % (3,25 % legal × 1,25, art. 26.6
 * LGT). Recomputing with the printed 4,062 lands a cent low on the longest fracciones, so the
 * printed figure is treated as a truncation with a one-ulp band rather than as an exact rate.
 */
const RATE_DECIMALS = 3;

/**
 * Days of the month a fracción may fall due: art. 45.2 RGR fixes them at the 5th and the 20th.
 *
 * ANEXO I prints the vencimiento already moved to the next día hábil (21-09-2026, 22-02-2027),
 * while ANEXO II accrues interest up to the unmoved day (20-09-2026, 20-02-2027). Only ANEXO I is
 * extracted, so the accrual date is recovered from the legal rule.
 */
const VENCIMIENTO_DAYS = [5, 20] as const;

/** How far a vencimiento can sit past its legal day before it is taken at face value. */
const MAX_VENCIMIENTO_SHIFT_DAYS = 4;

/** Parse a 'YYYY-MM-DD' calendar day into a UTC timestamp. */
function dayToUtcMs(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year!, month! - 1, date!);
}

/**
 * Days elapsed from `from` to `to`: the count of days from the one AFTER `from` up to and including
 * `to`. That is the día count ANEXO II prints, because interest runs from the day after the fecha
 * de intereses — 21-07-2026 to 20-09-2026 is 62 days.
 */
function elapsedDays(from: string, to: string): number {
  return (dayToUtcMs(to) - dayToUtcMs(from)) / MS_PER_DAY;
}

/**
 * The day interest actually accrues to for a fracción, given the vencimiento ANEXO I prints.
 *
 * A vencimiento already on its legal day (the 5th or the 20th) is returned untouched. One a few
 * days later has been pushed off a día inhábil, and interest was liquidated up to the legal day,
 * so it is rolled back. Anything further out is not a shift and is taken as printed.
 */
export function interestAccrualEndDate(dueDate: string): string {
  const dayOfMonth = Number(dueDate.slice(8, 10));
  const legalDay = VENCIMIENTO_DAYS.filter((day) => day < dayOfMonth).at(-1);

  if (legalDay === undefined || dayOfMonth - legalDay > MAX_VENCIMIENTO_SHIFT_DAYS) return dueDate;

  return `${dueDate.slice(0, 8)}${String(legalDay).padStart(2, '0')}`;
}

/**
 * Interés de demora of one fracción: base × tipo × días / (100 × 365), art. 53 RGR.
 *
 * The base is the fracción's principal alone. The recargo de apremio is expressly excluded — the
 * letter says so ("la base para el cálculo de intereses no incluirá el recargo del período
 * ejecutivo") and letter 282540627253E proves it: its sixth fracción carries 416,24 € of recargo
 * over one cent of principal and liquidates 0,00 € of interest across 272 days.
 */
export function accruedInterestCents(baseCents: number, ratePercent: number, days: number): number {
  return Math.round((baseCents * ratePercent * days) / (100 * DAYS_PER_YEAR));
}

/**
 * How far the recomputed interest may sit from the printed one before it becomes a finding.
 *
 * It scales with the base and the span instead of being a flat number of cents, because what it
 * covers is the truncated tipo: one ulp of 4,062 over 215 days of 781,69 € is half a cent, but the
 * same ulp over a ten-thousand-euro deferral is a quarter of a euro. A flat tolerance would be a
 * false finding on the one letter and a blind spot on the other.
 */
function accrualToleranceCents(baseCents: number, days: number): number {
  const rateUlp = 10 ** -RATE_DECIMALS;
  return Math.ceil((baseCents * rateUlp * days) / (100 * DAYS_PER_YEAR)) + ROUNDING_TOLERANCE_CENTS;
}

/** `difference` is always actual − expected: which way it leans says which figure was misread. */
function issue(
  check: DeferralVerificationIssue['check'],
  fraccionNumber: number | null,
  expected: number,
  actual: number,
): DeferralVerificationIssue {
  return { check, fraccionNumber, expected, actual, difference: actual - expected };
}

/** The three parts of ANEXO I plus their sum, added row by row. */
export function deferralTotals(fracciones: readonly DeferralFraccion[]): DeferralTotals {
  return fracciones.reduce<DeferralTotals>(
    (totals, fraccion) => ({
      principalCents: totals.principalCents + fraccion.principalCents,
      surchargeCents: totals.surchargeCents + fraccion.surchargeCents,
      interestCents: totals.interestCents + fraccion.interestCents,
      totalCents: totals.totalCents + fraccion.principalCents + fraccion.surchargeCents + fraccion.interestCents,
    }),
    { principalCents: 0, surchargeCents: 0, interestCents: 0, totalCents: 0 },
  );
}

/** The three column totals to compare, in the order ANEXO I prints them. */
const TOTAL_CHECKS = [
  [DEFERRAL_CHECK.PRINCIPAL_TOTAL, 'principalCents'],
  [DEFERRAL_CHECK.SURCHARGE_TOTAL, 'surchargeCents'],
  [DEFERRAL_CHECK.INTEREST_TOTAL, 'interestCents'],
] as const;

/**
 * A resolution in a shape that can be checked: the totals row of its header plus every row of
 * ANEXO I. Both a freshly extracted letter and a stored deferral fit it.
 *
 * The header figures are nullable because an extraction can fail in one corner and be perfect in
 * the rest. An unread totals row is checked as a zero, which is a finding rather than a free pass.
 */
export interface VerifiableDeferral {
  /** "Fecha de Intereses": the last day of the periodo voluntario. Interest runs from the day AFTER */
  interestStartDate: string | null;
  /** Tipo de interés de demora exactly as printed, e.g. 4.062 */
  interestRatePercent: number | null;
  principalCents: number | null;
  surchargeCents: number | null;
  interestCents: number | null;
  fracciones: readonly DeferralFraccion[];
}

/** The fracciones must be the run 1..N, in printed order, with no gaps or repeats. */
function checkSequence(fracciones: readonly DeferralFraccion[]): DeferralVerificationIssue[] {
  if (fracciones.length === 0) return [issue(DEFERRAL_CHECK.FRACCION_SEQUENCE, null, 1, 0)];

  return fracciones.flatMap((fraccion, index) =>
    fraccion.fraccionNumber === index + 1
      ? []
      : [issue(DEFERRAL_CHECK.FRACCION_SEQUENCE, index + 1, index + 1, fraccion.fraccionNumber)],
  );
}

/**
 * Each row against its own "importe total del plazo".
 *
 * The printed total is redundant with its three parts, which is exactly why it is checked: it is
 * the cheapest way to catch a single digit misread in any of the three columns.
 */
function checkFraccionTotals(fracciones: readonly DeferralFraccion[]): DeferralVerificationIssue[] {
  return fracciones.flatMap((fraccion) => {
    const parts = fraccion.principalCents + fraccion.surchargeCents + fraccion.interestCents;
    return parts === fraccion.totalCents
      ? []
      : [issue(DEFERRAL_CHECK.FRACCION_TOTAL, fraccion.fraccionNumber, fraccion.totalCents, parts)];
  });
}

/** Every column of ANEXO I against the totals row, and through it against the TOTAL GENERAL. */
function checkColumnTotals(deferral: VerifiableDeferral, computed: DeferralTotals): DeferralVerificationIssue[] {
  return TOTAL_CHECKS.flatMap(([check, part]) => {
    const declared = deferral[part] ?? 0;
    return declared === computed[part] ? [] : [issue(check, null, declared, computed[part])];
  });
}

/**
 * The vencimientos run forward, and the first one lands after the fecha de intereses.
 *
 * One rule covers both: every fracción must fall due at least a day after the milestone before it,
 * which for the first fracción is the fecha de intereses itself. A vencimiento on that very day
 * would defer nothing and accrue no interest, so it is reported too.
 */
function checkDueDateOrder(
  fracciones: readonly DeferralFraccion[],
  interestStartDate: string | null,
): DeferralVerificationIssue[] {
  return fracciones.flatMap((fraccion, index) => {
    const previousDay = index === 0 ? interestStartDate : fracciones[index - 1]!.dueDate;
    if (previousDay === null) return [];

    const gap = elapsedDays(previousDay, fraccion.dueDate);
    return gap >= 1 ? [] : [issue(DEFERRAL_CHECK.DUE_DATE_ORDER, fraccion.fraccionNumber, 1, gap)];
  });
}

/**
 * Each fracción's interés against art. 53 RGR, which is why the instalments grow: every fracción
 * accrues over a longer span than the one before it, on the same base.
 *
 * This is the only check that recomputes anything, and the only one that catches a letter which is
 * internally consistent yet wrong — an interés that adds up perfectly but cannot belong to its own
 * number of days. It is skipped, never guessed at, when the tipo or the fecha de intereses is
 * missing: there is nothing to disagree with.
 */
function checkInterestAccrual(
  fracciones: readonly DeferralFraccion[],
  interestStartDate: string | null,
  ratePercent: number | null,
): DeferralVerificationIssue[] {
  if (interestStartDate === null || ratePercent === null || ratePercent <= 0) return [];

  return fracciones.flatMap((fraccion) => {
    const days = elapsedDays(interestStartDate, interestAccrualEndDate(fraccion.dueDate));
    // A vencimiento at or before the fecha de intereses is already reported as a date issue
    if (days <= 0) return [];

    const expected = accruedInterestCents(fraccion.principalCents, ratePercent, days);
    const tolerance = accrualToleranceCents(fraccion.principalCents, days);

    return Math.abs(expected - fraccion.interestCents) <= tolerance
      ? []
      : [issue(DEFERRAL_CHECK.INTEREST_ACCRUAL, fraccion.fraccionNumber, fraccion.interestCents, expected)];
  });
}

/**
 * Check a resolution against itself and report everything that disagrees.
 *
 * @example
 * // Letter 282640560363H, six fracciones of a Modelo 130 2T 2026
 * verifyDeferral(letter).isValid // → true
 * // The same letter with its 8,00 € of interest read as 9,00 €
 * verifyDeferral(misread).issues // → fraccion-total, interest-total and interest-accrual findings
 */
export function verifyDeferral(deferral: VerifiableDeferral): DeferralVerdict {
  const { fracciones, interestStartDate, interestRatePercent } = deferral;
  const computedTotals = deferralTotals(fracciones);

  const declaredTotals: DeferralTotals = {
    principalCents: deferral.principalCents ?? 0,
    surchargeCents: deferral.surchargeCents ?? 0,
    interestCents: deferral.interestCents ?? 0,
    totalCents: (deferral.principalCents ?? 0) + (deferral.surchargeCents ?? 0) + (deferral.interestCents ?? 0),
  };

  const issues = [
    ...checkSequence(fracciones),
    ...checkFraccionTotals(fracciones),
    ...checkColumnTotals(deferral, computedTotals),
    ...checkDueDateOrder(fracciones, interestStartDate),
    ...checkInterestAccrual(fracciones, interestStartDate, interestRatePercent),
  ];

  return { isValid: issues.length === 0, declaredTotals, computedTotals, issues };
}
