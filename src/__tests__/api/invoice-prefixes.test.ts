/**
 * Integration Tests: Invoice Prefixes API
 * Tests GET/POST /api/invoices/prefixes and PUT/DELETE /api/invoices/prefixes/[id]
 *
 * Creating a series whose code is already taken must answer 409 with an i18n key.
 * It used to escape as a raw pg error and surface as a 500 "unexpected error".
 * Deleting one that carries invoices must answer 409 too, and deleting nothing must 404.
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
let prefixHasInvoices = false;
let prefixExists = true;

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
    updateInvoicePrefix: jest.fn(async (prefixId: number, data: Record<string, unknown>) =>
      prefixExists ? { ...mockPrefix, prefixId, ...data } : null,
    ),
    deleteInvoicePrefix: jest.fn(async () => {
      if (prefixHasInvoices) throw new ConflictError('Cannot delete prefix with existing invoices');
      return prefixExists;
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

import { DELETE, PUT } from '@/app/api/invoices/prefixes/[id]/route';
import { GET, POST } from '@/app/api/invoices/prefixes/route';

function createMockRequest(body?: Record<string, unknown>): {
  url: string;
  json: () => Promise<Record<string, unknown>>;
} {
  return { url: 'http://localhost:3000/api/invoices/prefixes', json: async () => body ?? {} };
}

const withId = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  prefixIsTaken = false;
  prefixHasInvoices = false;
  prefixExists = true;
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

describe('PUT /api/invoices/prefixes/[id]', () => {
  it('should update the description and the linked client', async () => {
    const request = createMockRequest({ description: 'International clients', companyId: 5 });
    const response = await PUT(request as never, withId('7'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.description).toBe('International clients');
    expect(data.data.companyId).toBe(5);
  });

  it('should unlink the client when companyId is null', async () => {
    const request = createMockRequest({ companyId: null });
    const response = await PUT(request as never, withId('7'));
    const data = await response.json();

    expect(data.data.companyId).toBeNull();
  });

  it('should return 404 for an unknown prefix', async () => {
    prefixExists = false;
    const request = createMockRequest({ description: 'ghost' });
    const response = await PUT(request as never, withId('999'));

    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/invoices/prefixes/[id]', () => {
  it('should delete an empty prefix', async () => {
    const response = await DELETE(createMockRequest() as never, withId('7'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.deleted).toBe(true);
  });

  it('should return 409 when the prefix has invoices', async () => {
    prefixHasInvoices = true;
    const response = await DELETE(createMockRequest() as never, withId('7'));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe(API_ERROR.CONFLICT.PREFIX_IN_USE);
  });

  // The repository used to return `result.length >= 0` — always true — so an unknown id
  // (or another user's prefix) reported a successful deletion.
  it('should return 404 when nothing was deleted', async () => {
    prefixExists = false;
    const response = await DELETE(createMockRequest() as never, withId('999'));

    expect(response.status).toBe(404);
  });

  it('should return 400 for a non-numeric id', async () => {
    const response = await DELETE(createMockRequest() as never, withId('abc'));

    expect(response.status).toBe(400);
  });
});
