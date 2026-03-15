/**
 * Integration tests for fiscal documents API routes.
 * Tests GET list, GET by id, PATCH status, DELETE with mocked repository and blob storage.
 */

import { FISCAL_DOCUMENT_TYPE, FISCAL_STATUS, MODELO_TYPE } from '@/constants/finance';
import type { FiscalDocument } from '@/types/finance';

// ============================================================
// Mock Data
// ============================================================

const mockDocument: FiscalDocument = {
  documentId: 1,
  documentType: FISCAL_DOCUMENT_TYPE.MODELO,
  modeloType: MODELO_TYPE.M303,
  fiscalYear: 2025,
  fiscalQuarter: 1,
  status: FISCAL_STATUS.FILED,
  downloadUrl: '/api/fiscal/documents/1/download',
  fileName: '303 1T 2025.pdf',
  fileSizeBytes: 52400,
  contentType: 'application/pdf',
  taxAmountCents: 15000,
  transactionId: null,
  transactionGroupId: null,
  companyId: null,
  description: 'IVA Q1',
  displayName: null,
  createdAt: '2025-04-20T10:00:00.000Z',
};

const mockFactura: FiscalDocument = {
  ...mockDocument,
  documentId: 2,
  documentType: FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA,
  modeloType: null,
  fiscalQuarter: null,
  status: FISCAL_STATUS.PENDING,
  downloadUrl: '/api/fiscal/documents/2/download',
  fileName: 'vodafone enero 2025.pdf',
  description: 'Vodafone factura',
};

// ============================================================
// State capture
// ============================================================

let capturedStatusUpdate: { id: number; status: string } | null = null;
let capturedDeleteId: number | null = null;

// ============================================================
// Mocks
// ============================================================

jest.mock('@/services/database/FiscalDocumentRepository', () => ({
  getDocuments: jest.fn(async (year: number, quarter?: number, documentType?: string) => {
    let docs = [mockDocument, mockFactura].filter((d) => d.fiscalYear === year);
    if (quarter != null) docs = docs.filter((d) => d.fiscalQuarter === quarter);
    if (documentType) docs = docs.filter((d) => d.documentType === documentType);
    return docs;
  }),
  getDocumentById: jest.fn(async (id: number) => {
    if (id === 1) return mockDocument;
    if (id === 2) return mockFactura;
    return null;
  }),
  updateDocumentStatus: jest.fn(async (id: number, status: string) => {
    capturedStatusUpdate = { id, status };
    if (id === 1) return { ...mockDocument, status };
    return null;
  }),
  deleteDocument: jest.fn(async (id: number) => {
    capturedDeleteId = id;
    if (id === 1) return 'https://blob.vercel-storage.com/fiscal/1/303-1T-2025.pdf';
    return null;
  }),
  getDocumentBlobUrl: jest.fn(async (id: number) => {
    if (id === 1)
      return {
        blobUrl: 'https://blob.vercel-storage.com/fiscal/1/303-1T-2025.pdf',
        fileName: '303 1T 2025.pdf',
        contentType: 'application/pdf',
      };
    return null;
  }),
}));

jest.mock('@/services/database/TransactionRepository', () => ({
  deleteTransaction: jest.fn(async () => true),
}));

jest.mock('@vercel/blob', () => ({
  del: jest.fn(async () => undefined),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

// ============================================================
// Import routes AFTER mocks
// ============================================================

import { DELETE, GET as GET_ONE, PATCH } from '@/app/api/fiscal/documents/[id]/route';
import { GET as GET_LIST } from '@/app/api/fiscal/documents/route';

// ============================================================
// Helpers
// ============================================================

function createMockRequest(
  url: string,
  body?: Record<string, unknown>,
): {
  url: string;
  nextUrl: URL;
  json: () => Promise<Record<string, unknown>>;
} {
  return { url, nextUrl: new URL(url), json: async () => body ?? {} };
}

function createMockParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// ============================================================
// Tests
// ============================================================

describe('GET /api/fiscal/documents', () => {
  it('should return documents filtered by year', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/documents?year=2025');
    const response = await GET_LIST(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(2);
  });

  it('should filter by quarter', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/documents?year=2025&quarter=1');
    const response = await GET_LIST(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toHaveLength(1);
    expect(data.data[0].modeloType).toBe(MODELO_TYPE.M303);
  });

  it('should filter by documentType', async () => {
    const request = createMockRequest(
      `http://localhost:3000/api/fiscal/documents?year=2025&documentType=${FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA}`,
    );
    const response = await GET_LIST(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toHaveLength(1);
    expect(data.data[0].documentType).toBe(FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA);
  });

  it('should return 400 without year parameter', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/documents');
    const response = await GET_LIST(request as never);

    expect(response.status).toBe(400);
  });
});

describe('GET /api/fiscal/documents/[id]', () => {
  it('should return document by id', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/documents/1');
    const response = await GET_ONE(request as never, createMockParams('1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.documentId).toBe(1);
    expect(data.data.fileName).toBe('303 1T 2025.pdf');
  });

  it('should return 404 for non-existent document', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/documents/999');
    const response = await GET_ONE(request as never, createMockParams('999'));

    expect(response.status).toBe(404);
  });

  it('should return 400 for invalid id', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/documents/abc');
    const response = await GET_ONE(request as never, createMockParams('abc'));

    expect(response.status).toBe(400);
  });
});

describe('PATCH /api/fiscal/documents/[id]', () => {
  beforeEach(() => {
    capturedStatusUpdate = null;
  });

  it('should update document status', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/documents/1', {
      status: FISCAL_STATUS.FILED,
    });
    const response = await PATCH(request as never, createMockParams('1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(capturedStatusUpdate).toEqual({ id: 1, status: FISCAL_STATUS.FILED });
  });

  it('should reject invalid status value', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/documents/1', {
      status: 'cancelled',
    });
    const response = await PATCH(request as never, createMockParams('1'));

    expect(response.status).toBe(400);
  });

  it('should return 404 for non-existent document', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/documents/999', {
      status: FISCAL_STATUS.FILED,
    });
    const response = await PATCH(request as never, createMockParams('999'));

    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/fiscal/documents/[id]', () => {
  beforeEach(() => {
    capturedDeleteId = null;
  });

  it('should delete document and return success', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/documents/1');
    const response = await DELETE(request as never, createMockParams('1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.deleted).toBe(true);
    expect(capturedDeleteId).toBe(1);
  });

  it('should return 404 for non-existent document', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/documents/999');
    const response = await DELETE(request as never, createMockParams('999'));

    expect(response.status).toBe(404);
  });
});
