/**
 * BudgetGuard Fiscal Schemas
 * Zod validation for fiscal report query parameters
 */

import { z } from 'zod';

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
