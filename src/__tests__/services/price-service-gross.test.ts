/**
 * computeGrossEurCents — the first-computation core of the sub-cent (H1) fix.
 *
 * The second argument is a per-unit price in MICRO-CENTS (cents x 1e6 = EUR
 * x 1e8); gross is rounded ONCE after multiplying by quantity, so sub-cent
 * tokens (SHIB/PEPE) no longer quantize to 0.
 */

// PriceService instantiates a Binance MainClient at module load; stub the
// package so importing the pure computeGrossEurCents helper doesn't pull in
// the real client (which fails under jest).
jest.mock('binance', () => ({ MainClient: class {} }));

import { computeGrossEurCents } from '@/services/exchanges/binance/PriceService';

describe('computeGrossEurCents (micro-cent precision)', () => {
  it('does not quantize a sub-cent token to 0', () => {
    // SHIB @ 0.0000085 EUR/unit = 850 micro-cents/unit, 100,000,000 units.
    const gross = computeGrossEurCents('100000000', 850);
    expect(gross).toBe(85_000); // 850.00 EUR — would be 0 with integer-cents price
  });

  it('rounds once at the end (no per-unit rounding drift)', () => {
    // 333 units @ 850 micro-cents -> 333*850/1e6 = 0.28305 cents -> 0
    expect(computeGrossEurCents('333', 850)).toBe(0);
    // 3,333,333 units -> 2833.33305 cents -> 2833
    expect(computeGrossEurCents('3333333', 850)).toBe(2_833);
  });

  it('handles a normal whole-cent price unchanged', () => {
    // BTC @ 30,000 EUR = 3,000,000 cents = 3,000,000,000,000 micro-cents, 1 unit
    expect(computeGrossEurCents('1', 3_000_000_000_000)).toBe(30_000_00);
  });

  it('returns 0 for invalid / negative quantities', () => {
    expect(computeGrossEurCents('not-a-number', 850)).toBe(0);
    expect(computeGrossEurCents('-5', 850)).toBe(0);
  });
});
