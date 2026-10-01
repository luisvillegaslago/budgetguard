/**
 * BudgetGuard Fiscal Utilities
 * Pure functions for Spanish tax calculations (Modelo 303 + Modelo 130)
 *
 * Same Math.round() in backend and frontend = zero rounding discrepancies
 */

import { FISCAL_QUARTER, type FiscalQuarter, GASTOS_DIFICIL } from '@/constants/finance';
import type { FiscalComputedFields, FiscalPeriod } from '@/types/finance';
import { toDateString } from '@/utils/helpers';
import { sumCents } from '@/utils/money';

/** Calendar month (1-12) → the quarter it is settled in. */
function quarterOfMonth(month: number): FiscalQuarter {
  if (month <= 3) return FISCAL_QUARTER.Q1;
  if (month <= 6) return FISCAL_QUARTER.Q2;
  if (month <= 9) return FISCAL_QUARTER.Q3;
  return FISCAL_QUARTER.Q4;
}

/**
 * The fiscal period a date falls in.
 *
 * Deliberately reads the calendar fields off the date string rather than off a Date built from
 * it. `new Date('2026-04-01')` is UTC midnight, and `getMonth()` on it returns March west of
 * Greenwich — which would put a 2T invoice in the 1T. toDateString() normalises both inputs to
 * 'YYYY-MM-DD' first, so the split below sees the same day the database stores and the same one
 * `EXTRACT(QUARTER FROM ...)` reads in "vw_FiscalAccrual".
 *
 * @returns null when the date cannot be read, so callers that only display information can skip
 *          it instead of guessing a period.
 */
export function getFiscalPeriod(date: Date | string): FiscalPeriod | null {
  const [year, month] = toDateString(date).split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return null;
  return { year, quarter: quarterOfMonth(month) };
}

/** Whether two periods are the same year and the same quarter. */
export function isSameFiscalPeriod(a: FiscalPeriod, b: FiscalPeriod): boolean {
  return a.year === b.year && a.quarter === b.quarter;
}

/**
 * Compute fiscal fields from a total amount (IVA-inclusive), a VAT rate and the two deduction
 * shares of the expense.
 *
 * **There are two shares because the law is two rules, not one.** The IRPF share answers art.
 * 30.2.5.ª b LIRPF — the supplies of a home partially affected to the activity are deductible at
 * 30% of the affected proportion, so 30% × 25% = 7,5% with the affectation declared in the modelo
 * 036. The IVA share answers art. 95 LIVA, which demands exclusive affectation for anything that
 * is not a bien de inversión: AEAT's position on those same supplies (consulta V2554-23, TEAC
 * 6654/2022) is that **none** of that input VAT is deductible, i.e. 0%. One number could not say
 * 7,5 and 0 at once, and while there was only one the app deducted VAT a comprobación would
 * disallow.
 *
 * `vatDeductionPercent` is therefore a separate argument, and **omitting it or passing null means
 * "the same share as the IRPF one"** — precisely what this function did while it took a single
 * percentage. That fallback is what makes every pre-existing caller, every stored row and every
 * category default behave exactly as before; "vw_FiscalQuarterly" resolves the same fallback in
 * SQL, so a row read from the view already arrives with it applied. It is emphatically not 0: a
 * zero default would erase input VAT from modelos that have already been filed.
 *
 * It is the **fourth** parameter on purpose. The first three keep their order and meaning, so no
 * existing call site can silently swap two percentages that happen to share a type.
 *
 * @param fullAmountCents - Total invoice amount in cents (IVA included)
 * @param vatPercent - VAT percentage (e.g., 21 for 21%)
 * @param deductionPercent - IRPF deduction share (e.g., 50 for 50%)
 * @param vatDeductionPercent - IVA deduction share; null/undefined follows `deductionPercent`
 * @returns Computed fiscal breakdown: base, IVA, deductible base, deductible IVA
 *
 * @example
 * computeFiscalFields(7919, 21, 50)
 * // → { baseCents: 6545, ivaCents: 1374, baseDeducibleCents: 3273, ivaDeducibleCents: 687 }
 *
 * @example
 * // Home-office supplies: 7,5% of the base for IRPF, none of the input VAT for IVA
 * computeFiscalFields(4840, 21, 7.5, VAT_DEDUCTION_PERCENT.NONE)
 * // → { baseCents: 4000, ivaCents: 840, baseDeducibleCents: 300, ivaDeducibleCents: 0 }
 */
