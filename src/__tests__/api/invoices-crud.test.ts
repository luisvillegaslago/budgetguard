/**
 * Integration Tests: Invoices CRUD API
 * Tests GET/POST /api/invoices, GET/PUT/PATCH/DELETE /api/invoices/[id]
 */

import { API_ERROR, INVOICE_STATUS, PAYMENT_METHOD } from '@/constants/finance';
import type { Invoice, InvoiceListItem } from '@/types/finance';

const mockLineItems = [
  {
    lineItemId: 1,
    invoiceId: 1,
    sortOrder: 0,
    description: 'Dev services',
    hours: 10,
    hourlyRateCents: 6000,
    amountCents: 60000,
  },
  {
    lineItemId: 2,
    invoiceId: 1,
    sortOrder: 1,
    description: 'Flat fee',
    hours: null,
    hourlyRateCents: null,
    amountCents: 20000,
  },
];

const mockInvoice: Invoice = {
  invoiceId: 1,
  prefixId: 1,
  invoiceNumber: 'DW-08',
  invoiceDate: '2026-03-09',
  companyId: 2,
  transactionId: null,
  totalCents: 80000,
  currency: 'EUR',
  status: INVOICE_STATUS.DRAFT,
  billerName: 'Luis Villegas',
  billerNif: '23011109T',
  billerAddress: 'C. Aviador Zorita 35',
  billerPhone: '+34661274672',
  billerPaymentMethod: PAYMENT_METHOD.BANK_TRANSFER,
  billerBankName: 'CaixaBank',
  billerIban: 'ES1234567890',
  billerSwift: 'CAIXESBB',
  billerBankAddress: 'Madrid',
  clientName: 'RMCI Alerts Pty Ltd',
  clientTradingName: 'No1 Property Guide',
  clientTaxId: 'ABN: 99 607 787 468',
  clientAddress: '4 Miami Ky',
  clientCity: 'Broadbeach Waters',
  clientPostalCode: 'QLD 4218',
  clientCountry: 'Australia',
  notes: null,
  invoiceLanguage: 'en',
  lineItems: mockLineItems,
  createdAt: '2026-03-09T10:00:00.000Z',
  updatedAt: '2026-03-09T10:00:00.000Z',
};

const mockListItem: InvoiceListItem = {
  invoiceId: 1,
  invoiceNumber: 'DW-08',
  invoiceDate: '2026-03-09',
  clientName: 'RMCI Alerts Pty Ltd',
  clientTradingName: 'No1 Property Guide',
  totalCents: 80000,
  currency: 'EUR',
  status: INVOICE_STATUS.DRAFT,
};

const mockFinalizedInvoice: Invoice = {
  ...mockInvoice,
  invoiceId: 2,
  status: INVOICE_STATUS.FINALIZED,
};

const mockPaidInvoice: Invoice = {
  ...mockInvoice,
  invoiceId: 3,
  status: INVOICE_STATUS.PAID,
  transactionId: 100,
};

