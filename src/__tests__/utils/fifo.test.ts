/**
 * Unit tests for the FIFO matcher (src/utils/crypto/fifo.ts).
 *
 * Pure function, no DB. Covers: lot push/pop ordering, multi-lot disposal,
 * fee allocation pro-rata, incomplete coverage, fiat-vs-crypto routing,
 * staking_reward + airdrop also feed the lot queue, transfer_in pushes a
 * lot at FMV (AEAT proxy when source-wallet basis is unknown), transfer_out
 * is a no-op, gain/loss math, sub-cent gross apportionment, needs-review
 * flagging, and the per-element box derivation.
 */

import { CRYPTO_CONTRAPRESTACION, CRYPTO_PRICE_SOURCE, CRYPTO_TAXABLE_KIND } from '@/constants/finance';
import { type FifoTaxableEvent, runFifo } from '@/utils/crypto/fifo';

let nextId = 1;
function ev(partial: Partial<FifoTaxableEvent>): FifoTaxableEvent {
  return {
    taxableEventId: String(nextId++),
    kind: CRYPTO_TAXABLE_KIND.ACQUISITION,
    occurredAt: '2025-01-01T00:00:00Z',
    asset: 'BTC',
    quantityNative: '1',
    unitPriceEurCents: 0,
    grossValueEurCents: 0,
    feeEurCents: 0,
    priceSource: CRYPTO_PRICE_SOURCE.BINANCE_EUR,
    contraprestacion: null,
    ...partial,
  };
}

beforeEach(() => {
  nextId = 1;
});

