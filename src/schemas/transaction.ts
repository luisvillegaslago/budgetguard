/**
 * BudgetGuard Transaction Schemas
 * Shared validation schemas for frontend forms and API endpoints
 */

import { z } from 'zod';
import { MONTH_FORMAT_REGEX, TRANSACTION_TYPE } from '@/constants/finance';

/**
 * Transaction type enum
 */
export const TransactionTypeSchema = z.enum([TRANSACTION_TYPE.INCOME, TRANSACTION_TYPE.EXPENSE]);

/**
 * Schema for creating a new transaction
 * Used by both form validation and API request validation
 */
export const CreateTransactionSchema = z.object({
  categoryId: z.number().int().positive('Selecciona una categoria'),
  amount: z.number().positive('El monto debe ser mayor a 0'),
  description: z.string().max(255, 'La descripcion es muy larga').optional().default(''),
  transactionDate: z.coerce.date({ message: 'Fecha invalida' }),
  type: TransactionTypeSchema,
});

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;

/**
 * Schema for updating an existing transaction
 */
export const UpdateTransactionSchema = CreateTransactionSchema.partial().extend({
  transactionId: z.number().int().positive(),
});

export type UpdateTransactionInput = z.infer<typeof UpdateTransactionSchema>;

/**
 * Schema for transaction filters (query params)
 */
export const TransactionFiltersSchema = z.object({
  month: z.string().regex(MONTH_FORMAT_REGEX, 'Formato de mes invalido (YYYY-MM)').optional(),
  type: TransactionTypeSchema.optional(),
  categoryId: z.coerce.number().int().positive().optional(),
});

export type TransactionFiltersInput = z.infer<typeof TransactionFiltersSchema>;

/**
 * Schema for category creation
 */
export const CreateCategorySchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100, 'El nombre es muy largo'),
  type: TransactionTypeSchema,
  icon: z.string().max(50).optional().nullable(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color hex invalido')
    .optional()
    .nullable(),
  sortOrder: z.number().int().optional().default(0),
});

export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;

/**
 * Validate and parse request body
 * Returns typed data or validation errors
 */
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; errors: z.typeToFlattenedError<T>['fieldErrors'] } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, errors: result.error.flatten().fieldErrors };
}
