/**
 * Integration Tests: Summary API — yearly lens
 *
 * GET /api/summary answers two questions through the same door: a month, or a whole
 * year. Three things have to hold for the dashboard toggle to be trustworthy:
 *
 *  1. ?year= reaches the yearly rollup, never the monthly one. The two read the same
 *     views but return different totals, so picking the wrong branch would show a
 *     month's figures under a year's heading.
 *  2. A malformed year is refused with the i18n key, instead of reaching SQL as text.
 *  3. The month branch keeps working exactly as before, including its own default.
 */

import { API_ERROR } from '@/constants/finance';
import type { MonthlySummary, YearlySummary } from '@/types/finance';

const mockYearly: YearlySummary = {
  year: '2025',
  incomeCents: 3_600_000,
  expenseCents: 2_400_000,
  balanceCents: 1_200_000,
  byCategory: [],
};

const mockMonthly: MonthlySummary = {
  month: '2025-03',
  incomeCents: 300_000,
  expenseCents: 200_000,
  balanceCents: 100_000,
  byCategory: [],
};

jest.mock('@/services/database/TransactionRepository', () => ({
  getMonthlySummary: jest.fn(async (_month: string) => mockMonthly),
  getYearlySummary: jest.fn(async (_year: string) => mockYearly),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { GET } from '@/app/api/summary/route';

function createMockRequest(url: string): { url: string } {
  return { url };
}

beforeEach(() => {
  const { getMonthlySummary, getYearlySummary } = require('@/services/database/TransactionRepository');
  getMonthlySummary.mockClear();
  getYearlySummary.mockClear();
});

describe('GET /api/summary?year=', () => {
  it('returns the yearly rollup for a valid year', async () => {
    const response = await GET(createMockRequest('http://localhost:3000/api/summary?year=2025') as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.year).toBe('2025');
    expect(data.data.incomeCents).toBe(3_600_000);

    const { getYearlySummary, getMonthlySummary } = require('@/services/database/TransactionRepository');
    expect(getYearlySummary).toHaveBeenCalledWith('2025');
    expect(getMonthlySummary).not.toHaveBeenCalled();
  });

  it('rejects a malformed year with the i18n key', async () => {
    const response = await GET(createMockRequest('http://localhost:3000/api/summary?year=20x5') as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe(API_ERROR.VALIDATION.INVALID_YEAR);

    const { getYearlySummary } = require('@/services/database/TransactionRepository');
    expect(getYearlySummary).not.toHaveBeenCalled();
  });

  it('rejects a year given as a month', async () => {
    const response = await GET(createMockRequest('http://localhost:3000/api/summary?year=2025-03') as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe(API_ERROR.VALIDATION.INVALID_YEAR);
  });

  it('never falls back to the monthly branch when year is present but empty', async () => {
    const response = await GET(createMockRequest('http://localhost:3000/api/summary?year=') as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe(API_ERROR.VALIDATION.INVALID_YEAR);

    const { getMonthlySummary } = require('@/services/database/TransactionRepository');
    expect(getMonthlySummary).not.toHaveBeenCalled();
  });

  it('takes precedence over a month passed alongside it', async () => {
    const response = await GET(createMockRequest('http://localhost:3000/api/summary?month=2025-03&year=2024') as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.year).toBe('2025'); // the mocked rollup

    const { getYearlySummary, getMonthlySummary } = require('@/services/database/TransactionRepository');
    expect(getYearlySummary).toHaveBeenCalledWith('2024');
    expect(getMonthlySummary).not.toHaveBeenCalled();
  });
});

describe('GET /api/summary?month= (unchanged)', () => {
  it('still serves the monthly summary', async () => {
    const response = await GET(createMockRequest('http://localhost:3000/api/summary?month=2025-03') as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.month).toBe('2025-03');

    const { getMonthlySummary } = require('@/services/database/TransactionRepository');
    expect(getMonthlySummary).toHaveBeenCalledWith('2025-03');
  });

  it('still rejects a malformed month', async () => {
    const response = await GET(createMockRequest('http://localhost:3000/api/summary?month=2025-3') as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe(API_ERROR.VALIDATION.INVALID_MONTH);
  });
});