export function computeFiscalFields(
  fullAmountCents: number,
  vatPercent: number,
  deductionPercent: number,
  vatDeductionPercent?: number | null,
): FiscalComputedFields {
  const baseCents = Math.round(fullAmountCents / (1 + vatPercent / 100));
  const ivaCents = fullAmountCents - baseCents;
  // `??`, never `||`: an explicit 0 is the whole point of the column and must not fall back.
  const vatShare = vatDeductionPercent ?? deductionPercent;
  const baseDeducibleCents = Math.round((baseCents * deductionPercent) / 100);
  // Casilla 28 travels with casilla 29, so it takes the VAT share and not the IRPF one.
  const baseVatDeducibleCents = Math.round((baseCents * vatShare) / 100);
  const ivaDeducibleCents = Math.round((ivaCents * vatShare) / 100);

  return { baseCents, ivaCents, baseDeducibleCents, baseVatDeducibleCents, ivaDeducibleCents };
}

/** Settles a positive quarter against the oldest quotas first, which is the order they expire in. */
function settleOldestFirst(tranches: number[], resultCents: number): number[] {
  return tranches.reduce<{ leftCents: number; tranches: number[] }>(
    (acc, cents) => {
      const usedCents = Math.min(cents, acc.leftCents);
      return { leftCents: acc.leftCents - usedCents, tranches: [...acc.tranches, cents - usedCents] };
    },
    { leftCents: resultCents, tranches: [] },
  ).tranches;
}

export interface VatPoolQuarter {
  /** Casilla 110: the pool when this quarter is filed */
  openingCents: number;
  /** What is left once this quarter's own result is applied */
  closingCents: number;
}

/**
 * How much of each quota that expires during year Y the opening balance still holds.
 *
 * The opening is AEAT's figure after every positive quarter and every refund consumed the pool,
 * oldest quota first. So what survives in it is the NEWEST money: the expiring quotas (1T-3T of
 * Y-4) keep only what the opening has beyond everything generated after them, and among
 * themselves the 3T one keeps its part before the 2T one does. Without this, the year after a
 * refund would expire again quotas the refund already paid out.
 *
 * @param openingCents - Pool carried into the year (casilla 110 of its first 303)
 * @param expiringQuotasCents - Quota declared by 1T, 2T and 3T of year Y-4, oldest first
 * @param newerQuotasCents - Every quota declared after them and before the year: 4T of Y-4 to 4T of Y-1
 * @returns What is left of each expiring quota, in the same order
 */
export function expiringRemaindersCents(
  openingCents: number,
  expiringQuotasCents: number[],
  newerQuotasCents: number[],
): number[] {
  const declared = expiringQuotasCents.map((cents) => Math.max(0, cents));
  const olderLeft = Math.max(0, openingCents - sumCents(newerQuotasCents.map((cents) => Math.max(0, cents))));

  return declared.map((cents, index) => Math.min(cents, Math.max(0, olderLeft - sumCents(declared.slice(index + 1)))));
}

interface VatPoolWalk {
  quarters: VatPoolQuarter[];
  /** One entry per quarter: what is left at the end of the walk of the quota it generated */
  pendingByQuarter: number[];
}

/**
 * The one walk of the "IVA a compensar" pool that the 303 and the 390 both read.
 *
 * The pool is kept split by where each euro came from, oldest first: the expiring quotas of the
 * opening, the rest of the opening, then one quota per quarter (0 for a quarter that generated
 * none). A negative quarter adds its quota; a positive one settles against the oldest first.
 */
function walkVatPool(openingCents: number, quarterResultsCents: number[], expiringQuotasCents: number[]): VatPoolWalk {
  const opening = Math.max(0, openingCents);
  const given = expiringQuotasCents.map((cents) => Math.max(0, cents));
  const heldByOpening = (count: number): number => Math.min(opening, sumCents(given.slice(0, count)));
  // Index i leaves at the start of quarter i + 2
  const expiring = given.map((_, index) => heldByOpening(index + 1) - heldByOpening(index));
  const openingTranches = [...expiring, opening - sumCents(expiring)];

  const walked = quarterResultsCents.reduce<{ tranches: number[]; quarters: VatPoolQuarter[] }>(
    (acc, resultCents, index) => {
      const expiredIndex = index - 1;
      const atFiling = acc.tranches.map((cents, position) =>
        position === expiredIndex && expiredIndex < expiring.length ? 0 : cents,
      );
      const afterResult =
        resultCents < 0 ? [...atFiling, -resultCents] : [...settleOldestFirst(atFiling, resultCents), 0];

      return {
        tranches: afterResult,
        quarters: [...acc.quarters, { openingCents: sumCents(atFiling), closingCents: sumCents(afterResult) }],
      };
    },
    { tranches: openingTranches, quarters: [] },
  );

  return { quarters: walked.quarters, pendingByQuarter: walked.tranches.slice(openingTranches.length) };
}

