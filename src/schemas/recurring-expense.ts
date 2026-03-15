/**
 * BudgetGuard Recurring Expense Schemas
 * Shared validation schemas for recurring expense forms and API endpoints
 */

import { z } from 'zod';
import { RECURRING_FREQUENCY, VALIDATION_KEY } from '@/constants/finance';

export const RecurringFrequencySchema = z.enum([
  RECURRING_FREQUENCY.WEEKLY,
  RECURRING_FREQUENCY.MONTHLY,
  RECURRING_FREQUENCY.YEARLY,
]);

/**
 * Schema for creating a new recurring expense
 * Conditional validation based on frequency
 */
export const CreateRecurringExpenseSchema = z
  .object({
    categoryId: z.number().int().positive(VALIDATION_KEY.CATEGORY_REQUIRED),
    amount: z.number().positive(VALIDATION_KEY.AMOUNT_POSITIVE),
    description: z.string().max(255, VALIDATION_KEY.DESCRIPTION_TOO_LONG).optional().default(''),
    frequency: RecurringFrequencySchema,
    dayOfWeek: z.number().int().min(0).max(6).nullable().optional().default(null),
    dayOfMonth: z.number().int().min(1).max(31).nullable().optional().default(null),
    monthOfYear: z.number().int().min(1).max(12).nullable().optional().default(null),
    startDate: z.coerce.date({ message: VALIDATION_KEY.INVALID_DATE }),
    endDate: z.coerce.date().nullable().optional().default(null),
    isShared: z.boolean().optional().default(false),
    vatPercent: z.number().min(0).max(100).nullable().optional().default(null),
    deductionPercent: z.number().min(0).max(100).nullable().optional().default(null),
    vendorName: z.string().max(150).nullable().optional().default(null),
    companyId: z.number().int().positive().nullable().optional().default(null),
  })
  .refine(
    (data) => {
      if (data.frequency === RECURRING_FREQUENCY.WEEKLY) {
        return data.dayOfWeek !== null && data.dayOfWeek !== undefined;
      }
      return true;
    },
    { message: VALIDATION_KEY.DAY_OF_WEEK_REQUIRED, path: ['dayOfWeek'] },
  )
  .refine(
    (data) => {
      if (data.frequency === RECURRING_FREQUENCY.MONTHLY || data.frequency === RECURRING_FREQUENCY.YEARLY) {
        return data.dayOfMonth !== null && data.dayOfMonth !== undefined;
      }
      return true;
    },
    { message: VALIDATION_KEY.DAY_OF_MONTH_REQUIRED, path: ['dayOfMonth'] },
  )
  .refine(
    (data) => {
      if (data.frequency === RECURRING_FREQUENCY.YEARLY) {
        return data.monthOfYear !== null && data.monthOfYear !== undefined;
      }
      return true;
    },
    { message: VALIDATION_KEY.MONTH_REQUIRED, path: ['monthOfYear'] },
  );

export type CreateRecurringExpenseInput = z.infer<typeof CreateRecurringExpenseSchema>;

/**
 * Schema for updating an existing recurring expense
 */
export const UpdateRecurringExpenseSchema = z.object({
  categoryId: z.number().int().positive().optional(),
  amount: z.number().positive().optional(),
  description: z.string().max(255).optional().nullable(),
  frequency: RecurringFrequencySchema.optional(),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  monthOfYear: z.number().int().min(1).max(12).nullable().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().nullable().optional(),
  isShared: z.boolean().optional(),
  isActive: z.boolean().optional(),
  vatPercent: z.number().min(0).max(100).nullable().optional(),
  deductionPercent: z.number().min(0).max(100).nullable().optional(),
  vendorName: z.string().max(150).nullable().optional(),
  companyId: z.number().int().positive().nullable().optional(),
});

export type UpdateRecurringExpenseInput = z.infer<typeof UpdateRecurringExpenseSchema>;

/**
 * Schema for confirming an occurrence (optionally modify amount)
 */
export const ConfirmOccurrenceSchema = z.object({
  modifiedAmount: z.number().positive().optional(),
});

export type ConfirmOccurrenceInput = z.infer<typeof ConfirmOccurrenceSchema>;