describe('runFifo', () => {
  it('emits no disposals when there are no disposal events', () => {
    const result = runFifo([
      ev({ kind: CRYPTO_TAXABLE_KIND.ACQUISITION, asset: 'BTC', quantityNative: '1' }),
      ev({ kind: CRYPTO_TAXABLE_KIND.AIRDROP, asset: 'OPN', quantityNative: '50' }),
    ]);
    expect(result).toHaveLength(0);
  });

  it('matches a simple buy then sell at a profit', () => {
    const result = runFifo([
      ev({
        kind: CRYPTO_TAXABLE_KIND.ACQUISITION,
        asset: 'BTC',
        quantityNative: '1',
        unitPriceEurCents: 30_000_00, // 30k EUR
        grossValueEurCents: 30_000_00,
        occurredAt: '2024-06-01T00:00:00Z',
      }),
      ev({
        kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
        asset: 'BTC',
        quantityNative: '1',
        unitPriceEurCents: 50_000_00,
        grossValueEurCents: 50_000_00,
        contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT,
        occurredAt: '2025-03-15T00:00:00Z',
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.acquisitionValueCents).toBe(30_000_00);
    expect(result[0]?.transmissionValueCents).toBe(50_000_00);
    expect(result[0]?.gainLossCents).toBe(20_000_00);
    expect(result[0]?.fiscalYear).toBe(2025);
    expect(result[0]?.contraprestacion).toBe(CRYPTO_CONTRAPRESTACION.FIAT);
    expect(result[0]?.acquisitionLots).toHaveLength(1);
    expect(result[0]?.incompleteCoverage).toBe(false);
  });

  it('partially consumes the first lot and leaves the remainder', () => {
    const result = runFifo([
      ev({
        kind: CRYPTO_TAXABLE_KIND.ACQUISITION,
        asset: 'ETH',
        quantityNative: '10',
        unitPriceEurCents: 2_000_00,
        grossValueEurCents: 20_000_00,
      }),
      ev({
        kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
        asset: 'ETH',
        quantityNative: '3',
        unitPriceEurCents: 3_000_00,
        grossValueEurCents: 9_000_00,
        contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT,
        occurredAt: '2025-08-01T00:00:00Z',
      }),
      ev({
        kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
        asset: 'ETH',
        quantityNative: '4',
        unitPriceEurCents: 3_500_00,
        grossValueEurCents: 14_000_00,
        contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT,
        occurredAt: '2025-09-01T00:00:00Z',
      }),
    ]);

    expect(result).toHaveLength(2);
    // First disposal: 3 ETH * 2k = 6k cost
    expect(result[0]?.acquisitionValueCents).toBe(6_000_00);
    expect(result[0]?.gainLossCents).toBe(3_000_00);
    // Second disposal: 4 ETH * 2k = 8k cost (still from the same lot)
    expect(result[1]?.acquisitionValueCents).toBe(8_000_00);
    expect(result[1]?.gainLossCents).toBe(6_000_00);
  });

  it('consumes across multiple lots in FIFO order', () => {
    const result = runFifo([
      ev({
        kind: CRYPTO_TAXABLE_KIND.ACQUISITION,
        asset: 'BTC',
        quantityNative: '0.5',
        unitPriceEurCents: 20_000_00,
        grossValueEurCents: 10_000_00,
        occurredAt: '2024-01-01T00:00:00Z',
      }),
      ev({
        kind: CRYPTO_TAXABLE_KIND.ACQUISITION,
        asset: 'BTC',
        quantityNative: '0.5',
        unitPriceEurCents: 40_000_00,
        grossValueEurCents: 20_000_00,
        occurredAt: '2024-06-01T00:00:00Z',
      }),
      ev({
        kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
        asset: 'BTC',
        quantityNative: '0.8',
        unitPriceEurCents: 60_000_00,
        grossValueEurCents: 48_000_00,
        contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT,
        occurredAt: '2025-04-01T00:00:00Z',
      }),
    ]);

    expect(result).toHaveLength(1);
    // 0.5 from lot1 (20k * 0.5 = 10k) + 0.3 from lot2 (40k * 0.3 = 12k) = 22k
    expect(result[0]?.acquisitionValueCents).toBe(22_000_00);
    expect(result[0]?.gainLossCents).toBe(48_000_00 - 22_000_00);
    expect(result[0]?.acquisitionLots).toHaveLength(2);
    expect(Number(result[0]?.acquisitionLots[0]?.quantityConsumed)).toBeCloseTo(0.5, 6);
    expect(Number(result[0]?.acquisitionLots[1]?.quantityConsumed)).toBeCloseTo(0.3, 6);
  });

  it('marks incomplete coverage when not enough lots exist', () => {
    const result = runFifo([
      ev({
        kind: CRYPTO_TAXABLE_KIND.ACQUISITION,
        asset: 'BTC',
        quantityNative: '0.1',
        unitPriceEurCents: 30_000_00,
        grossValueEurCents: 3_000_00,
      }),
      ev({
        kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
        asset: 'BTC',
        quantityNative: '0.5', // more than we have!
        unitPriceEurCents: 50_000_00,
        grossValueEurCents: 25_000_00,
        contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT,
        occurredAt: '2025-04-01T00:00:00Z',
      }),
    ]);

    expect(result[0]?.incompleteCoverage).toBe(true);
    // Only 0.1 BTC of cost basis applied
    expect(result[0]?.acquisitionValueCents).toBe(3_000_00);
  });

  it('treats airdrops and staking rewards as acquisitions feeding the lot queue', () => {
    const result = runFifo([
      ev({
        kind: CRYPTO_TAXABLE_KIND.AIRDROP,
        asset: 'OPN',
        quantityNative: '100',
        unitPriceEurCents: 50, // 0.50 EUR/unit
        grossValueEurCents: 50_00,
      }),
      ev({
        kind: CRYPTO_TAXABLE_KIND.STAKING_REWARD,
        asset: 'OPN',
        quantityNative: '20',
        unitPriceEurCents: 60,
        grossValueEurCents: 12_00,
      }),
      ev({
        kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
        asset: 'OPN',
        quantityNative: '110',
        unitPriceEurCents: 80,
        grossValueEurCents: 88_00,
        contraprestacion: CRYPTO_CONTRAPRESTACION.NON_FIAT,
        occurredAt: '2025-12-15T00:00:00Z',
      }),
    ]);

    // Cost basis: 100 * 50 = 5000 + 10 * 60 = 600 → 5600 cents
    expect(result[0]?.acquisitionValueCents).toBe(56_00);
    expect(result[0]?.acquisitionLots).toHaveLength(2);
  });

  it('routes fiat vs non-fiat disposals to the right contraprestacion', () => {
    const result = runFifo([
      ev({
        kind: CRYPTO_TAXABLE_KIND.ACQUISITION,
        asset: 'BTC',
        quantityNative: '1',
        unitPriceEurCents: 30_000_00,
        grossValueEurCents: 30_000_00,
      }),
      ev({
        kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
        asset: 'BTC',
        quantityNative: '0.3',
        unitPriceEurCents: 50_000_00,
        grossValueEurCents: 15_000_00,
        contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT,
        occurredAt: '2025-05-01T00:00:00Z',
      }),
      ev({
        kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
        asset: 'BTC',
        quantityNative: '0.2',
        unitPriceEurCents: 60_000_00,
        grossValueEurCents: 12_000_00,
        contraprestacion: CRYPTO_CONTRAPRESTACION.NON_FIAT,
        occurredAt: '2025-06-01T00:00:00Z',
      }),
    ]);

    expect(result[0]?.contraprestacion).toBe(CRYPTO_CONTRAPRESTACION.FIAT);
    expect(result[1]?.contraprestacion).toBe(CRYPTO_CONTRAPRESTACION.NON_FIAT);
  });

  it('skips disposals with null contraprestacion (defensive)', () => {
    const result = runFifo([
      ev({ kind: CRYPTO_TAXABLE_KIND.ACQUISITION, asset: 'BTC', quantityNative: '1' }),
      ev({
        kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
        asset: 'BTC',
        quantityNative: '0.5',
        contraprestacion: null,
      }),
    ]);
    expect(result).toHaveLength(0);
  });

  it('transfer_out does not move lots (user moving coins to own external wallet)', () => {
    const result = runFifo([
      ev({
        kind: CRYPTO_TAXABLE_KIND.ACQUISITION,
        asset: 'BTC',
        quantityNative: '1',
        unitPriceEurCents: 30_000_00,
        grossValueEurCents: 30_000_00,
      }),
      ev({ kind: CRYPTO_TAXABLE_KIND.TRANSFER_OUT, asset: 'BTC', quantityNative: '0.5' }),
      ev({
        kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
        asset: 'BTC',
        quantityNative: '1',
        unitPriceEurCents: 50_000_00,
        grossValueEurCents: 50_000_00,
        contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT,
        occurredAt: '2025-07-01T00:00:00Z',
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.acquisitionValueCents).toBe(30_000_00);
    expect(result[0]?.incompleteCoverage).toBe(false);
  });

  it('transfer_in pushes a lot at FMV (cost basis when source wallet has no history)', () => {
    const result = runFifo([
      ev({
        kind: CRYPTO_TAXABLE_KIND.TRANSFER_IN,
        asset: 'BTC',
        quantityNative: '1',
        unitPriceEurCents: 30_000_00,
        grossValueEurCents: 30_000_00,
      }),
      ev({
        kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
        asset: 'BTC',
        quantityNative: '1',
        unitPriceEurCents: 50_000_00,
        grossValueEurCents: 50_000_00,
        contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT,
        occurredAt: '2025-07-01T00:00:00Z',
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.acquisitionValueCents).toBe(30_000_00);
    expect(result[0]?.gainLossCents).toBe(20_000_00);
    expect(result[0]?.incompleteCoverage).toBe(false);
  });

  it('keeps assets independent (BTC lot does not cover ETH disposal)', () => {
    const result = runFifo([
      ev({
        kind: CRYPTO_TAXABLE_KIND.ACQUISITION,
        asset: 'BTC',
        quantityNative: '1',
        unitPriceEurCents: 30_000_00,
        grossValueEurCents: 30_000_00,
      }),
      ev({
        kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
        asset: 'ETH',
        quantityNative: '1',
        unitPriceEurCents: 3_000_00,
        grossValueEurCents: 3_000_00,
        contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT,
        occurredAt: '2025-07-01T00:00:00Z',
      }),
    ]);

    // ETH disposal has no lots → incomplete, acquisition = 0
    expect(result[0]?.incompleteCoverage).toBe(true);
    expect(result[0]?.acquisitionValueCents).toBe(0);
  });

  it('allocates fee proportionally on partial lot consumption', () => {
    const result = runFifo([
      ev({
        kind: CRYPTO_TAXABLE_KIND.ACQUISITION,
        asset: 'BTC',
        quantityNative: '1',
        unitPriceEurCents: 30_000_00,
        grossValueEurCents: 30_000_00,
        feeEurCents: 100_00, // 100 EUR fee
      }),
      ev({
        kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
        asset: 'BTC',
        quantityNative: '0.4',
        grossValueEurCents: 20_000_00,
        contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT,
        occurredAt: '2025-04-01T00:00:00Z',
      }),
      ev({
        kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
        asset: 'BTC',
        quantityNative: '0.6',
        grossValueEurCents: 30_000_00,
        contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT,
        occurredAt: '2025-05-01T00:00:00Z',
      }),
    ]);

    expect(result[0]?.acquisitionFeeCents).toBe(40_00); // 40% of 100
    expect(result[1]?.acquisitionFeeCents).toBe(60_00); // 60% of 100
    expect((result[0]?.acquisitionFeeCents ?? 0) + (result[1]?.acquisitionFeeCents ?? 0)).toBe(100_00);
  });
});

describe('runFifo — sub-cent assets (gross apportionment)', () => {
  it('apportions basis from stored gross when unit price rounds to 0', () => {
    const result = runFifo([
      ev({
        kind: CRYPTO_TAXABLE_KIND.ACQUISITION,
        asset: 'SHIB',
        quantityNative: '100000000',
        unitPriceEurCents: 0, // 0.0000085 EUR/unit rounds to 0 cents
        grossValueEurCents: 85_000, // but the precise stored gross is 850 EUR
        occurredAt: '2024-06-01T00:00:00Z',
      }),
      ev({
        kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
        asset: 'SHIB',
        quantityNative: '100000000',
        unitPriceEurCents: 0,
        grossValueEurCents: 90_000, // sold for 900 EUR
        contraprestacion: CRYPTO_CONTRAPRESTACION.NON_FIAT,
        occurredAt: '2025-03-15T00:00:00Z',
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.acquisitionValueCents).toBe(85_000); // not 0
    expect(result[0]?.transmissionValueCents).toBe(90_000);
    expect(result[0]?.gainLossCents).toBe(5_000);
    expect(result[0]?.incompleteCoverage).toBe(false);
  });

  it('apportions a partial sub-cent disposal proportionally and conserves gross', () => {
    const result = runFifo([
      ev({
        kind: CRYPTO_TAXABLE_KIND.ACQUISITION,
        asset: 'PEPE',
        quantityNative: '100000000',
        unitPriceEurCents: 0,
        grossValueEurCents: 85_000,
        occurredAt: '2024-06-01T00:00:00Z',
      }),
      ev({
        kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
        asset: 'PEPE',
        quantityNative: '40000000', // 40% of the lot
        unitPriceEurCents: 0,
        grossValueEurCents: 40_000,
        contraprestacion: CRYPTO_CONTRAPRESTACION.NON_FIAT,
        occurredAt: '2025-07-01T00:00:00Z',
      }),
      ev({
        kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
        asset: 'PEPE',
        quantityNative: '60000000', // remaining 60%
        unitPriceEurCents: 0,
        grossValueEurCents: 60_000,
        contraprestacion: CRYPTO_CONTRAPRESTACION.NON_FIAT,
        occurredAt: '2025-08-01T00:00:00Z',
      }),
    ]);

    expect(result).toHaveLength(2);
    // 40% of 85_000 = 34_000; remainder takes the rest = 51_000; sum == 85_000.
    expect(result[0]?.acquisitionValueCents).toBe(34_000);
    expect(result[1]?.acquisitionValueCents).toBe(51_000);
    expect((result[0]?.acquisitionValueCents ?? 0) + (result[1]?.acquisitionValueCents ?? 0)).toBe(85_000);
  });
});

describe('needsReview flagging (H3 + M1)', () => {
  it('clean fiat sale with a market-priced acquisition is not flagged', () => {
    const [d] = runFifo([
      ev({
        kind: CRYPTO_TAXABLE_KIND.ACQUISITION,
        asset: 'BTC',
        quantityNative: '1',
        unitPriceEurCents: 30_000_00,
        grossValueEurCents: 30_000_00,
        priceSource: CRYPTO_PRICE_SOURCE.BINANCE_EUR,
        occurredAt: '2024-06-01T00:00:00Z',
      }),
      ev({
        kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
        asset: 'BTC',
        quantityNative: '1',
        grossValueEurCents: 50_000_00,
        priceSource: CRYPTO_PRICE_SOURCE.FIAT_COUNTER,
        contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT,
        occurredAt: '2025-03-15T00:00:00Z',
      }),
    ]);
    expect(d?.needsReview).toBe(false);
    expect(d?.acquisitionLots[0]?.fmvProxy).toBe(false);
    expect(d?.acquisitionLots[0]?.sourcePriceSource).toBe(CRYPTO_PRICE_SOURCE.BINANCE_EUR);
  });

  it('flags a disposal that consumes a transfer_in FMV-proxy lot', () => {
    const [d] = runFifo([
      ev({
        kind: CRYPTO_TAXABLE_KIND.TRANSFER_IN,
        asset: 'ETH',
        quantityNative: '5',
        unitPriceEurCents: 2_000_00,
        grossValueEurCents: 10_000_00,
        priceSource: CRYPTO_PRICE_SOURCE.BINANCE_EUR,
        occurredAt: '2024-02-01T00:00:00Z',
      }),
      ev({
        kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
        asset: 'ETH',
        quantityNative: '5',
        grossValueEurCents: 15_000_00,
        priceSource: CRYPTO_PRICE_SOURCE.FIAT_COUNTER,
        contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT,
        occurredAt: '2025-05-01T00:00:00Z',
      }),
    ]);
    expect(d?.needsReview).toBe(true);
    expect(d?.acquisitionLots[0]?.fmvProxy).toBe(true);
  });

  it('flags a disposal whose cost basis came from an unresolved/0-price acquisition', () => {
    const [d] = runFifo([
      ev({
        kind: CRYPTO_TAXABLE_KIND.ACQUISITION,
        asset: 'XYZ',
        quantityNative: '100',
        unitPriceEurCents: 0,
        grossValueEurCents: 0,
        priceSource: CRYPTO_PRICE_SOURCE.UNRESOLVED,
        occurredAt: '2024-09-01T00:00:00Z',
      }),
      ev({
        kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
        asset: 'XYZ',
        quantityNative: '100',
        grossValueEurCents: 5_00,
        priceSource: CRYPTO_PRICE_SOURCE.BINANCE_EUR,
        contraprestacion: CRYPTO_CONTRAPRESTACION.NON_FIAT,
        occurredAt: '2025-04-01T00:00:00Z',
      }),
    ]);
    expect(d?.needsReview).toBe(true);
  });

  it('flags a disposal whose own transmission price is unresolved', () => {
    const [d] = runFifo([
      ev({
        kind: CRYPTO_TAXABLE_KIND.ACQUISITION,
        asset: 'BTC',
        quantityNative: '1',
        unitPriceEurCents: 30_000_00,
        grossValueEurCents: 30_000_00,
        priceSource: CRYPTO_PRICE_SOURCE.BINANCE_EUR,
        occurredAt: '2024-06-01T00:00:00Z',
      }),
      ev({
        kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
        asset: 'BTC',
        quantityNative: '1',
        grossValueEurCents: 0,
        priceSource: CRYPTO_PRICE_SOURCE.UNRESOLVED,
        contraprestacion: CRYPTO_CONTRAPRESTACION.NON_FIAT,
        occurredAt: '2025-07-01T00:00:00Z',
      }),
    ]);
    expect(d?.needsReview).toBe(true);
  });
});
