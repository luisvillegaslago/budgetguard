/**
 * Unit Tests: getMonthlyTrends repository method
 * Verifies the zero-fill behavior and inverted-range guard for trend queries.
 */

interface BalanceRow {
  Month: string;
  IncomeCents: number;
  ExpenseCents: number;
  BalanceCents: number;
}

const mockQuery = jest.fn();

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 1),
  AuthError: class AuthError extends Error {},
}));

jest.mock('@/services/database/connection', () => ({
  query: (sql: string, params: unknown[]) => mockQuery(sql, params),
  getPool: jest.fn(),
}));

import { getMonthlyTrends } from '@/services/database/TransactionRepository';

function row(month: string, income: number, expense: number, balance: number): BalanceRow {
  return { Month: month, IncomeCents: income, ExpenseCents: expense, BalanceCents: balance };
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe('getMonthlyTrends', () => {
  it('zero-fills months without data inside the range', async () => {
    // Only Jan and Mar have rows; Feb must be filled with zeros.
    mockQuery.mockResolvedValueOnce([row('2025-01', 100000, 40000, 60000), row('2025-03', 50000, 30000, 20000)]);

    const result = await getMonthlyTrends('2025-01', '2025-03');
    const [jan, feb, mar] = result.points;

    expect(result.points).toHaveLength(3);
    expect(result.points.map((p) => p.month)).toEqual(['2025-01', '2025-02', '2025-03']);

    expect(feb?.incomeCents).toBe(0);
    expect(feb?.expenseCents).toBe(0);
    expect(feb?.balanceCents).toBe(0);

    expect(jan?.balanceCents).toBe(60000);
    expect(mar?.balanceCents).toBe(20000);
  });

  it('spans across year boundaries', async () => {
    mockQuery.mockResolvedValueOnce([]);

    const result = await getMonthlyTrends('2024-11', '2025-02');

    expect(result.points.map((p) => p.month)).toEqual(['2024-11', '2024-12', '2025-01', '2025-02']);
    expect(result.points.every((p) => p.incomeCents === 0)).toBe(true);
  });

  it('returns no points for an inverted range without querying', async () => {
    const result = await getMonthlyTrends('2025-05', '2025-01');

    expect(result.points).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('queries vw_MonthlyBalance with the range and user id', async () => {
    mockQuery.mockResolvedValueOnce([]);

    await getMonthlyTrends('2025-01', '2025-02');

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringMatching(/vw_MonthlyBalance[\s\S]*BETWEEN/), [
      '2025-01',
      '2025-02',
      1,
    ]);
  });
});
