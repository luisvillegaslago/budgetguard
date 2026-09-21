/**
 * Integration Tests: getYearlySummary (TransactionRepository)
 *
 * The rollup itself is SQL — SUM() over the same monthly views the month lens reads.
 * What this layer still owns, and what breaks silently if it regresses, is:
 *
 *  1. Both reads are scoped to the year AND the signed-in user. A summary that leaked
 *     across users would quietly mix two people's money.
 *  2. Postgres hands SUM()/bigint columns back as strings. Without the coercion the
 *     dashboard would concatenate them ("100200" instead of 300) the moment a second
 *     month existed — the exact bug the monthly path already guards against.
 *  3. A year with no activity reads as zeroes, not as undefined: an aggregate with no
 *     GROUP BY still returns one row, with every column null.
 */

const executed: Array<{ sql: string; params: unknown[] }> = [];

/** Rows the fake views hand back, set per test. */
let balanceRows: Array<Record<string, unknown>> = [];
let categoryRows: Array<Record<string, unknown>> = [];

const mockQuery = jest.fn(async (sql: string, params: unknown[]) => {
  executed.push({ sql, params });
  return sql.includes('vw_MonthlyBalance') ? balanceRows : categoryRows;
});

jest.mock('@/services/database/connection', () => ({
  query: (...args: [string, unknown[]]) => mockQuery(...args),
  getPool: jest.fn(),
}));

let currentUserId = 2;

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => currentUserId),
}));

import { getYearlySummary } from '@/services/database/TransactionRepository';

beforeEach(() => {
  executed.length = 0;
  mockQuery.mockClear();
  currentUserId = 2;
  balanceRows = [];
  categoryRows = [];
});

describe('getYearlySummary', () => {
  it('scopes both reads to the year and the signed-in user', async () => {
    currentUserId = 7;
    await getYearlySummary('2025');

    expect(executed).toHaveLength(2);
    executed.forEach(({ sql, params }) => {
      // A sargable range, not LEFT("Month", 4): the predicate must stay indexable.
      expect(sql).toContain(`"Month" BETWEEN $1 || '-01' AND $1 || '-12'`);
      expect(sql).not.toContain('LEFT("Month"');
      expect(params).toEqual(['2025', 7]);
    });
  });

  it('coerces the string totals Postgres returns for SUM()/bigint columns', async () => {
    balanceRows = [{ IncomeCents: '3600000', ExpenseCents: '2400000', BalanceCents: '1200000' }];
    categoryRows = [
      {
        Month: '2025',
        Type: 'expense',
        CategoryID: 4,
        CategoryName: 'Vivienda',
        CategoryIcon: 'home',
        CategoryColor: '#6366F1',
        TotalCents: '1450000',
        TransactionCount: '36',
      },
    ];

    const summary = await getYearlySummary('2025');

    expect(summary.incomeCents).toBe(3_600_000);
    expect(summary.expenseCents).toBe(2_400_000);
    expect(summary.balanceCents).toBe(1_200_000);
    expect(summary.byCategory[0]?.totalCents).toBe(1_450_000);
    expect(summary.byCategory[0]?.transactionCount).toBe(36);

    // Not string concatenation: the numbers add up as numbers.
    expect(summary.incomeCents - summary.expenseCents).toBe(summary.balanceCents);
  });

  it('reads a year with no activity as zeroes', async () => {
    // An aggregate with no GROUP BY still returns one row — all columns null.
    balanceRows = [{ IncomeCents: null, ExpenseCents: null, BalanceCents: null }];

    const summary = await getYearlySummary('2019');

    expect(summary).toEqual({
      year: '2019',
      incomeCents: 0,
      expenseCents: 0,
      balanceCents: 0,
      byCategory: [],
    });
  });

  it('survives a year whose balance read returns no row at all', async () => {
    balanceRows = [];

    const summary = await getYearlySummary('2019');

    expect(summary.incomeCents).toBe(0);
    expect(summary.balanceCents).toBe(0);
  });

  it('groups the category read by type and category, not by month', async () => {
    await getYearlySummary('2025');

    const categorySql = executed.find(({ sql }) => sql.includes('vw_MonthlySummary'))?.sql ?? '';
    expect(categorySql).toContain('GROUP BY "Type", "CategoryID"');
    expect(categorySql).toContain('SUM("TotalCents")');
  });
});
