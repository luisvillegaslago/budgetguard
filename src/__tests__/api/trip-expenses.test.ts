/**
 * Integration Tests: Trip Expense API
 * Tests POST /api/trips/[id]/expenses (shared halving),
 * PUT /api/trips/[id]/expenses/[expenseId] (amount+shared toggle),
 * DELETE /api/trips/[id]/expenses/[expenseId]
 */

import { SHARED_EXPENSE, TRANSACTION_TYPE } from '@/constants/finance';

// Captured data for assertions
let capturedCreateData: Record<string, unknown> | null = null;
let capturedUpdateData: { id: number; data: Record<string, unknown> } | null = null;
let capturedDeleteId: number | null = null;
let mockTransactionStore: Record<string, unknown> = {};

// Mock TripRepository (only getTripById needed for POST validation)
jest.mock('@/services/database/TripRepository', () => ({
  getTripById: jest.fn(async (id: number) => {
    if (id === 1) return { tripId: 1, name: 'Sierra Nevada 2025' };
    return null;
  }),
}));

// Mock TransactionRepository
jest.mock('@/services/database/TransactionRepository', () => ({
  createTransaction: jest.fn(async (data: Record<string, unknown>) => {
    capturedCreateData = data;
    return {
      transactionId: 100,
      ...data,
      createdAt: '2025-10-15T10:00:00.000Z',
      updatedAt: '2025-10-15T10:00:00.000Z',
    };
  }),
  getTransactionById: jest.fn(async (id: number) => {
    if (id === 100) return mockTransactionStore;
    return null;
  }),
  updateTransaction: jest.fn(async (id: number, data: Record<string, unknown>) => {
    capturedUpdateData = { id, data };
    if (id === 100) return { ...mockTransactionStore, ...data, transactionId: id };
    return null;
  }),
  deleteTransaction: jest.fn(async (id: number) => {
    capturedDeleteId = id;
    return id === 100;
  }),
}));

// Mock NextResponse
jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { DELETE, PUT } from '@/app/api/trips/[id]/expenses/[expenseId]/route';
// Import after mocking
import { POST } from '@/app/api/trips/[id]/expenses/route';

// Helpers
function createMockRequest(body: Record<string, unknown>): {
  url: string;
  json: () => Promise<Record<string, unknown>>;
} {
  return {
    url: 'http://localhost:3000/api/trips/1/expenses',
    json: async () => body,
  };
}

function createMockTripParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function createMockExpenseParams(
  id: string,
  expenseId: string,
): { params: Promise<{ id: string; expenseId: string }> } {
  return { params: Promise.resolve({ id, expenseId }) };
}

// ============================
// POST /api/trips/[id]/expenses
// ============================
describe('POST /api/trips/[id]/expenses', () => {
  beforeEach(() => {
    capturedCreateData = null;
  });

  it('should create a personal (non-shared) trip expense', async () => {
    const request = createMockRequest({
      categoryId: 15,
      amount: 120,
      description: 'Hotel 2 noches',
      transactionDate: '2025-10-15',
      isShared: false,
    });
    const response = await POST(request as never, createMockTripParams('1'));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(capturedCreateData).not.toBeNull();
    expect(capturedCreateData!.amountCents).toBe(12000); // 120 * 100
    expect(capturedCreateData!.originalAmountCents).toBeNull();
    expect(capturedCreateData!.sharedDivisor).toBe(SHARED_EXPENSE.DEFAULT_DIVISOR);
    expect(capturedCreateData!.type).toBe(TRANSACTION_TYPE.EXPENSE);
    expect(capturedCreateData!.tripId).toBe(1);
  });

  it('should halve amount for shared trip expense (even)', async () => {
    const request = createMockRequest({
      categoryId: 15,
      amount: 100,
      transactionDate: '2025-10-15',
      isShared: true,
    });
    const response = await POST(request as never, createMockTripParams('1'));

    expect(response.status).toBe(201);
    expect(capturedCreateData!.amountCents).toBe(5000); // 10000 / 2
    expect(capturedCreateData!.originalAmountCents).toBe(10000);
    expect(capturedCreateData!.sharedDivisor).toBe(SHARED_EXPENSE.DIVISOR);
  });

  it('should use Math.ceil for odd cent shared amounts (5.01 → 251)', async () => {
    const request = createMockRequest({
      categoryId: 15,
      amount: 5.01,
      transactionDate: '2025-10-15',
      isShared: true,
    });
    const response = await POST(request as never, createMockTripParams('1'));

    expect(response.status).toBe(201);
    // 5.01 → 501 cents. 501 / 2 = 250.5 → Math.ceil = 251
    expect(capturedCreateData!.amountCents).toBe(251);
    expect(capturedCreateData!.originalAmountCents).toBe(501);
  });

  it('should default isShared to false', async () => {
    const request = createMockRequest({
      categoryId: 15,
      amount: 50,
      transactionDate: '2025-10-15',
    });
    const response = await POST(request as never, createMockTripParams('1'));

    expect(response.status).toBe(201);
    expect(capturedCreateData!.amountCents).toBe(5000);
    expect(capturedCreateData!.originalAmountCents).toBeNull();
    expect(capturedCreateData!.sharedDivisor).toBe(SHARED_EXPENSE.DEFAULT_DIVISOR);
  });

  it('should return 404 for non-existent trip', async () => {
    const request = createMockRequest({
      categoryId: 15,
      amount: 50,
      transactionDate: '2025-10-15',
    });
    const response = await POST(request as never, createMockTripParams('999'));

    expect(response.status).toBe(404);
  });

  it('should return 400 for invalid trip ID', async () => {
    const request = createMockRequest({
      categoryId: 15,
      amount: 50,
      transactionDate: '2025-10-15',
    });
    const response = await POST(request as never, createMockTripParams('abc'));

    expect(response.status).toBe(400);
  });

  it('should return 400 for missing required fields', async () => {
    const request = createMockRequest({});
    const response = await POST(request as never, createMockTripParams('1'));

    expect(response.status).toBe(400);
  });

  it('should return 400 for negative amount', async () => {
    const request = createMockRequest({
      categoryId: 15,
      amount: -10,
      transactionDate: '2025-10-15',
    });
    const response = await POST(request as never, createMockTripParams('1'));

    expect(response.status).toBe(400);
  });
});

