/**
 * Integration Tests: Billing Profile API
 * Tests GET/PUT /api/billing-profile
 */

import { PAYMENT_METHOD } from '@/constants/finance';
import type { BillingProfile } from '@/types/finance';

const mockProfile: BillingProfile = {
  billingProfileId: 1,
  fullName: 'Luis Villegas',
  nif: '23011109T',
  address: 'C. Aviador Zorita 35',
  phone: '+34661274672',
  paymentMethod: PAYMENT_METHOD.BANK_TRANSFER,
  bankName: 'CaixaBank',
  iban: 'ES1234567890',
  swift: 'CAIXESBB',
  bankAddress: 'Madrid',
  createdAt: '2026-03-09T10:00:00.000Z',
  updatedAt: '2026-03-09T10:00:00.000Z',
};

let hasProfile = true;

jest.mock('@/services/database/InvoiceRepository', () => ({
  getBillingProfile: jest.fn(async () => (hasProfile ? mockProfile : null)),
  upsertBillingProfile: jest.fn(async (data: Record<string, unknown>) => ({
    ...mockProfile,
    ...data,
  })),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { GET, PUT } from '@/app/api/billing-profile/route';

function createMockRequest(
  url: string,
  body?: Record<string, unknown>,
): {
  url: string;
  json: () => Promise<Record<string, unknown>>;
} {
  return { url, json: async () => body ?? {} };
}

// ── GET /api/billing-profile ──

describe('GET /api/billing-profile', () => {
  it('should return existing billing profile', async () => {
    hasProfile = true;
    const request = createMockRequest('http://localhost:3000/api/billing-profile');
    const response = await GET(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.fullName).toBe('Luis Villegas');
    expect(data.data.paymentMethod).toBe(PAYMENT_METHOD.BANK_TRANSFER);
  });

  it('should return null when no profile exists', async () => {
    hasProfile = false;
    const request = createMockRequest('http://localhost:3000/api/billing-profile');
    const response = await GET(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeNull();
  });
});

// ── PUT /api/billing-profile ──

describe('PUT /api/billing-profile', () => {
  it('should upsert billing profile with valid data', async () => {
    const request = createMockRequest('http://localhost:3000/api/billing-profile', {
      fullName: 'Luis Villegas Lago',
      nif: '23011109T',
      paymentMethod: PAYMENT_METHOD.BANK_TRANSFER,
      address: 'C. Aviador Zorita 35',
    });
    const response = await PUT(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.fullName).toBe('Luis Villegas Lago');
  });

  it('should reject missing fullName', async () => {
    const request = createMockRequest('http://localhost:3000/api/billing-profile', {
      nif: '23011109T',
      paymentMethod: PAYMENT_METHOD.BANK_TRANSFER,
    });
    const response = await PUT(request as never);

    expect(response.status).toBe(400);
  });

  it('should reject missing nif', async () => {
    const request = createMockRequest('http://localhost:3000/api/billing-profile', {
      fullName: 'Luis',
      paymentMethod: PAYMENT_METHOD.BANK_TRANSFER,
    });
    const response = await PUT(request as never);

    expect(response.status).toBe(400);
  });

  it('should reject invalid payment method', async () => {
    const request = createMockRequest('http://localhost:3000/api/billing-profile', {
      fullName: 'Luis',
      nif: '23011109T',
      paymentMethod: 'crypto',
    });
    const response = await PUT(request as never);

    expect(response.status).toBe(400);
  });

  it('should accept minimal profile (only required fields)', async () => {
    const request = createMockRequest('http://localhost:3000/api/billing-profile', {
      fullName: 'Test User',
      nif: '12345678Z',
      paymentMethod: PAYMENT_METHOD.PAYPAL,
    });
    const response = await PUT(request as never);

    expect(response.status).toBe(200);
  });
});
