/**
 * Integration Tests: Invoice Prefixes API
 * Tests GET/POST /api/invoices/prefixes
 *
 * Creating a series whose code is already taken must answer 409 with an i18n key.
 * It used to escape as a raw pg error and surface as a 500 "unexpected error".
 */

import { API_ERROR } from '@/constants/finance';
import type { InvoicePrefix } from '@/types/finance';

const mockPrefix: InvoicePrefix = {
  prefixId: 7,
  prefix: 'TEST2',
  nextNumber: 1,
  description: null,
  companyId: 2,
  isActive: true,
  createdAt: '2026-07-10T10:00:00.000Z',
};

let prefixIsTaken = false;

// The class is declared inside the factory: jest.mock() is hoisted above the module body,
// so a class declared out here would still be in its temporal dead zone when this runs.
jest.mock('@/services/database/InvoiceRepository', () => {
  class ConflictError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ConflictError';
    }
  }

  return {
    ConflictError,
    getInvoicePrefixes: jest.fn(async () => [mockPrefix]),
    createInvoicePrefix: jest.fn(async (data: { prefix: string }) => {
      if (prefixIsTaken) throw new ConflictError(`Prefix "${data.prefix}" already exists`);
      return { ...mockPrefix, prefix: data.prefix };
    }),
  };
});

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { GET, POST } from '@/app/api/invoices/prefixes/route';

function createMockRequest(body?: Record<string, unknown>): {
  url: string;
  json: () => Promise<Record<string, unknown>>;
} {
  return { url: 'http://localhost:3000/api/invoices/prefixes', json: async () => body ?? {} };
}

beforeEach(() => {
  prefixIsTaken = false;
});

describe('GET /api/invoices/prefixes', () => {
  it('should list the prefixes with their count', async () => {
    const response = await GET(createMockRequest() as never, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.meta.count).toBe(1);
  });
});

describe('POST /api/invoices/prefixes', () => {
  it('should create a prefix and return 201', async () => {
    const request = createMockRequest({ prefix: 'ACME', companyId: 2 });
    const response = await POST(request as never, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.prefix).toBe('ACME');
  });

  it('should uppercase the prefix before persisting it', async () => {
    const request = createMockRequest({ prefix: 'acme' });
    const response = await POST(request as never, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(data.data.prefix).toBe('ACME');
  });

  it('should return 409 when the user already owns that prefix', async () => {
    prefixIsTaken = true;
    const request = createMockRequest({ prefix: 'TEST2' });
    const response = await POST(request as never, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.success).toBe(false);
    expect(data.error).toBe(API_ERROR.CONFLICT.PREFIX_EXISTS);
  });

  it('should return 400 when the prefix is missing', async () => {
    const request = createMockRequest({ description: 'no prefix here' });
    const response = await POST(request as never, { params: Promise.resolve({}) });

    expect(response.status).toBe(400);
  });
});