/**
 * Walk the "IVA a compensar" pool through a year's quarterly results, with the four-year expiry.
 *
 * Modelo 303 casillas 110/78/87: a negative quarter adds its excess input VAT to the pool, and a
 * positive one is settled against the pool first (casilla 78) before anything is paid. The pool
 * never goes negative — what a positive quarter cannot absorb is simply paid.
 *
 * Expiry follows AEAT's practice, which counts periods and not dates: the quota of a quarter still
 * counts in the 303 of the same quarter four years later and is gone from the next one. So within
 * year Y the quotas of 1T-3T of Y-4 leave at the start of 2T-4T; the 4T one leaves at 1T of Y+1,
 * which the next year's opening balance already reflects. Verified to the cent against every 303
 * filed from 2020 to 2026 (docs/FISCAL_DOMAIN.md, "IVA a compensar: the pool").
 *
 * A positive quarter of the year consumes the expiring quotas first. What earlier years already
 * consumed of them is the caller's to resolve, with expiringRemaindersCents(); the walk only
 * guards that it never expires more than the opening holds.
 *
 * @param openingCents - Pool carried into the year (casilla 110 of its first 303)
 * @param quarterResultsCents - Each quarter's own result: negative = a compensar, positive = a ingresar
 * @param expiringQuotasCents - What the opening still holds of the quotas of 1T, 2T and 3T of year Y-4, oldest first
 * @returns One entry per quarter given
 */
export function vatPoolByQuarterCents(
  openingCents: number,
  quarterResultsCents: number[],
  expiringQuotasCents: number[],
): VatPoolQuarter[] {
  return walkVatPool(openingCents, quarterResultsCents, expiringQuotasCents).quarters;
}

/**
 * What is still pending, at the close of the quarters given, of the quota each of them generated.
 *
 * The same walk as vatPoolByQuarterCents(), read by where each euro came from. A positive quarter
 * settles against the OLDEST quota first, which is the order in which art. 99.Cinco LIVA lets them
 * expire, so a quarter's own quota is only touched once everything older is gone — including the
 * opening quotas that expire during the year, which are no longer there to absorb it.
 *
 * Modelo 390 needs this split and not the plain total: casilla 662 declares the quotas generated
 * in the year that are still pending at 31 December, apart from the ones in casilla 97. Summing
 * each quarter's gross "a compensar" overstates it as soon as a later quarter consumed part of it.
 *
 * @param openingCents - Pool carried into the year (casilla 110 of its first 303)
 * @param quarterResultsCents - Each quarter's own result: negative = a compensar, positive = a ingresar
 * @param expiringQuotasCents - As in vatPoolByQuarterCents(); none by default
 * @returns One entry per quarter: the part of its own quota still pending, 0 for a quarter a ingresar
 */
export function pendingVatQuotasByQuarterCents(
  openingCents: number,
  quarterResultsCents: number[],
  expiringQuotasCents: number[] = [],
): number[] {
  return walkVatPool(openingCents, quarterResultsCents, expiringQuotasCents).pendingByQuarter;
}

/**
 * Calculate 5% gastos de difícil justificación (estimación directa simplificada)
 * Capped at GASTOS_DIFICIL.MAX_CENTS (2,000€) annually.
 *
 * @param rendimientoPre - Net income before this deduction (income - documented expenses) in cents
 * @returns Amount in cents (0 if rendimientoPre <= 0)
 */
export function calcGastosDificilCents(rendimientoPre: number): number {
  if (rendimientoPre <= 0) return 0;
  const raw = Math.round((rendimientoPre * GASTOS_DIFICIL.RATE) / 100);
  return Math.min(raw, GASTOS_DIFICIL.MAX_CENTS);
}