// ============================
// PUT /api/trips/[id]/expenses/[expenseId]
// ============================
describe('PUT /api/trips/[id]/expenses/[expenseId]', () => {
  beforeEach(() => {
    capturedUpdateData = null;
    // Set up existing non-shared trip expense
    mockTransactionStore = {
      transactionId: 100,
      categoryId: 15,
      amountCents: 12000,
      description: 'Hotel 2 noches',
      transactionDate: '2025-10-15',
      type: TRANSACTION_TYPE.EXPENSE,
      sharedDivisor: SHARED_EXPENSE.DEFAULT_DIVISOR,
      originalAmountCents: null,
      tripId: 1,
    };
  });

  it('should update amount with shared halving', async () => {
    const request = createMockRequest({ amount: 80, isShared: true });
    const response = await PUT(request as never, createMockExpenseParams('1', '100'));

    expect(response.status).toBe(200);
    expect(capturedUpdateData!.data.amountCents).toBe(4000); // 8000 / 2
    expect(capturedUpdateData!.data.originalAmountCents).toBe(8000);
    expect(capturedUpdateData!.data.sharedDivisor).toBe(SHARED_EXPENSE.DIVISOR);
  });

  it('should toggle shared on existing expense without changing amount', async () => {
    const request = createMockRequest({ isShared: true });
    const response = await PUT(request as never, createMockExpenseParams('1', '100'));

    expect(response.status).toBe(200);
    // Existing amountCents is 12000, should be halved
    expect(capturedUpdateData!.data.amountCents).toBe(6000);
    expect(capturedUpdateData!.data.originalAmountCents).toBe(12000);
    expect(capturedUpdateData!.data.sharedDivisor).toBe(SHARED_EXPENSE.DIVISOR);
  });

  it('should un-share a previously shared expense', async () => {
    // Set up a shared expense
    mockTransactionStore = {
      ...mockTransactionStore,
      amountCents: 6000, // halved from 12000
      originalAmountCents: 12000,
      sharedDivisor: SHARED_EXPENSE.DIVISOR,
    };

    const request = createMockRequest({ isShared: false });
    const response = await PUT(request as never, createMockExpenseParams('1', '100'));

    expect(response.status).toBe(200);
    // Should restore to original amount
    expect(capturedUpdateData!.data.amountCents).toBe(12000);
    expect(capturedUpdateData!.data.originalAmountCents).toBeNull();
    expect(capturedUpdateData!.data.sharedDivisor).toBe(SHARED_EXPENSE.DEFAULT_DIVISOR);
  });

  it('should update non-shared amount without halving', async () => {
    const request = createMockRequest({ amount: 150, isShared: false });
    const response = await PUT(request as never, createMockExpenseParams('1', '100'));

    expect(response.status).toBe(200);
    expect(capturedUpdateData!.data.amountCents).toBe(15000);
    expect(capturedUpdateData!.data.originalAmountCents).toBeNull();
    expect(capturedUpdateData!.data.sharedDivisor).toBe(SHARED_EXPENSE.DEFAULT_DIVISOR);
  });

  it('should return 404 for non-existent expense', async () => {
    const request = createMockRequest({ amount: 50 });
    const response = await PUT(request as never, createMockExpenseParams('1', '999'));

    expect(response.status).toBe(404);
  });

  it('should return 400 for invalid expense ID', async () => {
    const request = createMockRequest({ amount: 50 });
    const response = await PUT(request as never, createMockExpenseParams('1', 'abc'));

    expect(response.status).toBe(400);
  });
});

// ============================
// DELETE /api/trips/[id]/expenses/[expenseId]
// ============================
describe('DELETE /api/trips/[id]/expenses/[expenseId]', () => {
  beforeEach(() => {
    capturedDeleteId = null;
  });

  it('should delete an existing trip expense', async () => {
    const request = createMockRequest({});
    const response = await DELETE(request as never, createMockExpenseParams('1', '100'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.deleted).toBe(true);
    expect(capturedDeleteId).toBe(100);
  });

  it('should return 404 for non-existent expense', async () => {
    const request = createMockRequest({});
    const response = await DELETE(request as never, createMockExpenseParams('1', '999'));

    expect(response.status).toBe(404);
  });

  it('should return 400 for invalid expense ID', async () => {
    const request = createMockRequest({});
    const response = await DELETE(request as never, createMockExpenseParams('1', 'abc'));

    expect(response.status).toBe(400);
  });
});
