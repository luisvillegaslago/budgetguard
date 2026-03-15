/**
 * Unit tests for InvoiceFinalizeService.
 * Tests the orchestration logic: validate → refresh → PDF → blob → transaction.
 */

import { API_ERROR, FISCAL_DOCUMENT_TYPE, FISCAL_STATUS, INVOICE_STATUS } from '@/constants/finance';
import type { Invoice } from '@/types/finance';

// ============================================================
// Mock Data
// ============================================================

const mockDraftInvoice: Invoice = {
  invoiceId: 1,
  prefixId: 1,
  invoiceNumber: 'INV-01',
  invoiceDate: '2025-07-15',
  companyId: 10,
  transactionId: null,
  totalCents: 120000,
  currency: 'EUR',
  status: INVOICE_STATUS.DRAFT,
  billerName: 'Test Biller',
  billerNif: 'B12345678',
  billerAddress: 'Biller Address',
  billerPhone: null,
  billerPaymentMethod: 'bank_transfer',
  billerBankName: 'Test Bank',
  billerIban: 'ES1234567890',
  billerSwift: 'TESTSWIFT',
  billerBankAddress: null,
  clientName: 'Test Client',
  clientTradingName: null,
  clientTaxId: 'A87654321',
  clientAddress: 'Client Address',
  clientCity: 'Madrid',
  clientPostalCode: '28001',
  clientCountry: 'ES',
  notes: null,
  invoiceLanguage: 'es',
  lineItems: [
    {
      lineItemId: 1,
      invoiceId: 1,
      sortOrder: 0,
      description: 'Development',
      hours: 10,
      hourlyRateCents: 12000,
      amountCents: 120000,
    },
  ],
  createdAt: '2025-07-15T10:00:00.000Z',
  updatedAt: '2025-07-15T10:00:00.000Z',
};

const mockFinalizedInvoice: Invoice = {
  ...mockDraftInvoice,
  status: INVOICE_STATUS.FINALIZED,
};

const mockPdfBuffer = Buffer.from('mock-pdf-bytes');

// ============================================================
// State Capture
// ============================================================

let capturedBlobPath: string | null = null;
let capturedBlobBuffer: Buffer | null = null;
let capturedTransactionQueries: { text: string; params: unknown[] }[] = [];
let transactionShouldFail = false;

// ============================================================
// Mocks
// ============================================================

const mockClientQuery = jest.fn(async (text: string, params?: unknown[]) => {
  capturedTransactionQueries.push({ text, params: params ?? [] });
  if (transactionShouldFail && text === 'COMMIT') {
    throw new Error('Transaction failed');
  }
  return { rows: [] };
});

const mockClientRelease = jest.fn();

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 'user-123'),
}));

jest.mock('@/services/database/InvoiceRepository', () => ({
  getInvoiceById: jest.fn(async (id: number) => {
    if (id === 1) return mockDraftInvoice;
    if (id === 2) return mockFinalizedInvoice;
    return null;
  }),
}));

jest.mock('@/services/database/connection', () => ({
  getPool: jest.fn(() => ({
    query: jest.fn(async () => ({ rows: [] })),
    connect: jest.fn(async () => ({
      query: mockClientQuery,
      release: mockClientRelease,
    })),
  })),
}));

jest.mock('@/utils/invoicePdf', () => ({
  prepareInvoicePdf: jest.fn(async (id: number) => {
    if (id === 1) {
      return {
        invoice: { ...mockDraftInvoice, billerName: 'Updated Biller' },
        pdfBuffer: mockPdfBuffer,
        fileName: `invoice_${mockDraftInvoice.invoiceNumber}.pdf`,
      };
    }
    throw new Error(API_ERROR.NOT_FOUND.INVOICE);
  }),
}));

jest.mock('@vercel/blob', () => ({
  put: jest.fn(async (path: string, buffer: Buffer) => {
    capturedBlobPath = path;
    capturedBlobBuffer = buffer;
    return {
      url: 'https://blob.vercel-storage.com/test-url',
      pathname: path,
    };
  }),
}));

// ============================================================
// Import AFTER mocks
// ============================================================

import { finalizeInvoice } from '@/services/InvoiceFinalizeService';

// ============================================================
// Tests
// ============================================================

