/**
 * Integration Tests: Auth Protection on API Routes
 * Verifies that API routes return 401 when user is not authenticated
 */

import { API_ERROR } from '@/constants/finance';
import { AuthError } from '@/libs/auth';

// Mock repositories to throw AuthError (simulating unauthenticated access)
jest.mock('@/services/database/CategoryRepository', () => ({
  getCategories: jest.fn(async () => {
    throw new AuthError();
  }),
  getCategoriesHierarchical: jest.fn(async () => {
    throw new AuthError();
  }),
  createCategory: jest.fn(async () => {
    throw new AuthError();
  }),
  getCategoryById: jest.fn(async () => {
    throw new AuthError();
  }),
  updateCategory: jest.fn(async () => {
    throw new AuthError();
  }),
  deleteCategory: jest.fn(async () => {
    throw new AuthError();
  }),
  getCategoryTransactionCount: jest.fn(async () => {
    throw new AuthError();
  }),
  getCategoryChildrenCount: jest.fn(async () => {
    throw new AuthError();
  }),
}));

jest.mock('@/services/database/TransactionRepository', () => ({
  getTransactionsByMonth: jest.fn(async () => {
    throw new AuthError();
  }),
  createTransaction: jest.fn(async () => {
    throw new AuthError();
  }),
  getMonthlySummary: jest.fn(async () => {
    throw new AuthError();
  }),
  getSubcategorySummary: jest.fn(async () => {
    throw new AuthError();
  }),
}));

jest.mock('@/services/database/TripRepository', () => ({
  getAllTrips: jest.fn(async () => {
    throw new AuthError();
  }),
  createTrip: jest.fn(async () => {
    throw new AuthError();
  }),
}));

jest.mock('@/services/database/RecurringExpenseRepository', () => ({
  getAllRecurringExpenses: jest.fn(async () => {
    throw new AuthError();
  }),
  createRecurringExpense: jest.fn(async () => {
    throw new AuthError();
  }),
}));

jest.mock('@/services/database/FiscalRepository', () => ({
  getFiscalExpenses: jest.fn(async () => {
    throw new AuthError();
  }),
  getFiscalInvoices: jest.fn(async () => {
    throw new AuthError();
  }),
  getModelo303Summary: jest.fn(async () => {
    throw new AuthError();
  }),
  getModelo130Summary: jest.fn(async () => {
    throw new AuthError();
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

// Mock next-auth (for AuthError import resolution)
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('next-auth/providers/google', () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: 'google', name: 'Google', type: 'oauth' })),
}));

jest.mock('@/services/database/connection', () => ({
  query: jest.fn(),
}));

import { GET as getCategories } from '@/app/api/categories/route';
import { GET as getSummary } from '@/app/api/summary/route';
import { GET as getTrips } from '@/app/api/trips/route';

function createMockRequest(url: string): { url: string; json: () => Promise<Record<string, unknown>> } {
  return {
    url,
    json: async () => ({}),
  };
}

// ── Categories API returns 401 ──

describe('API Auth Protection — Categories', () => {
  it('GET /api/categories should return 401 when unauthenticated', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories');
    const response = await getCategories(request as never);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe(API_ERROR.UNAUTHORIZED);
  });
});

// ── Summary API returns 401 ──

describe('API Auth Protection — Summary', () => {
  it('GET /api/summary should return 401 when unauthenticated', async () => {
    const request = createMockRequest('http://localhost:3000/api/summary?month=2025-01');
    const response = await getSummary(request as never);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe(API_ERROR.UNAUTHORIZED);
  });
});

// ── Trips API returns 401 ──

describe('API Auth Protection — Trips', () => {
  it('GET /api/trips should return 401 when unauthenticated', async () => {
    const response = await getTrips();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe(API_ERROR.UNAUTHORIZED);
  });
});
