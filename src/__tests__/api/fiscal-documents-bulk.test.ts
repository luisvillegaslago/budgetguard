/**
 * Integration tests for POST /api/fiscal/documents/bulk.
 * Pins the per-file error contract: every failed entry carries an i18n key from
 * API_ERROR, never a raw Zod JSON blob nor the English literal 'Unknown error',
 * because FiscalBulkUpload renders `r.error` straight into the Spanish UI.
 */

import { API_ERROR } from '@/constants/finance';

// ============================================================
// Mocks
// ============================================================

const mockPut = jest.fn();
const mockBulkCreate = jest.fn();

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 1),
  AuthError: class AuthError extends Error {},
}));

jest.mock('@vercel/blob', () => ({
  put: (...args: unknown[]) => mockPut(...args),
}));

jest.mock('@/services/database/FiscalDocumentRepository', () => ({
  bulkCreateDocuments: (...args: unknown[]) => mockBulkCreate(...args),
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
// Import route AFTER mocks
// ============================================================

import { POST } from '@/app/api/fiscal/documents/bulk/route';

// ============================================================
// Helpers
// ============================================================

interface BulkResultItem {
  fileName: string;
  success: boolean;
  error?: string;
  documentId?: number;
}

interface BulkResponse {
  success: boolean;
  data: {
    results: BulkResultItem[];
    total: number;
    succeeded: number;
    failed: number;
  };
}

interface FormDataLike {
  getAll: (key: string) => File[];
  get: (key: string) => string | null;
}

/** Build a request whose formData() carries the given filenames as real File entries. */
function createBulkRequest(fileNames: string[]): { formData: () => Promise<FormDataLike> } {
  const files = fileNames.map((name) => new File(['%PDF'], name, { type: 'application/pdf' }));
  const formData: FormDataLike = {
    getAll: (key: string) => (key === 'files' ? files : []),
    get: () => null,
  };
  return { formData: async () => formData };
}

async function callRoute(fileNames: string[]): Promise<BulkResponse> {
  const response = await POST(createBulkRequest(fileNames) as never);
  return (await response.json()) as BulkResponse;
}

beforeEach(() => {
  mockPut.mockReset();
  mockBulkCreate.mockReset();
  mockPut.mockResolvedValue({ url: 'https://blob.test/doc.pdf', pathname: 'fiscal/1/2025/doc.pdf' });
  mockBulkCreate.mockResolvedValue([]);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ============================================================
// Tests
// ============================================================

describe('POST /api/fiscal/documents/bulk — per-file error keys', () => {
  it('reports a rejected item with an i18n key, not the raw Zod issue JSON', async () => {
    // "303 2025.pdf" parses as a quarterless 303, which BulkUploadItemSchema refuses
    const body = await callRoute(['303 2025.pdf']);

    expect(body.data.failed).toBe(1);
    const failure = body.data.results[0] as BulkResultItem;
    expect(failure.success).toBe(false);
    expect(failure.error).toBe(API_ERROR.FISCAL.BULK_ITEM_INVALID);
    // The Zod blob starts with '[' and names the failing path in English
    expect(failure.error).not.toContain('fiscalQuarter');
    expect(failure.error?.startsWith('[')).toBe(false);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('reports an upload failure as API_ERROR.INTERNAL, never the literal "Unknown error"', async () => {
    mockPut.mockRejectedValueOnce(new Error('Blob store unreachable'));

    const body = await callRoute(['130 1T 2025.pdf']);

    expect(body.data.failed).toBe(1);
    const failure = body.data.results[0] as BulkResultItem;
    expect(failure.error).toBe(API_ERROR.INTERNAL);
    expect(failure.error).not.toBe('Unknown error');
    // The raw driver message must stay server-side
    expect(failure.error).not.toContain('Blob store unreachable');
  });

  it('keeps every error string resolvable as a translation key', async () => {
    mockPut.mockRejectedValueOnce(new Error('boom'));

    const body = await callRoute(['303 2025.pdf', '130 1T 2025.pdf']);

    expect(body.data.failed).toBe(2);
    body.data.results
      .filter((r) => !r.success)
      .forEach((r) => {
        expect(r.error).toMatch(/^api-error\./);
      });
  });
});
