/**
 * Integration Tests: Recurring Expense Occurrences API
 * Tests GET /api/recurring-expenses/pending
 * Tests POST /api/recurring-expenses/occurrences/[id]/confirm
 * Tests POST /api/recurring-expenses/occurrences/[id]/skip
 */

import { OCCURRENCE_STATUS, RECURRING_FREQUENCY, TRANSACTION_TYPE } from '@/constants/finance';
import type { PendingOccurrencesSummary, RecurringOccurrence } from '@/types/finance';

const mockOccurrence: RecurringOccurrence = {
  occurrenceId: 10,
  recurringExpenseId: 1,
  occurrenceDate: '2026-03-01',
  status: OCCURRENCE_STATUS.CONFIRMED,
  transactionId: 100,
  modifiedAmountCents: null,
  processedAt: '2026-03-03T10:00:00Z',
  recurringExpense: {
    recurringExpenseId: 1,
    categoryId: 1,
    category: {
      categoryId: 1,
      name: 'Vivienda',
      type: TRANSACTION_TYPE.EXPENSE,
      icon: 'home',
      color: '#EF4444',
      sortOrder: 0,
      isActive: true,
      parentCategoryId: null,
      defaultShared: false,
      defaultVatPercent: null,
      defaultDeductionPercent: null,
    },
    amountCents: 45000,
    description: 'Alquiler',
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
  },
};

const mockPendingSummary: PendingOccurrencesSummary = {
  months: [
    {
      month: '2026-03',
      occurrences: [{ ...mockOccurrence, status: OCCURRENCE_STATUS.PENDING, transactionId: null, processedAt: null }],
      totalPendingCents: 45000,
      count: 1,
    },
  ],
  totalCount: 1,
};

jest.mock('@/services/database/RecurringExpenseRepository', () => ({
  getAllPendingOccurrences: jest.fn(async () => mockPendingSummary),
  confirmOccurrence: jest.fn(async (occurrenceId: number, modifiedAmountCents?: number) => {
    if (occurrenceId === 999) throw new Error('Occurrence not found');
    if (occurrenceId === 888) throw new Error('Occurrence is not pending');
    return {
      ...mockOccurrence,
      occurrenceId,
      modifiedAmountCents: modifiedAmountCents ?? null,
    };
  }),
  skipOccurrence: jest.fn(async (occurrenceId: number) => {
    if (occurrenceId === 999) return false;
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

import { POST as CONFIRM } from '@/app/api/recurring-expenses/occurrences/[id]/confirm/route';
import { POST as SKIP } from '@/app/api/recurring-expenses/occurrences/[id]/skip/route';
import { GET as GET_PENDING } from '@/app/api/recurring-expenses/pending/route';

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

// ── GET /api/recurring-expenses/pending ──

describe('GET /api/recurring-expenses/pending', () => {
  it('should return all pending occurrences grouped by month', async () => {
    const response = await GET_PENDING();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.totalCount).toBe(1);
    expect(data.data.months).toHaveLength(1);
    expect(data.data.months[0].month).toBe('2026-03');
    expect(data.data.months[0].count).toBe(1);
  });

  it('should call getAllPendingOccurrences without parameters', async () => {
    await GET_PENDING();

    const { getAllPendingOccurrences } = require('@/services/database/RecurringExpenseRepository');
    expect(getAllPendingOccurrences).toHaveBeenCalledWith();
  });
});

// ── POST /api/recurring-expenses/occurrences/[id]/confirm ──

describe('POST /api/recurring-expenses/occurrences/[id]/confirm', () => {
  it('should confirm an occurrence without modified amount', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/occurrences/10/confirm');
    const response = await CONFIRM(request as never, createMockParams('10'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.occurrenceId).toBe(10);
  });

  it('should confirm with modified amount (euros to cents conversion)', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/occurrences/10/confirm', {
      modifiedAmount: 500,
    });
    const response = await CONFIRM(request as never, createMockParams('10'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    const { confirmOccurrence } = require('@/services/database/RecurringExpenseRepository');
    expect(confirmOccurrence).toHaveBeenCalledWith(10, 50000);
  });

  it('should return 400 for invalid ID', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/occurrences/abc/confirm');
    const response = await CONFIRM(request as never, createMockParams('abc'));

    expect(response.status).toBe(400);
  });

  it('should return 400 for negative ID', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/occurrences/-5/confirm');
    const response = await CONFIRM(request as never, createMockParams('-5'));

    expect(response.status).toBe(400);
  });

  it('should return 500 when occurrence not found', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/occurrences/999/confirm');
    const response = await CONFIRM(request as never, createMockParams('999'));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');
  });

  it('should return 500 when occurrence is not pending', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/occurrences/888/confirm');
    const response = await CONFIRM(request as never, createMockParams('888'));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');
  });

  it('should return 400 for invalid modifiedAmount', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/occurrences/10/confirm', {
      modifiedAmount: -100,
    });
    const response = await CONFIRM(request as never, createMockParams('10'));

    expect(response.status).toBe(400);
  });
});

// ── POST /api/recurring-expenses/occurrences/[id]/skip ──

describe('POST /api/recurring-expenses/occurrences/[id]/skip', () => {
  it('should skip an occurrence', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/occurrences/10/skip');
    const response = await SKIP(request as never, createMockParams('10'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should return 404 when occurrence not found or already processed', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/occurrences/999/skip');
    const response = await SKIP(request as never, createMockParams('999'));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
  });

  it('should return 400 for invalid ID', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/occurrences/abc/skip');
    const response = await SKIP(request as never, createMockParams('abc'));

    expect(response.status).toBe(400);
  });

  it('should return 400 for zero ID', async () => {
    const request = createMockRequest('http://localhost:3000/api/recurring-expenses/occurrences/0/skip');
    const response = await SKIP(request as never, createMockParams('0'));

    expect(response.status).toBe(400);
  });
});
