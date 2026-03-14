/**
 * BudgetGuard Fiscal Document Schemas
 * Zod validation for fiscal document uploads, status updates, and settings
 */

import { z } from 'zod';
import { eurosToCents } from '@/utils/money';

/**
 * Schema for fiscal document upload metadata
 */
export const FiscalDocumentUploadSchema = z
  .object({
    documentType: z.enum(['modelo', 'factura_recibida', 'factura_emitida']),
    modeloType: z.enum(['303', '130', '390', '100']).nullable().optional(),
    fiscalYear: z.coerce.number().int().min(2019).max(2100),
    fiscalQuarter: z.coerce.number().int().min(1).max(4).nullable().optional(),
    status: z.enum(['pending', 'filed']).default('pending'),
    taxAmountCents: z.coerce.number().int().nullable().optional(),
    transactionId: z.coerce.number().int().positive().nullable().optional(),
    transactionGroupId: z.coerce.number().int().positive().nullable().optional(),
    companyId: z.coerce.number().int().positive().nullable().optional(),
    description: z.string().max(255).nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.documentType === 'modelo') return data.modeloType != null;
      return data.modeloType == null;
    },
    { message: 'Modelos require modeloType; facturas must not have it', path: ['modeloType'] },
  )
  .refine(
    (data) => {
      if (data.modeloType === '390' || data.modeloType === '100') return data.fiscalQuarter == null;
      if (data.modeloType === '303' || data.modeloType === '130') return data.fiscalQuarter != null;
      return true;
    },
    { message: 'Quarterly modelos require fiscalQuarter; annual modelos must not', path: ['fiscalQuarter'] },
  );

export type FiscalDocumentUploadInput = z.infer<typeof FiscalDocumentUploadSchema>;

/**
 * Schema for updating document status
 */
export const FiscalDocumentStatusSchema = z.object({
  status: z.enum(['pending', 'filed']),
});

export type FiscalDocumentStatusInput = z.infer<typeof FiscalDocumentStatusSchema>;

/**
 * Schema for bulk upload item metadata (from auto-parsed filenames)
 */
export const BulkUploadItemSchema = z.object({
  documentType: z.enum(['modelo', 'factura_recibida', 'factura_emitida']),
  modeloType: z.enum(['303', '130', '390', '100']).nullable().optional(),
  fiscalYear: z.coerce.number().int().min(2019).max(2100),
  fiscalQuarter: z.coerce.number().int().min(1).max(4).nullable().optional(),
  status: z.enum(['pending', 'filed']).default('filed'),
  description: z.string().max(255).nullable().optional(),
});

export type BulkUploadItemInput = z.infer<typeof BulkUploadItemSchema>;

/**
 * Schema for fiscal deadline settings
 */
export const FiscalDeadlineSettingsSchema = z.object({
  reminderDaysBefore: z.coerce.number().int().min(1).max(90).default(7),
  postponementReminder: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export type FiscalDeadlineSettingsInput = z.infer<typeof FiscalDeadlineSettingsSchema>;

/**
 * Schema for fiscal documents list filters
 */
export const FiscalDocumentsFiltersSchema = z.object({
  year: z.coerce.number().int().min(2019).max(2100),
  quarter: z.coerce.number().int().min(1).max(4).optional(),
  documentType: z.enum(['modelo', 'factura_recibida', 'factura_emitida']).optional(),
});

export type FiscalDocumentsFiltersInput = z.infer<typeof FiscalDocumentsFiltersSchema>;

// ============================================================
// OCR Extraction Schemas
// ============================================================

/**
 * Sanitize OCR amount values: "419,28 €" → 419.28
 */
const sanitizeAmount = (val: unknown) =>
  typeof val === 'string' ? Number.parseFloat(val.replace(/[€\s]/g, '').replace(',', '.')) : val;

/**
 * Schema for raw OCR output — validates and converts euros→cents via .transform()
 * The caller receives ExtractedInvoiceData (all amounts in cents).
 */
export const ExtractedInvoiceRawSchema = z
  .object({
    totalAmountEuros: z.preprocess(
      sanitizeAmount,
      z
        .number()
        .positive()
        .transform((euros) => eurosToCents(euros)),
    ),
    baseAmountEuros: z.preprocess(
      sanitizeAmount,
      z
        .number()
        .transform((euros) => eurosToCents(euros))
        .nullable()
        .optional(),
    ),
    taxAmountEuros: z.preprocess(
      sanitizeAmount,
      z
        .number()
        .transform((euros) => eurosToCents(euros))
        .nullable()
        .optional(),
    ),
    vatPercent: z.number().nullable().optional(),
    date: z.string().nullable().optional(),
    vendor: z.string().nullable().optional(),
    invoiceNumber: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    confidence: z.number().min(0).max(1),
  })
  .transform((data) => ({
    totalAmountCents: data.totalAmountEuros,
    baseAmountCents: data.baseAmountEuros ?? null,
    taxAmountCents: data.taxAmountEuros ?? null,
    vatPercent: data.vatPercent ?? null,
    date: data.date ?? null,
    vendor: data.vendor ?? null,
    invoiceNumber: data.invoiceNumber ?? null,
    description: data.description ?? null,
    confidence: data.confidence,
  }));

/**
 * Schema for link-transaction request (create transaction + link to document)
 */
export const LinkTransactionSchema = z.object({
  categoryId: z.number().int().positive(),
  amountCents: z.number().int(),
  transactionDate: z.string(),
  type: z.enum(['income', 'expense']),
  description: z.string().nullable().optional(),
  vatPercent: z.number().nullable().optional(),
  deductionPercent: z.number().nullable().optional(),
  vendorName: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  companyId: z.number().int().positive().nullable().optional(),
  isShared: z.boolean().optional(),
});

export type LinkTransactionInput = z.infer<typeof LinkTransactionSchema>;
