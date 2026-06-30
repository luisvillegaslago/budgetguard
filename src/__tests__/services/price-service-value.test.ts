/**
 * isPriceResolved / resolveGrossEurCentsOrNull — the resolvability guard and
 * gross-value helper for the sub-cent (H1) valuation fix.
 *
 * The guard is based on the precise micro-cent price, so a sub-cent asset
 * (eurPriceCents=0 but eurPriceMicroCents>0) is treated as resolved and its
 * quantity-scaled value is computed via the micro-cent path instead of
 * collapsing to 0 / null.
 */

// PriceService instantiates a Binance MainClient at module load; stub the
// package so importing the pure helpers doesn't pull in the real client.
jest.mock('binance', () => ({ MainClient: class {} }));

import { CRYPTO_PRICE_SOURCE } from '@/constants/finance';
import {
  isPriceResolved,
  type ResolvedPrice,
  resolveGrossEurCentsOrNull,
} from '@/services/exchanges/binance/PriceService';

function makePrice(partial: Partial<ResolvedPrice>): ResolvedPrice {
  return {
    asset: 'SHIB',
    dateUtc: '2026-01-01',
    eurPriceCents: 0,
    eurPriceMicroCents: 0,
    source: CRYPTO_PRICE_SOURCE.BINANCE_EUR,
    ...partial,
  };
}

describe('isPriceResolved', () => {
  it('treats a sub-cent price (cents=0, micro-cents>0) as resolved', () => {
    expect(isPriceResolved(makePrice({ eurPriceCents: 0, eurPriceMicroCents: 850 }))).toBe(true);
  });

  it('treats an unresolved price (micro-cents=0) as not resolved', () => {
    expect(isPriceResolved(makePrice({ eurPriceMicroCents: 0, source: CRYPTO_PRICE_SOURCE.UNRESOLVED }))).toBe(false);
  });

  it('treats a normal whole-cent price as resolved', () => {
    expect(isPriceResolved(makePrice({ eurPriceCents: 3_000_000, eurPriceMicroCents: 3_000_000_000_000 }))).toBe(true);
  });
});

describe('resolveGrossEurCentsOrNull', () => {
  it('values a sub-cent token via the micro-cent path instead of 0', () => {
    // SHIB @ 850 micro-cents/unit, 100,000,000 units -> 850.00 EUR.
    const price = makePrice({ eurPriceCents: 0, eurPriceMicroCents: 850 });
    expect(resolveGrossEurCentsOrNull('100000000', price)).toBe(85_000);
  });

  it('returns null when the price is unresolved', () => {
    const price = makePrice({ eurPriceMicroCents: 0, source: CRYPTO_PRICE_SOURCE.UNRESOLVED });
    expect(resolveGrossEurCentsOrNull('100000000', price)).toBeNull();
  });

  it('distinguishes a resolved-but-rounds-to-0 value (0) from unresolved (null)', () => {
    // 333 units @ 850 micro-cents -> 0.28305 cents -> rounds to 0, but resolved.
    const price = makePrice({ eurPriceCents: 0, eurPriceMicroCents: 850 });
    expect(resolveGrossEurCentsOrNull('333', price)).toBe(0);
  });
});
