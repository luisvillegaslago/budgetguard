/**
 * BudgetGuard Trip Schemas
 * Shared validation schemas for trip forms and API endpoints
 */

import { z } from 'zod';

/**
 * Schema for creating a new trip
 */
export const CreateTripSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100, 'El nombre es muy largo'),
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
  categoryId: z.number().int().positive('Selecciona una categoria'),
  amount: z.number().positive('El monto debe ser mayor a 0'),
  description: z.string().max(255, 'La descripcion es muy larga').optional().default(''),
  transactionDate: z.coerce.date({ message: 'Fecha invalida' }),
  isShared: z.boolean().optional().default(false),
});

export type CreateTripExpenseInput = z.infer<typeof CreateTripExpenseSchema>;

/**
 * Schema for updating a trip expense
 */
export const UpdateTripExpenseSchema = CreateTripExpenseSchema.partial();

export type UpdateTripExpenseInput = z.infer<typeof UpdateTripExpenseSchema>;
