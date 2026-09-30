/**
 * Integration: normalizeForUser on a dust conversion, the real normaliser and
 * pricing path with only storage and price lookups faked.
 *
 * A dust conversion is a permuta: the swept token is disposed of and the BNB
 * credited becomes a lot. The swept token is usually a long-tail coin with no
 * price, so its disposal is valued at the BNB it fetched, fee included, and
 * the fee is then taken off as for any disposal. Other operation types keep an
 * unresolved price as unresolved, for review.
 */

import { CRYPTO_EVENT_TYPE, CRYPTO_PRICE_SOURCE, CRYPTO_TAXABLE_KIND } from '@/constants/finance';

jest.mock('binance', () => ({ MainClient: class {} }));

interface QueuedRaw {
  rawEventId: string;
  eventType: string;
  occurredAt: string;
  rawPayload: Record<string, unknown>;
}

let queue: QueuedRaw[] = [];
let inserted: TaxableEventInput[] = [];

jest.mock('@/services/database/TaxableEventsRepository', () => ({
  listUnnormalisedRawEventsForUser: jest.fn(async (_userId: number, limit: number) => queue.slice(0, limit)),
  markRawEventsNormalized: jest.fn(async (ids: string[]) => {
    queue = queue.filter((raw) => !ids.includes(raw.rawEventId));
  }),
  bulkInsertTaxableEventsForUser: jest.fn(async (_userId: number, legs: TaxableEventInput[]) => {
    inserted.push(...legs);
    return legs.length;
  }),
}));

// 500 € per BNB; every other asset has no price.
const BNB_EUR_CENTS = 50_000;

jest.mock('@/services/exchanges/binance/PriceService', () => ({
  ...jest.requireActual<typeof import('@/services/exchanges/binance/PriceService')>(
    '@/services/exchanges/binance/PriceService',
  ),
  getPriceEurCents: jest.fn(async (asset: string, at: Date) => {
    const known = asset === 'BNB';
    return {
      asset,
      dateUtc: at.toISOString().slice(0, 10),
      eurPriceCents: known ? BNB_EUR_CENTS : 0,
      eurPriceMicroCents: known ? BNB_EUR_CENTS * 1_000_000 : 0,
      source: known ? CRYPTO_PRICE_SOURCE.BINANCE_EUR : CRYPTO_PRICE_SOURCE.UNRESOLVED,
    };
  }),
}));

import type { TaxableEventInput } from '@/services/database/TaxableEventsRepository';
import { normalizeForUser } from '@/services/exchanges/binance/NormalizationService';

function dust(fromAsset: string, amount: string, transferedAmount: string): QueuedRaw {
  return {
    rawEventId: '1',
    eventType: CRYPTO_EVENT_TYPE.DUST,
    occurredAt: '2025-09-24T06:14:02.000Z',
    rawPayload: {
      detail: { fromAsset, amount, targetAsset: 'BNB', transferedAmount, serviceChargeAmount: '0.0002' },
    },
  };
}

beforeEach(() => {
  inserted = [];
});

describe('normalizeForUser — dust conversions', () => {
  it('books the BNB credited as a lot and values an unpriced token at the BNB it fetched', async () => {
    queue = [dust('HEMI', '41.81410321', '0.01')];

    await normalizeForUser(1);

    const disposal = inserted.find((leg) => leg.kind === CRYPTO_TAXABLE_KIND.DISPOSAL);
    const acquisition = inserted.find((leg) => leg.kind === CRYPTO_TAXABLE_KIND.ACQUISITION);
    // The lot is the 0.01 BNB credited (5 €). The token fetched 0.0102 BNB before
    // the 0.0002 BNB fee (5.10 €); the 0.10 € fee comes off once, as a fee.
    expect(acquisition).toMatchObject({ asset: 'BNB', quantityNative: '0.01', grossValueEurCents: 500 });
    expect(disposal).toMatchObject({
      asset: 'HEMI',
      grossValueEurCents: 510,
      feeEurCents: 10,
      priceSource: CRYPTO_PRICE_SOURCE.COUNTER_ASSET,
    });
  });

  it('leaves an unpriced spot sale unresolved rather than valuing it at its counter', async () => {
    queue = [
      {
        rawEventId: '2',
        eventType: CRYPTO_EVENT_TYPE.SPOT_TRADE,
        occurredAt: '2025-09-24T06:14:02.000Z',
        rawPayload: {
          symbol: 'HEMIBNB',
          baseAsset: 'HEMI',
          quoteAsset: 'BNB',
          isBuyer: false,
          qty: '40',
          quoteQty: '0.01',
        },
      },
    ];

    await normalizeForUser(1);

    const disposal = inserted.find((leg) => leg.kind === CRYPTO_TAXABLE_KIND.DISPOSAL);
    expect(disposal).toMatchObject({
      asset: 'HEMI',
      grossValueEurCents: 0,
      priceSource: CRYPTO_PRICE_SOURCE.UNRESOLVED,
    });
  });

  it('keeps the disposal unresolved when the counter has no price either', async () => {
    queue = [
      {
        ...dust('HEMI', '41.81410321', '0.01'),
        rawPayload: { detail: { fromAsset: 'HEMI', amount: '41.81410321', targetAsset: 'XYZ', transferedAmount: '3' } },
      },
    ];

    await normalizeForUser(1);

    const disposal = inserted.find((leg) => leg.kind === CRYPTO_TAXABLE_KIND.DISPOSAL);
    expect(disposal).toMatchObject({ grossValueEurCents: 0, priceSource: CRYPTO_PRICE_SOURCE.UNRESOLVED });
  });
});
