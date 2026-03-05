/**
 * Integration Tests: Shared Expense API Logic
 * Tests the POST /api/transactions and PUT /api/transactions/[id]
 * shared expense halving behavior (Math.ceil rounding)
 */

import { SHARED_EXPENSE } from '@/constants/finance';

// Track what was passed to createTransaction/updateTransaction
let capturedCreateData: Record<string, unknown> | null = null;
let capturedUpdateData: { id: number; data: Record<string, unknown> } | null = null;
let mockTransactionStore: Record<string, unknown> = {};

// Mock the database repositories
jest.mock('@/services/database/TransactionRepository', () => ({
  createTransaction: jest.fn(async (data: Record<string, unknown>) => {
    capturedCreateData = data;
    mockTransactionStore = {
      transactionId: 1,
      categoryId: data.categoryId,
      amountCents: data.amountCents,
      description: data.description ?? null,
      transactionDate: '2025-01-15',
      type: data.type,
      sharedDivisor: data.sharedDivisor ?? 1,
      originalAmountCents: data.originalAmountCents ?? null,
      createdAt: '2025-01-15T00:00:00.000Z',
      updatedAt: '2025-01-15T00:00:00.000Z',
      category: {
        categoryId: data.categoryId,
        name: 'Test',
        type: data.type,
        icon: null,
        color: null,
        sortOrder: 0,
        isActive: true,
        parentCategoryId: null,
        defaultShared: false,
      },
      parentCategory: null,
    };
    return mockTransactionStore;
  }),
  getTransactionsByMonth: jest.fn(async () => []),
  getTransactionById: jest.fn(async (id: number) => {
    if (id === 1) return mockTransactionStore;
    return null;
  }),
  updateTransaction: jest.fn(async (id: number, data: Record<string, unknown>) => {
    capturedUpdateData = { id, data };
    return { ...mockTransactionStore, ...data, transactionId: id };
  }),
  deleteTransaction: jest.fn(async () => true),
}));

// Mock NextResponse with proper status code handling
jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { PUT } from '@/app/api/transactions/[id]/route';
// Import after mocking
import { POST } from '@/app/api/transactions/route';

// Helper to create a mock NextRequest
function createMockRequest(body: Record<string, unknown>): {
  url: string;
  json: () => Promise<Record<string, unknown>>;
} {
  return {
    url: 'http://localhost:3000/api/transactions?month=2025-01',
    json: async () => body,
  };
}

// Helper to create mock route params for [id] routes
function createMockParams(id: string): { params: Promise<{ id: string }> } {
  return {
    params: Promise.resolve({ id }),
  };
}

