/**
 * BudgetGuard Trip Schemas
 * Shared validation schemas for trip forms and API endpoints
 */

import { z } from 'zod';
import { VALIDATION_KEY } from '@/constants/finance';

/**
 * Schema for creating a new trip
 */
export const CreateTripSchema = z.object({
  name: z.string().min(1, VALIDATION_KEY.NAME_REQUIRED).max(100, VALIDATION_KEY.NAME_TOO_LONG),
});

export type CreateTripInput = z.infer<typeof CreateTripSchema>;

/**
 * Schema for updating an existing trip
 */
export const UpdateTripSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100, 'El nombre es muy largo').optional(),
});

export type UpdateTripInput = z.infer<typeof UpdateTripSchema>;

/**
 * Schema for creating a trip expense (always expense type)
 */
export const CreateTripExpenseSchema = z.object({
  categoryId: z.number().int().positive(VALIDATION_KEY.CATEGORY_REQUIRED),
  amount: z.number().positive(VALIDATION_KEY.AMOUNT_POSITIVE),
  description: z.string().max(255, VALIDATION_KEY.DESCRIPTION_TOO_LONG).optional().default(''),
  transactionDate: z.coerce.date({ message: VALIDATION_KEY.INVALID_DATE }),
  isShared: z.boolean().optional().default(false),
});

export type CreateTripExpenseInput = z.infer<typeof CreateTripExpenseSchema>;

/**
 * Schema for updating a trip expense
 */
export const UpdateTripExpenseSchema = CreateTripExpenseSchema.partial();

export type UpdateTripExpenseInput = z.infer<typeof UpdateTripExpenseSchema>;
