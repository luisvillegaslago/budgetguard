/**
 * BudgetGuard Fiscal Schemas
 * Zod validation for fiscal report query parameters
 */

import { z } from 'zod';
import { IRPF_PROJECTION, PENSION_PLAN, VALIDATION_KEY } from '@/constants/finance';

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

/**
 * One pension contribution as it travels on the wire and as it is typed in the form: EUROS.
 * The ceiling is a sanity one, not the legal limit: the user must be able to record what was
 * actually paid in, and computePensionReductionCents() decides how much of it reduces the base.
 */
const pensionContributionEuros = z
  .number({
    required_error: VALIDATION_KEY.AMOUNT_NON_NEGATIVE,
    invalid_type_error: VALIDATION_KEY.AMOUNT_NON_NEGATIVE,
  })
  .nonnegative(VALIDATION_KEY.AMOUNT_NON_NEGATIVE)
  .max(PENSION_PLAN.MAX_CONTRIBUTION_EUROS, VALIDATION_KEY.AMOUNT_TOO_LARGE);

/**
 * Schema for the pension contributions typed in the IRPF provision card (euros).
 * One field per product: each bucket has its own legal ceiling, so a single total could not
 * be validated.
 */
export const FiscalProfileAmountsSchema = z.object({
  pensionIndividual: pensionContributionEuros,
  pensionEmployment: pensionContributionEuros,
});

/** Schema for the IVA compensation pool carried into the year, typed in the Modelo 303 card. */
export const VatPoolOpeningSchema = z.object({
  vatPoolOpening: z
    .number({
      required_error: VALIDATION_KEY.AMOUNT_NON_NEGATIVE,
      invalid_type_error: VALIDATION_KEY.AMOUNT_NON_NEGATIVE,
    })
    .nonnegative(VALIDATION_KEY.AMOUNT_NON_NEGATIVE)
    .max(PENSION_PLAN.MAX_CONTRIBUTION_EUROS, VALIDATION_KEY.AMOUNT_TOO_LARGE),
});

export type VatPoolOpeningInput = z.infer<typeof VatPoolOpeningSchema>;

export type FiscalProfileAmountsInput = z.infer<typeof FiscalProfileAmountsSchema>;

/**
 * Schema for the annual fiscal profile write (PUT body).
 * The year identifies the row; the amounts are converted to cents at the route edge.
 */
export const FiscalProfileSchema = FiscalProfileAmountsSchema.partial()
  .merge(VatPoolOpeningSchema.partial())
  .extend({
    fiscalYear: z.coerce.number().int().min(2020).max(2100),
  });

export type FiscalProfileSchemaInput = z.infer<typeof FiscalProfileSchema>;
