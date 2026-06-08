/**
 * BudgetGuard Voucher ("bono") Schemas
 * Shared validation schemas for frontend forms and API endpoints.
 * A voucher is a prepaid balance; consumption is recorded as normal expense
 * transactions that reference the voucher (no transaction at purchase time).
 */

import { z } from 'zod';
import { VALIDATION_KEY } from '@/constants/finance';
import { requiredPositiveInt, requiredPositiveNumber } from '@/schemas/shared';

/**
 * Schema for creating a new voucher.
 * `totalAmount` and `totalUnits` are entered in human units (euros / minutes);
 * the API converts the amount to cents for storage.
 */
export const CreateVoucherSchema = z.object({
  categoryId: requiredPositiveInt(VALIDATION_KEY.CATEGORY_REQUIRED),
  description: z.string().max(255, VALIDATION_KEY.DESCRIPTION_TOO_LONG).optional().default(''),
  totalAmount: requiredPositiveNumber(VALIDATION_KEY.VOUCHER_TOTAL_POSITIVE),
  totalUnits: z.number().positive(VALIDATION_KEY.VOUCHER_UNITS_POSITIVE).optional().nullable(),
  unitLabel: z.string().max(20).optional().nullable(),
  purchaseDate: z.coerce.date({ message: VALIDATION_KEY.INVALID_DATE }),
  expiryDate: z.coerce.date({ message: VALIDATION_KEY.INVALID_DATE }).optional().nullable(),
});

export type CreateVoucherInput = z.infer<typeof CreateVoucherSchema>;

/**
 * Schema for updating an existing voucher (all fields optional).
 */
export const UpdateVoucherSchema = CreateVoucherSchema.partial();

export type UpdateVoucherInput = z.infer<typeof UpdateVoucherSchema>;
