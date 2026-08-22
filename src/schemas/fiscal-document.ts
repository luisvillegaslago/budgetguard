/**
 * BudgetGuard Fiscal Document Schemas
 * Zod validation for fiscal document uploads, status updates, and settings
 */

import { z } from 'zod';
import type { FiscalDocumentType, ModeloType } from '@/constants/finance';
import { FISCAL_DOCUMENT_TYPE, FISCAL_STATUS, MODELO_TYPE, VALIDATION_KEY } from '@/constants/finance';
import { vatDeductionShareField } from '@/schemas/shared';
import { TransactionTypeSchema } from '@/schemas/transaction';
import { eurosToCents } from '@/utils/money';

const DocumentTypeSchema = z.enum([
  FISCAL_DOCUMENT_TYPE.MODELO,
  FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA,
  FISCAL_DOCUMENT_TYPE.FACTURA_EMITIDA,
]);

const ModeloTypeSchema = z.enum([MODELO_TYPE.M303, MODELO_TYPE.M130, MODELO_TYPE.M390, MODELO_TYPE.M100]);

const FiscalStatusSchema = z.enum([FISCAL_STATUS.PENDING, FISCAL_STATUS.FILED]);

/**
 * The two document/modelo/quarter invariants that mirror CK_FiscalDoc_Quarter in the database.
 * Shared by the single upload and the bulk upload: a quarterless 303/130 slipping through the
 * bulk schema is rejected by the CHECK constraint, which aborts the whole multi-row INSERT.
 */
interface ModeloQuarterShape {
  documentType: FiscalDocumentType;
  modeloType?: ModeloType | null;
  fiscalQuarter?: number | null;
}

const modeloTypeMatchesDocumentType = (data: ModeloQuarterShape) =>
  data.documentType === FISCAL_DOCUMENT_TYPE.MODELO ? data.modeloType != null : data.modeloType == null;

const quarterMatchesModeloType = (data: ModeloQuarterShape) => {
  if (data.modeloType === MODELO_TYPE.M390 || data.modeloType === MODELO_TYPE.M100) return data.fiscalQuarter == null;
  if (data.modeloType === MODELO_TYPE.M303 || data.modeloType === MODELO_TYPE.M130) return data.fiscalQuarter != null;
  return true;
};

const MODELO_TYPE_ISSUE: { message: string; path: string[] } = {
  message: VALIDATION_KEY.MODELO_TYPE_MISMATCH,
  path: ['modeloType'],
};

const QUARTER_ISSUE: { message: string; path: string[] } = {
  message: VALIDATION_KEY.QUARTERLY_MISMATCH,
  path: ['fiscalQuarter'],
};

/**
 * Schema for fiscal document upload metadata
 */
export const FiscalDocumentUploadSchema = z
  .object({
    documentType: DocumentTypeSchema,
    modeloType: ModeloTypeSchema.nullable().optional(),
    fiscalYear: z.coerce.number().int().min(2019).max(2100),
    fiscalQuarter: z.coerce.number().int().min(1).max(4).nullable().optional(),
    status: FiscalStatusSchema.default(FISCAL_STATUS.PENDING),
    taxAmountCents: z.coerce.number().int().nullable().optional(),
    transactionId: z.coerce.number().int().positive().nullable().optional(),
    transactionGroupId: z.coerce.number().int().positive().nullable().optional(),
    companyId: z.coerce.number().int().positive().nullable().optional(),
    description: z.string().max(255).nullable().optional(),
  })
  .refine(modeloTypeMatchesDocumentType, MODELO_TYPE_ISSUE)
  .refine(quarterMatchesModeloType, QUARTER_ISSUE);

export type FiscalDocumentUploadInput = z.infer<typeof FiscalDocumentUploadSchema>;

/**
 * Schema for updating document status
 */
export const FiscalDocumentStatusSchema = z.object({
  status: FiscalStatusSchema,
});

export type FiscalDocumentStatusInput = z.infer<typeof FiscalDocumentStatusSchema>;

/**
 * Schema for bulk upload item metadata (from auto-parsed filenames)
 */
export const BulkUploadItemSchema = z
  .object({
    documentType: DocumentTypeSchema,
    modeloType: ModeloTypeSchema.nullable().optional(),
    fiscalYear: z.coerce.number().int().min(2019).max(2100),
    fiscalQuarter: z.coerce.number().int().min(1).max(4).nullable().optional(),
    status: FiscalStatusSchema.default(FISCAL_STATUS.FILED),
    description: z.string().max(255).nullable().optional(),
  })
  .refine(modeloTypeMatchesDocumentType, MODELO_TYPE_ISSUE)
  .refine(quarterMatchesModeloType, QUARTER_ISSUE);

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
  documentType: DocumentTypeSchema.optional(),
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
        .nonnegative()
        .nullable()
        .optional()
        .transform((euros) => eurosToCents(euros ?? 0)),
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
 * Schema for raw modelo detection output — validates and converts euros→cents via .transform().
 * The caller receives DetectedModeloData. Result amount may be negative (refund due).
 */
export const DetectedModeloRawSchema = z
  .object({
    modeloType: ModeloTypeSchema.nullable().optional(),
    fiscalYear: z.number().int().nullable().optional(),
    fiscalQuarter: z.number().int().min(1).max(4).nullable().optional(),
    resultAmountEuros: z.preprocess(
      sanitizeAmount,
      // Result may be negative (amount to be refunded), so no .nonnegative()
      z.number().nullable().optional(),
    ),
    confidence: z.number().min(0).max(1),
  })
  .transform((data) => {
    const modeloType = data.modeloType ?? null;
    // 390 and 100 are annual modelos: they never carry a quarter
    const isAnnual = modeloType === MODELO_TYPE.M390 || modeloType === MODELO_TYPE.M100;
    return {
      modeloType,
      fiscalYear: data.fiscalYear ?? null,
      fiscalQuarter: isAnnual ? null : (data.fiscalQuarter ?? null),
      resultAmountCents: data.resultAmountEuros == null ? null : eurosToCents(data.resultAmountEuros),
      confidence: data.confidence,
    };
  });

/**
 * Schema for link-transaction request (create transaction + link to document)
 */
export const LinkTransactionSchema = z.object({
  categoryId: z.number().int().positive(),
  amountCents: z.number().int().positive(VALIDATION_KEY.AMOUNT_POSITIVE),
  transactionDate: z.string(),
  type: TransactionTypeSchema,
  description: z.string().nullable().optional(),
  vatPercent: z.number().min(0).max(100).nullable().optional(),
  deductionPercent: z.number().min(0).max(100).nullable().optional(),
  /** Null (or absent) is VAT_DEDUCTION_INHERITS_IRPF: the IVA share follows deductionPercent */
  vatDeductionPercent: vatDeductionShareField(),
  vendorName: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  companyId: z.number().int().positive().nullable().optional(),
  isShared: z.boolean().optional(),
});

export type LinkTransactionInput = z.infer<typeof LinkTransactionSchema>;