describe('POST /api/transactions — Shared Expense Halving', () => {
  beforeEach(() => {
    capturedCreateData = null;
    capturedUpdateData = null;
    mockTransactionStore = {};
  });

  it('should store full amount when not shared', async () => {
    const request = createMockRequest({
      categoryId: 1,
      amount: 100,
      transactionDate: '2025-01-15',
      type: 'expense',
      isShared: false,
    });
    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(capturedCreateData).not.toBeNull();
    expect(capturedCreateData!.amountCents).toBe(10000); // 100 * 100
    expect(capturedCreateData!.originalAmountCents).toBeNull();
    expect(capturedCreateData!.sharedDivisor).toBe(SHARED_EXPENSE.DEFAULT_DIVISOR);
  });

  it('should halve amount when shared (even amount)', async () => {
    const request = createMockRequest({
      categoryId: 1,
      amount: 100,
      transactionDate: '2025-01-15',
      type: 'expense',
      isShared: true,
    });
    const response = await POST(request as any);

    expect(response.status).toBe(201);
    expect(capturedCreateData!.amountCents).toBe(5000); // 10000 / 2
    expect(capturedCreateData!.originalAmountCents).toBe(10000);
    expect(capturedCreateData!.sharedDivisor).toBe(SHARED_EXPENSE.DIVISOR);
  });

  it('should use Math.ceil for odd cent amounts (5.01 → 251, not 250)', async () => {
    const request = createMockRequest({
      categoryId: 1,
      amount: 5.01,
      transactionDate: '2025-01-15',
      type: 'expense',
      isShared: true,
    });
    const response = await POST(request as any);

    expect(response.status).toBe(201);
    // 5.01 → 501 cents. 501 / 2 = 250.5 → Math.ceil = 251
    expect(capturedCreateData!.amountCents).toBe(251);
    expect(capturedCreateData!.originalAmountCents).toBe(501);
  });

  it('should use Math.ceil for 1 cent (0.01 → 1, not 0)', async () => {
    const request = createMockRequest({
      categoryId: 1,
      amount: 0.01,
      transactionDate: '2025-01-15',
      type: 'expense',
      isShared: true,
    });
    const response = await POST(request as any);

    expect(response.status).toBe(201);
    // 0.01 → 1 cent. 1 / 2 = 0.5 → Math.ceil = 1
    expect(capturedCreateData!.amountCents).toBe(1);
    expect(capturedCreateData!.originalAmountCents).toBe(1);
  });

  it('should handle large shared amounts correctly', async () => {
    const request = createMockRequest({
      categoryId: 1,
      amount: 1234.57,
      transactionDate: '2025-01-15',
      type: 'expense',
      isShared: true,
    });
    const response = await POST(request as any);

    expect(response.status).toBe(201);
    // 1234.57 → 123457 cents. 123457 / 2 = 61728.5 → Math.ceil = 61729
    expect(capturedCreateData!.amountCents).toBe(61729);
    expect(capturedCreateData!.originalAmountCents).toBe(123457);
  });

  it('should default isShared to false when not provided', async () => {
    const request = createMockRequest({
      categoryId: 1,
      amount: 50,
      transactionDate: '2025-01-15',
      type: 'expense',
    });
    const response = await POST(request as any);

    expect(response.status).toBe(201);
    expect(capturedCreateData!.amountCents).toBe(5000);
    expect(capturedCreateData!.originalAmountCents).toBeNull();
    expect(capturedCreateData!.sharedDivisor).toBe(1);
  });
});

describe('PUT /api/transactions/[id] — Shared Expense Updates', () => {
  beforeEach(() => {
    capturedCreateData = null;
    capturedUpdateData = null;
    // Set up existing non-shared transaction
    mockTransactionStore = {
      transactionId: 1,
      categoryId: 1,
      amountCents: 10000,
      description: null,
      transactionDate: '2025-01-15',
      type: 'expense',
      sharedDivisor: 1,
      originalAmountCents: null,
      createdAt: '2025-01-15T00:00:00.000Z',
      updatedAt: '2025-01-15T00:00:00.000Z',
      category: {
        categoryId: 1,
        name: 'Test',
        type: 'expense',
        icon: null,
        color: null,
        sortOrder: 0,
        isActive: true,
        parentCategoryId: null,
        defaultShared: false,
      },
      parentCategory: null,
    };
  });

  it('should halve amount when updating with isShared and new amount', async () => {
    const request = createMockRequest({
      amount: 80,
      isShared: true,
    });
    const response = await PUT(request as any, createMockParams('1'));

    expect(response.status).toBe(200);
    expect(capturedUpdateData!.data.amountCents).toBe(4000); // 8000 / 2
    expect(capturedUpdateData!.data.originalAmountCents).toBe(8000);
    expect(capturedUpdateData!.data.sharedDivisor).toBe(SHARED_EXPENSE.DIVISOR);
  });

  it('should toggle shared on existing transaction without changing amount', async () => {
    const request = createMockRequest({
      isShared: true,
    });
    const response = await PUT(request as any, createMockParams('1'));

    expect(response.status).toBe(200);
    // Existing amountCents is 10000, should be halved
    expect(capturedUpdateData!.data.amountCents).toBe(5000);
    expect(capturedUpdateData!.data.originalAmountCents).toBe(10000);
    expect(capturedUpdateData!.data.sharedDivisor).toBe(SHARED_EXPENSE.DIVISOR);
  });

  it('should return 400 for invalid id', async () => {
    const request = createMockRequest({ amount: 50 });
    const response = await PUT(request as any, createMockParams('abc'));

    expect(response.status).toBe(400);
  });
});
