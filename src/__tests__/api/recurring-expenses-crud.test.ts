/**
 * Integration Tests: Recurring Expenses CRUD API
 * Tests GET/POST /api/recurring-expenses
 * Tests GET/PUT/DELETE /api/recurring-expenses/[id]
 */

import { RECURRING_FREQUENCY, TRANSACTION_TYPE } from '@/constants/finance';
import type { RecurringExpense } from '@/types/finance';

const mockExpense: RecurringExpense = {
  recurringExpenseId: 1,
  categoryId: 1,
  category: {
    categoryId: 1,
    name: 'Vivienda',
    type: TRANSACTION_TYPE.EXPENSE,
    icon: 'home',
    color: '#EF4444',
    sortOrder: 1,
    isActive: true,
    parentCategoryId: null,
    defaultShared: true,
    defaultVatPercent: null,
    defaultDeductionPercent: null,
  },
  amountCents: 45000,
  description: 'Alquiler mensual',
  frequency: RECURRING_FREQUENCY.MONTHLY,
  dayOfWeek: null,
  dayOfMonth: 1,
  monthOfYear: null,
  startDate: '2026-01-01',
  endDate: null,
  isActive: true,
  sharedDivisor: 1,
  originalAmountCents: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

let capturedCreateData: Record<string, unknown> | null = null;
let capturedUpdateData: { id: number; data: Record<string, unknown> } | null = null;

jest.mock('@/services/database/RecurringExpenseRepository', () => ({
  getRecurringExpenses: jest.fn(async () => [mockExpense]),
  getRecurringExpenseById: jest.fn(async (id: number) => {
    if (id === 1) return mockExpense;
    return null;
  }),
  createRecurringExpense: jest.fn(async (data: Record<string, unknown>) => {
    capturedCreateData = data;
    return { ...mockExpense, ...data };
  }),
  updateRecurringExpense: jest.fn(async (id: number, data: Record<string, unknown>) => {
    capturedUpdateData = { id, data };
    if (id === 999) return null;
    return { ...mockExpense, ...data, recurringExpenseId: id };
  }),
  deleteRecurringExpense: jest.fn(async (id: number) => id !== 999),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { DELETE, GET as GET_SINGLE, PUT } from '@/app/api/recurring-expenses/[id]/route';
import { GET as GET_LIST, POST } from '@/app/api/recurring-expenses/route';

function createMockRequest(
  url: string,
  body?: Record<string, unknown>,
): { url: string; json: () => Promise<Record<string, unknown>> } {
  return {
    url,
    json: async () => body ?? {},
  };
}

function createMockParams(id: string): { params: Promise<{ id: string }> } {
  return {
    params: Promise.resolve({ id }),
  };
}

// ── GET /api/recurring-expenses ──

describe('GET /api/recurring-expenses', () => {
  it('should return list of recurring expenses', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses');
    const response = await GET_LIST(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.meta.count).toBe(1);
  });

  it('should pass isActive filter from query params', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses?isActive=true');
    await GET_LIST(request as never);

    const { getRecurringExpenses } = require('@/services/database/RecurringExpenseRepository');
    expect(getRecurringExpenses).toHaveBeenCalledWith({ isActive: true });
  });
});

// ── POST /api/recurring-expenses ──

describe('POST /api/recurring-expenses', () => {
  beforeEach(() => {
    capturedCreateData = null;
  });

  it('should create a monthly recurring expense', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses', {
      categoryId: 1,
      amount: 450,
      frequency: RECURRING_FREQUENCY.MONTHLY,
      dayOfMonth: 1,
      startDate: '2026-01-01',
    });
    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(capturedCreateData!.amountCents).toBe(45000);
    expect(capturedCreateData!.sharedDivisor).toBe(1);
    expect(capturedCreateData!.originalAmountCents).toBeNull();
  });

  it('should apply shared expense logic when isShared is true', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses', {
      categoryId: 1,
      amount: 450,
      frequency: RECURRING_FREQUENCY.MONTHLY,
      dayOfMonth: 1,
      startDate: '2026-01-01',
      isShared: true,
    });
    const response = await POST(request as never);

    expect(response.status).toBe(201);
    expect(capturedCreateData!.amountCents).toBe(22500); // Math.ceil(45000/2)
    expect(capturedCreateData!.sharedDivisor).toBe(2);
    expect(capturedCreateData!.originalAmountCents).toBe(45000);
  });

  it('should return 400 for missing required fields', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses', {
      categoryId: 1,
      // missing amount, frequency, startDate
    });
    const response = await POST(request as never);

    expect(response.status).toBe(400);
  });

  it('should return 400 when monthly frequency misses dayOfMonth', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses', {
      categoryId: 1,
      amount: 100,
      frequency: RECURRING_FREQUENCY.MONTHLY,
      startDate: '2026-01-01',
      // missing dayOfMonth
    });
    const response = await POST(request as never);

    expect(response.status).toBe(400);
  });

  it('should return 400 when weekly frequency misses dayOfWeek', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses', {
      categoryId: 1,
      amount: 50,
      frequency: RECURRING_FREQUENCY.WEEKLY,
      startDate: '2026-01-01',
      // missing dayOfWeek
    });
    const response = await POST(request as never);

    expect(response.status).toBe(400);
  });

  it('should return 400 when yearly frequency misses monthOfYear', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses', {
      categoryId: 1,
      amount: 200,
      frequency: RECURRING_FREQUENCY.YEARLY,
      dayOfMonth: 15,
      startDate: '2026-01-01',
      // missing monthOfYear
    });
    const response = await POST(request as never);

    expect(response.status).toBe(400);
  });

  it('should create weekly recurring expense with dayOfWeek', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses', {
      categoryId: 1,
      amount: 25,
      frequency: RECURRING_FREQUENCY.WEEKLY,
      dayOfWeek: 1,
      startDate: '2026-01-01',
    });
    const response = await POST(request as never);

    expect(response.status).toBe(201);
    expect(capturedCreateData!.amountCents).toBe(2500);
  });
});