describe('InvoiceFinalizeService', () => {
  beforeEach(() => {
    capturedBlobPath = null;
    capturedBlobBuffer = null;
    capturedTransactionQueries = [];
    transactionShouldFail = false;
    jest.clearAllMocks();
  });

  describe('validation', () => {
    it('should throw when invoice not found', async () => {
      await expect(finalizeInvoice(999)).rejects.toThrow(API_ERROR.NOT_FOUND.INVOICE);
    });

    it('should throw when invoice is not draft', async () => {
      await expect(finalizeInvoice(2)).rejects.toThrow(API_ERROR.INVOICE.CANNOT_FINALIZE);
    });
  });

  describe('happy path', () => {
    it('should return PDF buffer and filename', async () => {
      const result = await finalizeInvoice(1);

      expect(result.pdfBuffer).toBe(mockPdfBuffer);
      expect(result.fileName).toBe('invoice_INV-01.pdf');
    });

    it('should call prepareInvoicePdf with correct id', async () => {
      await finalizeInvoice(1);

      const { prepareInvoicePdf } = require('@/utils/invoicePdf');
      expect(prepareInvoicePdf).toHaveBeenCalledWith(1);
    });
  });

  describe('blob upload', () => {
    it('should upload PDF to correct path', async () => {
      await finalizeInvoice(1);

      const expectedYear = new Date().getUTCFullYear();
      expect(capturedBlobPath).toBe(`fiscal/user-123/${expectedYear}/invoice_INV-01.pdf`);
    });

    it('should upload the generated PDF buffer', async () => {
      await finalizeInvoice(1);

      expect(capturedBlobBuffer).toBe(mockPdfBuffer);
    });
  });

  describe('SQL transaction', () => {
    it('should execute BEGIN, INSERT FiscalDocument, UPDATE Invoice, COMMIT', async () => {
      await finalizeInvoice(1);

      const queryTexts = capturedTransactionQueries.map((q) => q.text);
      expect(queryTexts[0]).toBe('BEGIN');
      expect(queryTexts[1]).toContain('INSERT INTO "FiscalDocuments"');
      expect(queryTexts[2]).toContain('UPDATE "Invoices"');
      expect(queryTexts[3]).toBe('COMMIT');
    });

    it('should insert FiscalDocument with correct type and status', async () => {
      await finalizeInvoice(1);

      const insertQuery = capturedTransactionQueries[1]!;
      expect(insertQuery.params).toContain(FISCAL_DOCUMENT_TYPE.FACTURA_EMITIDA);
      expect(insertQuery.params).toContain(FISCAL_STATUS.FILED);
    });

    it('should derive fiscal quarter from today date', async () => {
      await finalizeInvoice(1);

      const insertQuery = capturedTransactionQueries[1]!;
      const now = new Date();
      const expectedYear = now.getUTCFullYear();
      const expectedQuarter = Math.ceil((now.getUTCMonth() + 1) / 3);
      expect(insertQuery.params).toContain(expectedYear);
      expect(insertQuery.params).toContain(expectedQuarter);
    });

    it('should include company ID in fiscal document', async () => {
      await finalizeInvoice(1);

      const insertQuery = capturedTransactionQueries[1]!;
      expect(insertQuery.params).toContain(10); // companyId from mockDraftInvoice
    });

    it('should include total cents as tax amount', async () => {
      await finalizeInvoice(1);

      const insertQuery = capturedTransactionQueries[1]!;
      expect(insertQuery.params).toContain(120000);
    });

    it('should update invoice status to finalized', async () => {
      await finalizeInvoice(1);

      const updateQuery = capturedTransactionQueries[2]!;
      expect(updateQuery.params).toContain(INVOICE_STATUS.FINALIZED);
      expect(updateQuery.params).toContain(1); // invoiceId
      expect(updateQuery.params).toContain('user-123'); // userId
    });

    it('should include description with invoice number and client', async () => {
      await finalizeInvoice(1);

      const insertQuery = capturedTransactionQueries[1]!;
      expect(insertQuery.params).toContain('Factura INV-01 - Test Client');
    });

    it('should release client connection after success', async () => {
      await finalizeInvoice(1);

      expect(mockClientRelease).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should ROLLBACK on transaction failure', async () => {
      transactionShouldFail = true;

      await expect(finalizeInvoice(1)).rejects.toThrow('Transaction failed');

      const queryTexts = capturedTransactionQueries.map((q) => q.text);
      expect(queryTexts).toContain('ROLLBACK');
    });

    it('should release client connection on error', async () => {
      transactionShouldFail = true;

      try {
        await finalizeInvoice(1);
      } catch {
        // expected
      }

      expect(mockClientRelease).toHaveBeenCalledTimes(1);
    });

    it('should not start transaction if blob upload fails', async () => {
      const { put } = require('@vercel/blob');
      put.mockRejectedValueOnce(new Error('Blob upload failed'));

      await expect(finalizeInvoice(1)).rejects.toThrow('Blob upload failed');

      // No transaction queries should have been executed
      expect(capturedTransactionQueries).toHaveLength(0);
    });
  });
});
