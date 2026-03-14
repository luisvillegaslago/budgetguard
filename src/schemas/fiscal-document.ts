/**
 * BudgetGuard Fiscal Document Schemas
 * Zod validation for fiscal document uploads, status updates, and settings
 */

import { z } from 'zod';

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
