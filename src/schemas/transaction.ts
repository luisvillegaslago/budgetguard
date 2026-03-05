/**
 * BudgetGuard Transaction Schemas
 * Shared validation schemas for frontend forms and API endpoints
 */

import { z } from 'zod';
import { DATE_RANGE_PRESET, MONTH_FORMAT_REGEX, TRANSACTION_TYPE } from '@/constants/finance';

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
  isShared: z.boolean().optional().default(false),
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
  parentCategoryId: z.number().int().positive().optional().nullable(),
  defaultShared: z.boolean().optional().default(false),
});

export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;

/**
 * Schema for updating an existing category
 * Type and parentCategoryId are immutable post-creation
 */
export const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().max(50).optional().nullable(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  defaultShared: z.boolean().optional(),
});

export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;

/**
 * Schema for a single item within a transaction group
 */
const TransactionGroupItemSchema = z.object({
  categoryId: z.number().int().positive(),
  amount: z.number().positive(),
});

/**
 * Schema for creating a transaction group (multiple linked transactions)
 */
export const CreateTransactionGroupSchema = z.object({
  description: z.string().min(1).max(255),
  transactionDate: z.coerce.date({ message: 'Fecha invalida' }),
  type: TransactionTypeSchema,
  isShared: z.boolean().optional().default(false),
  parentCategoryId: z.number().int().positive(),
  items: z.array(TransactionGroupItemSchema).min(1).max(20),
});

export type CreateTransactionGroupInput = z.infer<typeof CreateTransactionGroupSchema>;

/**
 * Schema for updating a transaction group (description and date propagated to all)
 */
export const UpdateTransactionGroupSchema = z.object({
  description: z.string().min(1).max(255).optional(),
  transactionDate: z.coerce.date({ message: 'Fecha invalida' }).optional(),
});

export type UpdateTransactionGroupInput = z.infer<typeof UpdateTransactionGroupSchema>;

/**
 * Schema for category history filters (query params)
 */
export const CategoryHistoryFiltersSchema = z.object({
  range: z
    .enum([
      DATE_RANGE_PRESET.THREE_MONTHS,
      DATE_RANGE_PRESET.SIX_MONTHS,
      DATE_RANGE_PRESET.ONE_YEAR,
      DATE_RANGE_PRESET.ALL,
    ])
    .optional()
    .default(DATE_RANGE_PRESET.ONE_YEAR),
});

export type CategoryHistoryFiltersInput = z.infer<typeof CategoryHistoryFiltersSchema>;

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