// ── GET /api/recurring-expenses/[id] ──

describe('GET /api/recurring-expenses/[id]', () => {
  it('should return a recurring expense by ID', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/1');
    const response = await GET_SINGLE(request as never, createMockParams('1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.recurringExpenseId).toBe(1);
  });

  it('should return 404 for non-existent expense', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/999');
    const response = await GET_SINGLE(request as never, createMockParams('999'));

    expect(response.status).toBe(404);
  });

  it('should return 400 for invalid ID', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/abc');
    const response = await GET_SINGLE(request as never, createMockParams('abc'));

    expect(response.status).toBe(400);
  });

  it('should return 400 for negative ID', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/-1');
    const response = await GET_SINGLE(request as never, createMockParams('-1'));

    expect(response.status).toBe(400);
  });
});

// ── PUT /api/recurring-expenses/[id] ──

describe('PUT /api/recurring-expenses/[id]', () => {
  beforeEach(() => {
    capturedUpdateData = null;
  });

  it('should update amount with euro to cents conversion', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/1', {
      amount: 500,
    });
    const response = await PUT(request as never, createMockParams('1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(capturedUpdateData!.data.amountCents).toBe(50000);
  });

  it('should update amount with shared logic', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/1', {
      amount: 500,
      isShared: true,
    });
    const response = await PUT(request as never, createMockParams('1'));

    expect(response.status).toBe(200);
    expect(capturedUpdateData!.data.amountCents).toBe(25000);
    expect(capturedUpdateData!.data.sharedDivisor).toBe(2);
    expect(capturedUpdateData!.data.originalAmountCents).toBe(50000);
  });

  it('should update frequency', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/1', {
      frequency: RECURRING_FREQUENCY.WEEKLY,
    });
    const response = await PUT(request as never, createMockParams('1'));

    expect(response.status).toBe(200);
    expect(capturedUpdateData!.data.frequency).toBe(RECURRING_FREQUENCY.WEEKLY);
  });

  it('should return 404 for non-existent expense', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/999', {
      amount: 100,
    });
    const response = await PUT(request as never, createMockParams('999'));

    expect(response.status).toBe(404);
  });

  it('should return 400 for invalid ID', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/abc', {
      amount: 100,
    });
    const response = await PUT(request as never, createMockParams('abc'));

    expect(response.status).toBe(400);
  });

  it('should update isActive field', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/1', {
      isActive: false,
    });
    const response = await PUT(request as never, createMockParams('1'));

    expect(response.status).toBe(200);
    expect(capturedUpdateData!.data.isActive).toBe(false);
  });
});

// ── DELETE /api/recurring-expenses/[id] ──

describe('DELETE /api/recurring-expenses/[id]', () => {
  it('should soft-delete a recurring expense', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/1');
    const response = await DELETE(request as never, createMockParams('1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should return 404 for non-existent expense', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/999');
    const response = await DELETE(request as never, createMockParams('999'));

    expect(response.status).toBe(404);
  });

  it('should return 400 for invalid ID', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/abc');
    const response = await DELETE(request as never, createMockParams('abc'));

    expect(response.status).toBe(400);
  });
});
