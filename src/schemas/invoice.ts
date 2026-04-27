/**
 * BudgetGuard Invoice Schemas
 * Zod validation schemas for invoicing module
 */

import { z } from 'zod';
import { INVOICE_STATUS, PAYMENT_METHOD, VALIDATION_KEY } from '@/constants/finance';

/**
 * Schema for creating/updating a billing profile
 */
export const BillingProfileSchema = z.object({
  fullName: z.string().min(1, VALIDATION_KEY.FULL_NAME_REQUIRED).max(150),
  nif: z.string().min(1, VALIDATION_KEY.NIF_REQUIRED).max(30),
  address: z.string().max(500).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  paymentMethod: z.enum([PAYMENT_METHOD.BANK_TRANSFER, PAYMENT_METHOD.PAYPAL, PAYMENT_METHOD.OTHER]),
  bankName: z.string().max(150).optional().nullable(),
  iban: z.string().max(34).optional().nullable(),
  swift: z.string().max(11).optional().nullable(),
  bankAddress: z.string().max(500).optional().nullable(),
  defaultHourlyRateCents: z.number().int().positive().optional().nullable(),
});

export type BillingProfileInput = z.infer<typeof BillingProfileSchema>;

/**
 * Schema for creating an invoice prefix
 */
export const CreateInvoicePrefixSchema = z.object({
  prefix: z
    .string()
    .min(1, VALIDATION_KEY.PREFIX_REQUIRED)
    .max(10)
    .transform((val) => val.toUpperCase()),
  description: z.string().max(100).optional().nullable(),
  nextNumber: z.number().int().min(1).default(1),
  companyId: z.number().int().positive().optional().nullable(),
});

export type CreateInvoicePrefixInput = z.infer<typeof CreateInvoicePrefixSchema>;

/**
 * Schema for updating an invoice prefix
 */
export const UpdateInvoicePrefixSchema = z.object({
  description: z.string().max(100).optional().nullable(),
  nextNumber: z.number().int().min(1).optional(),
  companyId: z.number().int().positive().optional().nullable(),
});

export type UpdateInvoicePrefixInput = z.infer<typeof UpdateInvoicePrefixSchema>;

/**
 * Schema for a single invoice line item
 */
const InvoiceLineItemSchema = z
  .object({
    description: z.string().min(1, VALIDATION_KEY.DESCRIPTION_REQUIRED).max(2000),
    hours: z.number().positive().nullable().optional(),
    hourlyRateCents: z.number().int().positive().nullable().optional(),
    amountCents: z.number().int().positive(VALIDATION_KEY.AMOUNT_POSITIVE),
  })
  .refine(
    (item) => {
      if (item.hours != null && item.hourlyRateCents != null) {
        return item.amountCents === Math.round(item.hours * item.hourlyRateCents);
      }
      return true;
    },
    { message: VALIDATION_KEY.AMOUNT_MISMATCH, path: ['amountCents'] },
  );

/**
 * Schema for creating an invoice
 * TotalCents is NOT included — calculated server-side
 */
export const CreateInvoiceSchema = z.object({
  prefixId: z.number().int().positive(),
  invoiceDate: z.coerce.date({ message: VALIDATION_KEY.INVALID_DATE }),
  companyId: z.number().int().positive(),
  lineItems: z.array(InvoiceLineItemSchema).min(1, VALIDATION_KEY.LINE_ITEMS_REQUIRED).max(50),
  notes: z.string().max(2000).optional().nullable(),
});

export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>;

/**
 * Schema for updating invoice status
 */
export const UpdateInvoiceStatusSchema = z.object({
  status: z.enum([INVOICE_STATUS.DRAFT, INVOICE_STATUS.FINALIZED, INVOICE_STATUS.PAID, INVOICE_STATUS.CANCELLED]),
  categoryId: z.number().int().positive().optional(),
  bankFeeCents: z.number().int().nonnegative().optional(),
});

export type UpdateInvoiceStatusInput = z.infer<typeof UpdateInvoiceStatusSchema>;

/**
 * Schema for editing a draft invoice (date, line items, notes)
 * Prefix and company are locked after creation
 */
export const UpdateInvoiceSchema = z.object({
  invoiceDate: z.coerce.date({ message: VALIDATION_KEY.INVALID_DATE }),
  lineItems: z.array(InvoiceLineItemSchema).min(1, VALIDATION_KEY.LINE_ITEMS_REQUIRED).max(50),
  notes: z.string().max(2000).optional().nullable(),
});

export type UpdateInvoiceInput = z.infer<typeof UpdateInvoiceSchema>;
