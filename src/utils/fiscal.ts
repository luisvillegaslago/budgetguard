/**
 * BudgetGuard Fiscal Utilities
 * Pure functions for Spanish tax calculations (Modelo 303 + Modelo 130)
 *
 * Same Math.round() in backend and frontend = zero rounding discrepancies
 */

import { FISCAL_QUARTER, type FiscalQuarter, GASTOS_DIFICIL } from '@/constants/finance';
import type { FiscalComputedFields, FiscalPeriod } from '@/types/finance';
import { toDateString } from '@/utils/helpers';

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

/**
 * Roll the "IVA a compensar" pool forward through a year's quarterly results.
 *
 * Modelo 303 casillas 110/78/87: a negative quarter adds its excess input VAT to the pool, and
 * a positive one is settled against the pool first (casilla 78) before anything is paid. The
 * pool never goes negative — what a positive quarter cannot absorb is simply paid.
 *
 * @param openingCents - Pool carried into the year (casilla 110 of its first 303)
 * @param quarterResultsCents - Each quarter's own result: negative = a compensar, positive = a ingresar
 * @returns The pool left after the last quarter given, in cents
 */
export function rollVatPoolCents(openingCents: number, quarterResultsCents: number[]): number {
  return quarterResultsCents.reduce(
    (pool, result) => (result < 0 ? pool - result : Math.max(0, pool - result)),
    Math.max(0, openingCents),
  );
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
