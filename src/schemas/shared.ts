/**
 * Shared Zod helpers for form/request schemas.
 */

import { z } from 'zod';
import { MODELO_100_CASILLA, VALIDATION_KEY } from '@/constants/finance';

const MODELO_100_CASILLA_CODES = Object.values(MODELO_100_CASILLA);

/**
 * A Modelo 100 expense casilla, checked against the official form rather than by length.
 * `z.string().max(4)` used to accept '0196', a box that does not exist: anything filed there
 * lands in no casilla of the sum. Optional and nullable — a category with no casilla falls back
 * to MODELO_100_DEFAULT_CASILLA at report time.
 */
export function modelo100CasillaField() {
  return z
    .enum(MODELO_100_CASILLA_CODES as [string, ...string[]], {
      errorMap: () => ({ message: VALIDATION_KEY.INVALID_MODELO_100_CASILLA }),
    })
    .optional()
    .nullable();
}

/**
 * The IVA deduction share of an expense (art. 95 LIVA), which is not the same figure as the IRPF
 * one (art. 30.2.5.ª b LIRPF) on the very same receipt.
 *
 * Optional AND nullable, and both states mean the same thing — VAT_DEDUCTION_INHERITS_IRPF: the
 * IVA share follows the IRPF one, exactly as the app behaved before the column existed. It is
 * never coerced to 0 here: a 0 is an explicit "deduct no input VAT", and applying it by default
 * would strip the input VAT of every row written before the split.
 *
 * One helper for the six declarations (transaction, category default × 2, recurring rule × 2,
 * fiscal-document link) so the range and its translated message cannot drift between them.
 */
export function vatDeductionShareField() {
  return z
    .number()
    .min(0, VALIDATION_KEY.INVALID_VAT_DEDUCTION_PERCENT)
    .max(100, VALIDATION_KEY.INVALID_VAT_DEDUCTION_PERCENT)
    .nullable()
    .optional();
}

/**
 * Required positive number whose i18n message also covers the "empty form field
 * coerced to NaN" case. Without required_error/invalid_type_error, an empty
 * numeric input (NaN) fails the base `z.number()` check and the UI leaks Zod's
 * default "Expected number, received nan" instead of the translated message.
 */
export function requiredPositiveNumber(messageKey: string) {
  return z.number({ required_error: messageKey, invalid_type_error: messageKey }).positive(messageKey);
}

/** Same as {@link requiredPositiveNumber} but for integer ids/counters. */
export function requiredPositiveInt(messageKey: string) {
  return z.number({ required_error: messageKey, invalid_type_error: messageKey }).int().positive(messageKey);
}

/**
 * Same as {@link requiredPositiveInt} but zero is a valid value — an invoice line
 * billed at 0 (work done as a courtesy, still itemised) is legitimate, while an
 * empty field must keep failing with the translated message.
 */
export function requiredNonNegativeInt(messageKey: string) {
  return z.number({ required_error: messageKey, invalid_type_error: messageKey }).int().nonnegative(messageKey);
}
