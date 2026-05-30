/**
 * Integration Tests: Summary Trends API
 * Tests GET /api/summary/trends?fromMonth=YYYY-MM&toMonth=YYYY-MM
 */

import { API_ERROR } from '@/constants/finance';
import type { MonthlySummaryTrends } from '@/types/finance';

const mockTrends: MonthlySummaryTrends = {
  fromMonth: '2024-06',
  toMonth: '2025-05',
  points: [
    { month: '2024-06', incomeCents: 100000, expenseCents: 40000, balanceCents: 60000 },
    { month: '2024-07', incomeCents: 0, expenseCents: 0, balanceCents: 0 },
  ],
};

jest.mock('@/services/database/TransactionRepository', () => ({
  getMonthlyTrends: jest.fn(async (_fromMonth: string, _toMonth: string) => mockTrends),
  getEarliestActivityMonth: jest.fn(async () => '2020-03'),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { GET } from '@/app/api/summary/trends/route';

function createMockRequest(url: string): { url: string } {
  return { url };
}

const MONTH = /^\d{4}-\d{2}$/;

beforeEach(() => {
  const { getMonthlyTrends, getEarliestActivityMonth } = require('@/services/database/TransactionRepository');
  getMonthlyTrends.mockClear();
  getEarliestActivityMonth.mockClear();
});

describe('GET /api/summary/trends', () => {
  it('returns the trends payload for a valid range', async () => {
    const request = createMockRequest('http://localhost:3000/api/summary/trends?fromMonth=2024-06&toMonth=2025-05');
    const response = await GET(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.points).toHaveLength(2);

    const { getMonthlyTrends } = require('@/services/database/TransactionRepository');
    expect(getMonthlyTrends).toHaveBeenCalledWith('2024-06', '2025-05');
  });

  it('defaults to a trailing 12-month range when no params are given', async () => {
    const request = createMockRequest('http://localhost:3000/api/summary/trends');
    const response = await GET(request as never);

    expect(response.status).toBe(200);

    const { getMonthlyTrends } = require('@/services/database/TransactionRepository');
    expect(getMonthlyTrends).toHaveBeenCalledWith(expect.stringMatching(MONTH), expect.stringMatching(MONTH));
  });

  it('returns 400 for an invalid toMonth', async () => {
    const request = createMockRequest('http://localhost:3000/api/summary/trends?toMonth=invalid');
    const response = await GET(request as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe(API_ERROR.VALIDATION.INVALID_MONTH);
  });

  it('resolves fromMonth=all to the earliest activity month', async () => {
    const request = createMockRequest('http://localhost:3000/api/summary/trends?fromMonth=all&toMonth=2025-05');
    const response = await GET(request as never);

    expect(response.status).toBe(200);

    const { getMonthlyTrends, getEarliestActivityMonth } = require('@/services/database/TransactionRepository');
    expect(getEarliestActivityMonth).toHaveBeenCalledTimes(1);
    expect(getMonthlyTrends).toHaveBeenCalledWith('2020-03', '2025-05');
  });

  it('returns 400 for an invalid fromMonth', async () => {
    const request = createMockRequest('http://localhost:3000/api/summary/trends?fromMonth=2025-13-99&toMonth=2025-05');
    const response = await GET(request as never);

    expect(response.status).toBe(400);
  });
});
