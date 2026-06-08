/**
 * BudgetGuard Invoice Schemas
 * Zod validation schemas for invoicing module
 */

import { z } from 'zod';
import { INVOICE_STATUS, PAYMENT_METHOD, VALIDATION_KEY } from '@/constants/finance';
import { requiredPositiveInt } from '@/schemas/shared';

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
 * Schema for a single invoice line item.
 * `title` + `subItems` is the structured representation; `description` is kept
 * as an optional free-form paragraph and for legacy rows. At least one of
 * `title` or `description` must be provided.
 */
const InvoiceLineItemSchema = z
  .object({
    title: z.string().trim().min(1).max(500, VALIDATION_KEY.TITLE_TOO_LONG).nullable().optional(),
    subItems: z
      .array(z.string().trim().min(1).max(500, VALIDATION_KEY.SUB_ITEM_TOO_LONG))
      .max(20, VALIDATION_KEY.TOO_MANY_SUB_ITEMS)
      .optional(),
    description: z.string().trim().min(1).max(2000).nullable().optional(),
    hours: z.number().positive().nullable().optional(),
    hourlyRateCents: z.number().int().positive().nullable().optional(),
    amountCents: requiredPositiveInt(VALIDATION_KEY.AMOUNT_POSITIVE),
  })
  .refine(
    (item) =>
      (item.title != null && item.title.length > 0) || (item.description != null && item.description.length > 0),
    {
      message: VALIDATION_KEY.TITLE_OR_DESCRIPTION_REQUIRED,
      path: ['title'],
    },
  )
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
