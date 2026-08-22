/**
 * Unit tests for fiscal document Zod schemas.
 * Validates upload metadata, status updates, bulk upload, and settings schemas.
 */

import { FISCAL_DOCUMENT_TYPE, FISCAL_STATUS, MODELO_TYPE, TRANSACTION_TYPE } from '@/constants/finance';
import {
  BulkUploadItemSchema,
  FiscalDeadlineSettingsSchema,
  FiscalDocumentStatusSchema,
  FiscalDocumentsFiltersSchema,
  FiscalDocumentUploadSchema,
  LinkTransactionSchema,
} from '@/schemas/fiscal-document';

describe('FiscalDocumentUploadSchema', () => {
  const validModelo = {
    documentType: FISCAL_DOCUMENT_TYPE.MODELO,
    modeloType: MODELO_TYPE.M303,
    fiscalYear: 2025,
    fiscalQuarter: 1,
    status: FISCAL_STATUS.FILED,
  };

  const validFactura = {
    documentType: FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA,
    fiscalYear: 2025,
  };

  describe('valid inputs', () => {
    it('should accept a valid modelo with quarter', () => {
      const result = FiscalDocumentUploadSchema.safeParse(validModelo);

      expect(result.success).toBe(true);
    });

    it('should accept an annual modelo without quarter', () => {
      const result = FiscalDocumentUploadSchema.safeParse({
        ...validModelo,
        modeloType: MODELO_TYPE.M390,
        fiscalQuarter: null,
      });

      expect(result.success).toBe(true);
    });

    it('should accept a factura recibida without modeloType', () => {
      const result = FiscalDocumentUploadSchema.safeParse(validFactura);

      expect(result.success).toBe(true);
    });

    it('should accept optional fields', () => {
      const result = FiscalDocumentUploadSchema.safeParse({
        ...validModelo,
        taxAmountCents: 15000,
        description: 'IVA Q1 2025',
        companyId: 5,
      });

      expect(result.success).toBe(true);
    });

    it('should coerce string year to number', () => {
      const result = FiscalDocumentUploadSchema.safeParse({
        ...validModelo,
        fiscalYear: '2025',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fiscalYear).toBe(2025);
      }
    });
  });

  describe('constraint violations', () => {
    it('should reject modelo without modeloType', () => {
      const result = FiscalDocumentUploadSchema.safeParse({
        ...validModelo,
        modeloType: null,
      });

      expect(result.success).toBe(false);
    });

    it('should reject factura with modeloType', () => {
      const result = FiscalDocumentUploadSchema.safeParse({
        ...validFactura,
        modeloType: MODELO_TYPE.M303,
      });

      expect(result.success).toBe(false);
    });

    it('should reject quarterly modelo (303) without quarter', () => {
      const result = FiscalDocumentUploadSchema.safeParse({
        ...validModelo,
        fiscalQuarter: null,
      });

      expect(result.success).toBe(false);
    });

    it('should reject annual modelo (390) with quarter', () => {
      const result = FiscalDocumentUploadSchema.safeParse({
        ...validModelo,
        modeloType: MODELO_TYPE.M390,
        fiscalQuarter: 1,
      });

      expect(result.success).toBe(false);
    });

    it('should reject year before 2019', () => {
      const result = FiscalDocumentUploadSchema.safeParse({
        ...validModelo,
        fiscalYear: 2018,
      });

      expect(result.success).toBe(false);
    });

    it('should reject quarter outside 1-4', () => {
      const result = FiscalDocumentUploadSchema.safeParse({
        ...validModelo,
        fiscalQuarter: 5,
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid document type', () => {
      const result = FiscalDocumentUploadSchema.safeParse({
        ...validModelo,
        documentType: 'receipt',
      });

      expect(result.success).toBe(false);
    });
  });
});

describe('FiscalDocumentStatusSchema', () => {
  it('should accept valid statuses', () => {
    expect(FiscalDocumentStatusSchema.safeParse({ status: FISCAL_STATUS.FILED }).success).toBe(true);
    expect(FiscalDocumentStatusSchema.safeParse({ status: FISCAL_STATUS.PENDING }).success).toBe(true);
  });

  it('should reject invalid status', () => {
    expect(FiscalDocumentStatusSchema.safeParse({ status: 'cancelled' }).success).toBe(false);
  });
});

describe('BulkUploadItemSchema', () => {
  it('should accept valid bulk item', () => {
    const result = BulkUploadItemSchema.safeParse({
      documentType: FISCAL_DOCUMENT_TYPE.MODELO,
      modeloType: MODELO_TYPE.M303,
      fiscalYear: 2024,
      fiscalQuarter: 2,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe(FISCAL_STATUS.FILED); // default
    }
  });

  it('should accept factura without modeloType', () => {
    const result = BulkUploadItemSchema.safeParse({
      documentType: FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA,
      fiscalYear: 2024,
    });

    expect(result.success).toBe(true);
  });

  // The bulk schema must carry the same invariants as the single upload: CK_FiscalDoc_Quarter
  // rejects a quarterless 303/130, and bulkCreateDocuments is one multi-row INSERT, so a row the
  // schema lets through aborts the whole batch instead of failing that single file.
  it('should reject a quarterly modelo (303) without quarter — "303 2025.pdf"', () => {
    const result = BulkUploadItemSchema.safeParse({
      documentType: FISCAL_DOCUMENT_TYPE.MODELO,
      modeloType: MODELO_TYPE.M303,
      fiscalYear: 2025,
      fiscalQuarter: null,
    });

    expect(result.success).toBe(false);
  });

  it('should reject a quarterly modelo (130) without quarter', () => {
    const result = BulkUploadItemSchema.safeParse({
      documentType: FISCAL_DOCUMENT_TYPE.MODELO,
      modeloType: MODELO_TYPE.M130,
      fiscalYear: 2025,
    });

    expect(result.success).toBe(false);
  });

  it('should accept an annual modelo (390) without quarter', () => {
    const result = BulkUploadItemSchema.safeParse({
      documentType: FISCAL_DOCUMENT_TYPE.MODELO,
      modeloType: MODELO_TYPE.M390,
      fiscalYear: 2024,
      fiscalQuarter: null,
    });

    expect(result.success).toBe(true);
  });

  it('should reject an annual modelo (100) with quarter', () => {
    const result = BulkUploadItemSchema.safeParse({
      documentType: FISCAL_DOCUMENT_TYPE.MODELO,
      modeloType: MODELO_TYPE.M100,
      fiscalYear: 2024,
      fiscalQuarter: 1,
    });

    expect(result.success).toBe(false);
  });

  it('should reject a modelo without modeloType', () => {
    const result = BulkUploadItemSchema.safeParse({
      documentType: FISCAL_DOCUMENT_TYPE.MODELO,
      fiscalYear: 2024,
    });

    expect(result.success).toBe(false);
  });

  it('should reject a factura carrying a modeloType', () => {
    const result = BulkUploadItemSchema.safeParse({
      documentType: FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA,
      modeloType: MODELO_TYPE.M303,
      fiscalYear: 2024,
      fiscalQuarter: 1,
    });

    expect(result.success).toBe(false);
  });
});

describe('LinkTransactionSchema', () => {
  const validLink = {
    categoryId: 3,
    amountCents: 100000,
    transactionDate: '2025-03-14',
    type: TRANSACTION_TYPE.EXPENSE,
  };

  it('should accept a valid link payload', () => {
    expect(LinkTransactionSchema.safeParse(validLink).success).toBe(true);
  });

  // 100000 cents at 21% is 82645 base + 17355 IVA. A 500% share would deduct 413225 cents of
  // base and 86775 cents of input VAT that never existed on the invoice.
  it('should reject a deductionPercent above 100', () => {
    expect(LinkTransactionSchema.safeParse({ ...validLink, deductionPercent: 500 }).success).toBe(false);
  });

  it('should reject a negative deductionPercent', () => {
    expect(LinkTransactionSchema.safeParse({ ...validLink, deductionPercent: -10 }).success).toBe(false);
  });

  it('should reject a vatPercent above 100', () => {
    expect(LinkTransactionSchema.safeParse({ ...validLink, vatPercent: 200 }).success).toBe(false);
  });

  it('should accept the 0 and 100 bounds of both shares', () => {
    expect(LinkTransactionSchema.safeParse({ ...validLink, vatPercent: 0, deductionPercent: 0 }).success).toBe(true);
    expect(LinkTransactionSchema.safeParse({ ...validLink, vatPercent: 100, deductionPercent: 100 }).success).toBe(
      true,
    );
  });

  it('should keep null deductionPercent / vatPercent (no share recorded)', () => {
    expect(LinkTransactionSchema.safeParse({ ...validLink, vatPercent: null, deductionPercent: null }).success).toBe(
      true,
    );
  });

  // A failed OCR read pre-fills the amount with 0: it must not reach the DB as a filed document
  // with TaxAmountCents = 0, nor as a negative expense that subtracts from casillas 28/29.
  it('should reject amountCents of 0 (unread OCR total)', () => {
    expect(LinkTransactionSchema.safeParse({ ...validLink, amountCents: 0 }).success).toBe(false);
  });

  it('should reject a negative amountCents', () => {
    expect(LinkTransactionSchema.safeParse({ ...validLink, amountCents: -10000 }).success).toBe(false);
  });

  it('should reject a non-integer amountCents', () => {
    expect(LinkTransactionSchema.safeParse({ ...validLink, amountCents: 1000.5 }).success).toBe(false);
  });
});

describe('FiscalDeadlineSettingsSchema', () => {
  it('should accept valid settings', () => {
    const result = FiscalDeadlineSettingsSchema.safeParse({
      reminderDaysBefore: 14,
      postponementReminder: true,
      isActive: true,
    });

    expect(result.success).toBe(true);
  });

  it('should apply defaults', () => {
    const result = FiscalDeadlineSettingsSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reminderDaysBefore).toBe(7);
      expect(result.data.postponementReminder).toBe(true);
      expect(result.data.isActive).toBe(true);
    }
  });

  it('should reject days < 1 or > 90', () => {
    expect(FiscalDeadlineSettingsSchema.safeParse({ reminderDaysBefore: 0 }).success).toBe(false);
    expect(FiscalDeadlineSettingsSchema.safeParse({ reminderDaysBefore: 91 }).success).toBe(false);
  });

  it('should coerce string to number', () => {
    const result = FiscalDeadlineSettingsSchema.safeParse({ reminderDaysBefore: '30' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reminderDaysBefore).toBe(30);
    }
  });
});

describe('FiscalDocumentsFiltersSchema', () => {
  it('should accept year only', () => {
    const result = FiscalDocumentsFiltersSchema.safeParse({ year: '2025' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.year).toBe(2025);
    }
  });

  it('should accept year + quarter + documentType', () => {
    const result = FiscalDocumentsFiltersSchema.safeParse({
      year: '2025',
      quarter: '1',
      documentType: FISCAL_DOCUMENT_TYPE.MODELO,
    });

    expect(result.success).toBe(true);
  });

  it('should reject invalid documentType', () => {
    const result = FiscalDocumentsFiltersSchema.safeParse({
      year: '2025',
      documentType: 'receipt',
    });

    expect(result.success).toBe(false);
  });
});
