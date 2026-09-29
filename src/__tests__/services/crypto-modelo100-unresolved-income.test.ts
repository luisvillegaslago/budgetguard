/**
 * Integration test: getModelo100Summary reports how many airdrops (0304) and
 * staking rewards (0033) were summed at 0 € because their price was never
 * resolved. PriceService falls back to 'unresolved' (price 0) when every
 * provider fails, the normaliser stores the leg with GrossValueEurCents = 0,
 * and the box silently under-reports unless the count travels with it.
 *
 * The connection layer is faked, so the SQL cannot run here; the test pins the
 * contract instead: the airdrop/staking query counts PriceSource = 'unresolved'
 * per Kind through a bound parameter, and the summary exposes that count per box.
 */

import { CRYPTO_PRICE_SOURCE, CRYPTO_TAXABLE_KIND } from '@/constants/finance';

const calls: Array<{ sql: string; params: unknown[] }> = [];

jest.mock('@/services/database/connection', () => ({
  getPool: jest.fn(),
  query: jest.fn(async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    if (sql.includes('"TaxableEvents"')) {
      return [
        { Kind: CRYPTO_TAXABLE_KIND.AIRDROP, TotalCents: '7500', UnresolvedCount: '0' },
        { Kind: CRYPTO_TAXABLE_KIND.STAKING_REWARD, TotalCents: '300', UnresolvedCount: '4' },
      ];
    }
    return [];
  }),
}));

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 1),
  AuthError: class AuthError extends Error {},
}));

import { getModelo100Summary } from '@/services/database/CryptoFiscalRepository';

describe('getModelo100Summary — airdrops and rewards with an unresolved price', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('exposes the unresolved count per box next to its amount', async () => {
    const summary = await getModelo100Summary(2025);

    expect(summary.casilla0304Cents).toBe(7500);
    expect(summary.casilla0304UnresolvedCount).toBe(0);
    expect(summary.casilla0033Cents).toBe(300);
    expect(summary.casilla0033UnresolvedCount).toBe(4);
  });

  it('counts the unresolved rows per Kind with the price source bound as a parameter', async () => {
    await getModelo100Summary(2025);

    const incomeQuery = calls.find((c) => c.sql.includes('"TaxableEvents"'));
    const match = incomeQuery?.sql.match(/COUNT\(\*\) FILTER \(WHERE "PriceSource" = \$(\d+)\)/);
    expect(match).not.toBeNull();
    const paramIndex = Number(match?.[1]) - 1;
    expect(incomeQuery?.params[paramIndex]).toBe(CRYPTO_PRICE_SOURCE.UNRESOLVED);
    expect(incomeQuery?.sql).toMatch(/GROUP BY "Kind"/);
  });

  it('reports 0 unresolved when the year has no airdrops or rewards', async () => {
    const { query } = jest.requireMock('@/services/database/connection') as { query: jest.Mock };
    query.mockImplementationOnce(async () => []).mockImplementationOnce(async () => []);

    const summary = await getModelo100Summary(2025);

    expect(summary.casilla0304UnresolvedCount).toBe(0);
    expect(summary.casilla0033UnresolvedCount).toBe(0);
  });
});
