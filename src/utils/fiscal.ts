/**
 * BudgetGuard Fiscal Utilities
 * Pure functions for Spanish tax calculations (Modelo 303 + Modelo 130)
 *
 * Same Math.round() in backend and frontend = zero rounding discrepancies
 */

import { GASTOS_DIFICIL } from '@/constants/finance';
import type { FiscalComputedFields } from '@/types/finance';

/**
 * Compute fiscal fields from a total amount (IVA-inclusive), VAT rate, and deduction percentage
 *
 * @param fullAmountCents - Total invoice amount in cents (IVA included)
 * @param vatPercent - VAT percentage (e.g., 21 for 21%)
 * @param deductionPercent - Professional deduction percentage (e.g., 50 for 50%)
 * @returns Computed fiscal breakdown: base, IVA, deductible base, deductible IVA
 *
 * @example
 * computeFiscalFields(7919, 21, 50)
 * // → { baseCents: 6545, ivaCents: 1374, baseDeducibleCents: 3273, ivaDeducibleCents: 687 }
 */
export function computeFiscalFields(
  fullAmountCents: number,
  vatPercent: number,
  deductionPercent: number,
): FiscalComputedFields {
  const baseCents = Math.round(fullAmountCents / (1 + vatPercent / 100));
  const ivaCents = fullAmountCents - baseCents;
  const baseDeducibleCents = Math.round((baseCents * deductionPercent) / 100);
  const ivaDeducibleCents = Math.round((ivaCents * deductionPercent) / 100);

  return { baseCents, ivaCents, baseDeducibleCents, ivaDeducibleCents };
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
