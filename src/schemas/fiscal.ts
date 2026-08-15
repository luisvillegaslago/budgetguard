/**
 * BudgetGuard Fiscal Schemas
 * Zod validation for fiscal report query parameters
 */

import { z } from 'zod';
import { IRPF_PROJECTION, VALIDATION_KEY } from '@/constants/finance';

/**
 * Schema for fiscal report filters (query params)
 */
export const FiscalReportFiltersSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  quarter: z.coerce.number().int().min(1).max(4),
});

export type FiscalReportFiltersInput = z.infer<typeof FiscalReportFiltersSchema>;

/**
 * Schema for annual fiscal report filters (query params — year only)
 */
export const AnnualFiscalFiltersSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
});

export type AnnualFiscalFiltersInput = z.infer<typeof AnnualFiscalFiltersSchema>;

/**
 * Schema for the IRPF provision projection (query params).
 * `projectedIncome` is an optional manual override of the annual billing, in euros.
 */
export const IrpfProjectionFiltersSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  projectedIncome: z.coerce
    .number()
    .nonnegative(VALIDATION_KEY.AMOUNT_NON_NEGATIVE)
    .max(IRPF_PROJECTION.MAX_INCOME_EUROS, VALIDATION_KEY.AMOUNT_TOO_LARGE)
    .optional(),
});

export type IrpfProjectionFiltersInput = z.infer<typeof IrpfProjectionFiltersSchema>;

/**
 * Schema for the annual billing override typed in the IRPF provision card (euros).
 * An empty input reaches the resolver as NaN, which the type error already covers.
 */
export const IrpfProjectionOverrideSchema = z.object({
  projectedIncome: z
    .number({
      required_error: VALIDATION_KEY.AMOUNT_NON_NEGATIVE,
      invalid_type_error: VALIDATION_KEY.AMOUNT_NON_NEGATIVE,
    })
    .nonnegative(VALIDATION_KEY.AMOUNT_NON_NEGATIVE)
    .max(IRPF_PROJECTION.MAX_INCOME_EUROS, VALIDATION_KEY.AMOUNT_TOO_LARGE),
});

export type IrpfProjectionOverrideInput = z.infer<typeof IrpfProjectionOverrideSchema>;