jest.mock('@/services/database/InvoiceRepository', () => ({
  getInvoices: jest.fn(async (filters?: { status?: string; prefixId?: number }) => {
    if (filters?.status === 'paid') return [];
    return [mockListItem];
  }),
  getInvoiceById: jest.fn(async (id: number) => {
    if (id === 1) return mockInvoice;
    if (id === 2) return mockFinalizedInvoice;
    if (id === 3) return mockPaidInvoice;
    return null;
  }),
  createInvoice: jest.fn(async () => mockInvoice),
  updateInvoice: jest.fn(async (id: number) => {
    if (id === 999) throw new Error(API_ERROR.NOT_FOUND.INVOICE);
    return { ...mockInvoice, notes: 'Updated notes' };
  }),
  updateInvoiceStatus: jest.fn(async (id: number, status: string) => {
    if (id === 999) throw new Error(API_ERROR.NOT_FOUND.INVOICE);
    if (id === 1 && status === 'paid') throw new Error('Invalid status transition');
    return { ...mockInvoice, status };
  }),
  deleteInvoice: jest.fn(async (id: number) => {
    if (id === 999) return false;
    if (id === 2) throw new Error(API_ERROR.INVOICE.ONLY_DRAFT_DELETABLE);
    return true;
  }),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { DELETE, GET as GET_SINGLE, PATCH, PUT } from '@/app/api/invoices/[id]/route';
import { GET as GET_LIST, POST } from '@/app/api/invoices/route';

function createMockRequest(
  url: string,
  body?: Record<string, unknown>,
): {
  url: string;
  json: () => Promise<Record<string, unknown>>;
} {
  return { url, json: async () => body ?? {} };
}

function createMockParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// ── GET /api/invoices ──

describe('GET /api/invoices', () => {
  it('should return invoice list', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices');
    const response = await GET_LIST(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.data[0].invoiceNumber).toBe('DW-08');
  });

  it('should pass status filter', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices?status=paid');
    const response = await GET_LIST(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toHaveLength(0);
  });
});

// ── GET /api/invoices/[id] ──

describe('GET /api/invoices/[id]', () => {
  it('should return invoice with line items', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices/1');
    const response = await GET_SINGLE(request as never, createMockParams('1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.invoiceId).toBe(1);
    expect(data.data.lineItems).toHaveLength(2);
    expect(data.data.invoiceLanguage).toBe('en');
  });

  it('should return 404 for non-existent invoice', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices/999');
    const response = await GET_SINGLE(request as never, createMockParams('999'));

    expect(response.status).toBe(404);
  });

  it('should return 400 for invalid ID', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices/abc');
    const response = await GET_SINGLE(request as never, createMockParams('abc'));

    expect(response.status).toBe(400);
  });
});

// ── POST /api/invoices ──

describe('POST /api/invoices', () => {
  it('should create invoice with valid data', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices', {
      prefixId: 1,
      invoiceDate: '2026-03-09',
      companyId: 2,
      lineItems: [{ description: 'Dev services', hours: 10, hourlyRateCents: 6000, amountCents: 60000 }],
    });
    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.invoiceNumber).toBe('DW-08');
  });

  it('should reject missing line items', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices', {
      prefixId: 1,
      invoiceDate: '2026-03-09',
      companyId: 2,
      lineItems: [],
    });
    const response = await POST(request as never);

    expect(response.status).toBe(400);
  });

  it('should reject missing companyId', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices', {
      prefixId: 1,
      invoiceDate: '2026-03-09',
      lineItems: [{ description: 'Dev', amountCents: 5000 }],
    });
    const response = await POST(request as never);

    expect(response.status).toBe(400);
  });
});

// ── PUT /api/invoices/[id] (edit draft) ──

describe('PUT /api/invoices/[id]', () => {
  it('should update a draft invoice', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices/1', {
      invoiceDate: '2026-03-10',
      lineItems: [{ description: 'Updated', amountCents: 50000 }],
      notes: 'Updated notes',
    });
    const response = await PUT(request as never, createMockParams('1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should return 400 for empty line items', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices/1', {
      invoiceDate: '2026-03-10',
      lineItems: [],
    });
    const response = await PUT(request as never, createMockParams('1'));

    expect(response.status).toBe(400);
  });
});

// ── PATCH /api/invoices/[id] (status transitions) ──

describe('PATCH /api/invoices/[id]', () => {
  it('should finalize a draft invoice', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices/1', {
      status: INVOICE_STATUS.FINALIZED,
    });
    const response = await PATCH(request as never, createMockParams('1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should require categoryId when marking as paid', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices/2', {
      status: INVOICE_STATUS.PAID,
    });
    const response = await PATCH(request as never, createMockParams('2'));

    expect(response.status).toBe(400);
  });

  it('should accept paid with categoryId', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices/2', {
      status: INVOICE_STATUS.PAID,
      categoryId: 5,
    });
    const response = await PATCH(request as never, createMockParams('2'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should accept cancel for finalized invoice', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices/2', {
      status: INVOICE_STATUS.CANCELLED,
    });
    const response = await PATCH(request as never, createMockParams('2'));

    expect(response.status).toBe(200);
  });

  it('should reject invalid status value', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices/1', {
      status: 'pending',
    });
    const response = await PATCH(request as never, createMockParams('1'));

    expect(response.status).toBe(400);
  });

  it('should accept draft as target status (revert to draft)', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices/1', {
      status: INVOICE_STATUS.DRAFT,
    });
    const response = await PATCH(request as never, createMockParams('1'));

    expect(response.status).toBe(200);
  });

  it('should return 400 for invalid ID', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices/abc', {
      status: INVOICE_STATUS.FINALIZED,
    });
    const response = await PATCH(request as never, createMockParams('abc'));

    expect(response.status).toBe(400);
  });
});

// ── DELETE /api/invoices/[id] ──

describe('DELETE /api/invoices/[id]', () => {
  it('should delete a draft invoice', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices/1');
    const response = await DELETE(request as never, createMockParams('1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.deleted).toBe(true);
  });

  it('should return 404 for non-existent invoice', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices/999');
    const response = await DELETE(request as never, createMockParams('999'));

    expect(response.status).toBe(404);
  });

  it('should return 400 for invalid ID', async () => {
    const request = createMockRequest('http://localhost:3000/api/invoices/abc');
    const response = await DELETE(request as never, createMockParams('abc'));

    expect(response.status).toBe(400);
  });
});
