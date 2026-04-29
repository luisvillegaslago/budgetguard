/**
 * Integration test: POST /api/crypto/fiscal/recompute
 *
 * Critical contract:
 *  - validates the year (rejects out-of-range)
 *  - delegates to the repository, returns its result verbatim
 *  - is idempotent (two calls in a row return the same shape — FIFO is
 *    deterministic given the same TaxableEvent set)
 */

let yearRecomputeCalls = 0;
let allRecomputeCalls = 0;
let lastRecomputeYear: number | null = null;
const mockYearResult = {
  fiscalYear: 2025,
  disposalsInserted: 318,
  incompleteCoverageCount: 13,
};
const mockAllResult = {
  years: [
    { fiscalYear: 2024, disposalsInserted: 155, incompleteCoverageCount: 6 },
    { fiscalYear: 2025, disposalsInserted: 318, incompleteCoverageCount: 13 },
  ],
  totalDisposalsInserted: 473,
  totalIncompleteCoverage: 19,
};

jest.mock('@/services/database/CryptoFiscalRepository', () => ({
  recomputeYearForUser: jest.fn(async (_userId: number, year: number) => {
    yearRecomputeCalls += 1;
    lastRecomputeYear = year;
    return mockYearResult;
  }),
  recomputeAllYearsForUser: jest.fn(async () => {
    allRecomputeCalls += 1;
    return mockAllResult;
  }),
}));

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 42),
  AuthError: class AuthError extends Error {},
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { POST } from '@/app/api/crypto/fiscal/recompute/route';

function createMockRequest(body: Record<string, unknown>) {
  return {
    url: 'http://localhost:3000/api/crypto/fiscal/recompute',
    json: async () => body,
  };
}

beforeEach(() => {
  yearRecomputeCalls = 0;
  allRecomputeCalls = 0;
  lastRecomputeYear = null;
});

describe('POST /api/crypto/fiscal/recompute', () => {
  it('rejects an out-of-range year (validation 400, repository not called)', async () => {
    const res = await POST(createMockRequest({ year: 1900 }) as never);
    expect(res.status).toBe(400);
    expect(yearRecomputeCalls).toBe(0);
    expect(allRecomputeCalls).toBe(0);
  });

  it('runs the per-year recompute when `year` is provided', async () => {
    const res = await POST(createMockRequest({ year: 2025 }) as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.mode).toBe('year');
    expect(data.data.fiscalYear).toBe(2025);
    expect(yearRecomputeCalls).toBe(1);
    expect(allRecomputeCalls).toBe(0);
    expect(lastRecomputeYear).toBe(2025);
  });

  it('runs the all-years recompute when no body / no year is provided', async () => {
    const res = await POST(createMockRequest({}) as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.mode).toBe('all');
    expect(data.data.years).toHaveLength(2);
    expect(data.data.totalDisposalsInserted).toBe(473);
    expect(yearRecomputeCalls).toBe(0);
    expect(allRecomputeCalls).toBe(1);
  });

  it('is idempotent across consecutive all-year calls (same input → same output)', async () => {
    const r1 = await (await POST(createMockRequest({}) as never)).json();
    const r2 = await (await POST(createMockRequest({}) as never)).json();

    expect(r1.data).toEqual(r2.data);
    expect(allRecomputeCalls).toBe(2);
  });
});
