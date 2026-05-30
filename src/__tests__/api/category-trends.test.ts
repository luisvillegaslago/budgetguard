/**
 * Integration Tests: Category Trends API
 * Tests GET /api/summary/category-trends?fromMonth=YYYY-MM&toMonth=YYYY-MM
 */

import { API_ERROR } from '@/constants/finance';
import type { CategoryTrends } from '@/types/finance';

const mockTrends: CategoryTrends = {
  fromMonth: '2024-06',
  toMonth: '2025-05',
  rows: [{ month: '2025-01', categoryId: 1, categoryName: 'Vivienda', categoryColor: '#EF4444', totalCents: 50000 }],
};

jest.mock('@/services/database/TransactionRepository', () => ({
  getCategoryTrends: jest.fn(async (_fromMonth: string, _toMonth: string) => mockTrends),
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

import { GET } from '@/app/api/summary/category-trends/route';

function createMockRequest(url: string): { url: string } {
  return { url };
}

const MONTH = /^\d{4}-\d{2}$/;

beforeEach(() => {
  const { getCategoryTrends, getEarliestActivityMonth } = require('@/services/database/TransactionRepository');
  getCategoryTrends.mockClear();
  getEarliestActivityMonth.mockClear();
});

describe('GET /api/summary/category-trends', () => {
  it('returns the trends payload for a valid range', async () => {
    const request = createMockRequest(
      'http://localhost:3000/api/summary/category-trends?fromMonth=2024-06&toMonth=2025-05',
    );
    const response = await GET(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.rows).toHaveLength(1);

    const { getCategoryTrends } = require('@/services/database/TransactionRepository');
    expect(getCategoryTrends).toHaveBeenCalledWith('2024-06', '2025-05');
  });

  it('defaults to a trailing 12-month range when no params are given', async () => {
    const response = await GET(createMockRequest('http://localhost:3000/api/summary/category-trends') as never);

    expect(response.status).toBe(200);
    const { getCategoryTrends } = require('@/services/database/TransactionRepository');
    expect(getCategoryTrends).toHaveBeenCalledWith(expect.stringMatching(MONTH), expect.stringMatching(MONTH));
  });

  it('resolves fromMonth=all to the earliest activity month', async () => {
    const response = await GET(
      createMockRequest('http://localhost:3000/api/summary/category-trends?fromMonth=all&toMonth=2025-05') as never,
    );

    expect(response.status).toBe(200);
    const { getCategoryTrends, getEarliestActivityMonth } = require('@/services/database/TransactionRepository');
    expect(getEarliestActivityMonth).toHaveBeenCalledTimes(1);
    expect(getCategoryTrends).toHaveBeenCalledWith('2020-03', '2025-05');
  });

  it('returns 400 for an invalid toMonth', async () => {
    const response = await GET(
      createMockRequest('http://localhost:3000/api/summary/category-trends?toMonth=nope') as never,
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe(API_ERROR.VALIDATION.INVALID_MONTH);
  });
});
