/**
 * Integration tests for POST /api/invoices/[id]/finalize.
 * Tests the finalize endpoint with mocked service layer.
 */

import { API_ERROR, INVOICE_STATUS } from '@/constants/finance';

// ============================================================
// Mock Data
// ============================================================

const mockPdfBuffer = Buffer.from('mock-pdf-content');
const mockInvoice = {
  invoiceId: 1,
  invoiceNumber: 'INV-01',
  status: INVOICE_STATUS.FINALIZED,
  totalCents: 50000,
};

// ============================================================
// State Capture
// ============================================================

let capturedInvoiceId: number | null = null;
let shouldThrowNotFound = false;
let shouldThrowInvalidStatus = false;
let shouldThrowBlobError = false;

// ============================================================
// Mocks
// ============================================================

jest.mock('@/services/InvoiceFinalizeService', () => ({
  finalizeInvoice: jest.fn(async (invoiceId: number) => {
    capturedInvoiceId = invoiceId;

    if (shouldThrowNotFound) throw new Error(API_ERROR.NOT_FOUND.INVOICE);
    if (shouldThrowInvalidStatus) throw new Error("Cannot finalize invoice with status 'finalized'");
    if (shouldThrowBlobError) throw new Error('Blob upload failed');

    return {
      pdfBuffer: mockPdfBuffer,
      fileName: 'INV-01.pdf',
      invoice: { ...mockInvoice, invoiceId },
    };
  }),
}));

jest.mock('next/server', () => {
  const responseFactory = jest.fn((body: Buffer, init: { status: number; headers: Record<string, string> }) => ({
    status: init.status,
    headers: new Map(Object.entries(init.headers)),
    body,
    arrayBuffer: async () => body,
  }));

  // Static method used by withApiHandler for JSON error/success responses
  (responseFactory as unknown as Record<string, unknown>).json = (data: unknown, options?: { status?: number }) => ({
    status: options?.status ?? 200,
    json: async () => data,
  });

  return { NextResponse: responseFactory };
});

// ============================================================
// Import route AFTER mocks
// ============================================================

import { POST } from '@/app/api/invoices/[id]/finalize/route';

// ============================================================
// Helpers
// ============================================================

function createMockRequest(url: string): { url: string; json: () => Promise<Record<string, unknown>> } {
  return { url, json: async () => ({}) };
}

function createMockParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// ============================================================
// Tests
// ============================================================

describe('POST /api/invoices/[id]/finalize', () => {
  // biome-ignore lint/suspicious/noConsole: save/restore console.error to silence expected errors in tests
  const originalConsoleError = console.error;

  beforeEach(() => {
    capturedInvoiceId = null;
    shouldThrowNotFound = false;
    shouldThrowInvalidStatus = false;
    shouldThrowBlobError = false;
    jest.clearAllMocks();
    // Silence expected console.error from withApiHandler on error paths
    console.error = jest.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('should finalize invoice and return PDF binary', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices/1/finalize');
    const response = await POST(request as never, createMockParams('1'));

    expect(response.status).toBe(200);
    expect(capturedInvoiceId).toBe(1);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toContain('INV-01.pdf');
  });

  it('should pass correct invoice id to service', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices/42/finalize');
    await POST(request as never, createMockParams('42'));

    expect(capturedInvoiceId).toBe(42);
  });

  it('should return 400 for invalid id', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices/abc/finalize');
    const response = await POST(request as never, createMockParams('abc'));

    expect(response.status).toBe(400);
  });

  it('should return 500 when invoice not found', async () => {
    shouldThrowNotFound = true;
    const request = createMockRequest('http://localhost:3000/api/invoices/999/finalize');
    const response = await POST(request as never, createMockParams('999'));

    expect(response.status).toBe(500);
  });

  it('should return 500 when invoice is not draft', async () => {
    shouldThrowInvalidStatus = true;
    const request = createMockRequest('http://localhost:3000/api/invoices/1/finalize');
    const response = await POST(request as never, createMockParams('1'));

    expect(response.status).toBe(500);
  });

  it('should return 500 when blob upload fails', async () => {
    shouldThrowBlobError = true;
    const request = createMockRequest('http://localhost:3000/api/invoices/1/finalize');
    const response = await POST(request as never, createMockParams('1'));

    expect(response.status).toBe(500);
  });

  it('should set Content-Length header from PDF buffer', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices/1/finalize');
    const response = await POST(request as never, createMockParams('1'));

    expect(response.headers.get('Content-Length')).toBe(String(mockPdfBuffer.byteLength));
  });
});
