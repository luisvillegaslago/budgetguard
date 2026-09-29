/**
 * Integration tests: Binance records → raw events → TaxableEvents.
 *
 * Runs the real CSV importer, the real EventNormalizer and the real
 * NormalizationService. Only the database (the raw-event queue and the
 * TaxableEvents insert) and the EUR price lookup are faked, so every
 * assertion reads the exact legs the normaliser would write — the rows FIFO
 * and casillas 1804 / 0033 / 0304 are computed from.
 *
 * Each block pins one way a record that moved no value, or moved it the other
 * way, used to reach those casillas:
 *   - a cancelled / failed / refunded API record became a taxable leg
 *   - a card sale was booked as a purchase
 *   - "Staking Purchase" (locking own principal) became staking income
 *   - an internal Spot ↔ Funding transfer opened lots at market value
 *   - only the first fill of a same-second spot order survived the CSV
 */

// PriceService and BinanceClient instantiate a Binance MainClient at module
// load; the real client does not load under jest.
jest.mock('binance', () => ({ MainClient: class {} }));

import {
  CRYPTO_CONTRAPRESTACION,
  CRYPTO_EVENT_TYPE,
  CRYPTO_PRICE_SOURCE,
  CRYPTO_TAXABLE_KIND,
} from '@/constants/finance';
import type { TaxableEventInput } from '@/services/database/TaxableEventsRepository';
import { binanceCsvImporter } from '@/services/exchanges/binance/CsvImporter';
import { normalizeForUser } from '@/services/exchanges/binance/NormalizationService';
import type { RawEventInput } from '@/services/exchanges/shared/types';

// ============================================================
// Fakes: raw-event queue, TaxableEvents insert, EUR prices
// ============================================================

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

const EUR_PRICE: Record<string, number> = { BTC: 40_000, ETH: 2_500, USDT: 0.92, BNB: 500 };

jest.mock('@/services/exchanges/binance/PriceService', () => ({
  ...jest.requireActual<typeof import('@/services/exchanges/binance/PriceService')>(
    '@/services/exchanges/binance/PriceService',
  ),
  getPriceEurCents: jest.fn(async (asset: string, at: Date) => {
    const eur = EUR_PRICE[asset] ?? 0;
    return {
      asset,
      dateUtc: at.toISOString().slice(0, 10),
      eurPriceCents: Math.round(eur * 100),
      eurPriceMicroCents: Math.round(eur * 1e8),
      source: CRYPTO_PRICE_SOURCE.BINANCE_EUR,
    };
  }),
}));

const USER_ID = 1;
const AT = new Date('2025-06-15T10:00:00Z');

async function normalise(events: RawEventInput[]): Promise<TaxableEventInput[]> {
  queue = events.map((event, idx) => ({
    rawEventId: String(idx + 1),
    eventType: event.eventType,
    occurredAt: event.occurredAt.toISOString(),
    rawPayload: event.rawPayload,
  }));
  inserted = [];
  await normalizeForUser(USER_ID);
  return inserted;
}

function apiRecord(eventType: RawEventInput['eventType'], rawPayload: Record<string, unknown>): RawEventInput {
  return { eventType, externalId: `api-${eventType}`, occurredAt: AT, rawPayload };
}

function importCsv(lines: string[], header = 'User_ID,UTC_Time,Account,Operation,Coin,Change,Remark') {
  return binanceCsvImporter.import([header, ...lines].join('\n'), 'Binance-Transaction-History.csv');
}

const { ACQUISITION, DISPOSAL, STAKING_REWARD, TRANSFER_IN, TRANSFER_OUT } = CRYPTO_TAXABLE_KIND;

/** Kind, asset and native quantity of each leg, in insert order. */
function kinds(legs: TaxableEventInput[]): Array<[string, string, string]> {
  return legs.map((leg): [string, string, string] => [leg.kind, leg.asset, leg.quantityNative]);
}

beforeEach(() => {
  queue = [];
  inserted = [];
});

// ============================================================
// API records that never moved funds
// ============================================================

describe('API records in a failed terminal state produce no taxable leg', () => {
  it('a cancelled P2P sale leaves no disposal in 1804-F', async () => {
    const order = { tradeType: 'SELL', asset: 'USDT', fiat: 'EUR', amount: '1000', totalPrice: '930', commission: '0' };
    const legs = await normalise([
      apiRecord(CRYPTO_EVENT_TYPE.C2C, { ...order, orderNumber: 'a', orderStatus: 'CANCELLED' }),
      apiRecord(CRYPTO_EVENT_TYPE.C2C, { ...order, orderNumber: 'b', orderStatus: 'CANCELLED_BY_SYSTEM' }),
    ]);
    expect(legs).toEqual([]);
  });

  it('a completed P2P sale is still a disposal against fiat', async () => {
    const legs = await normalise([
      apiRecord(CRYPTO_EVENT_TYPE.C2C, {
        tradeType: 'SELL',
        asset: 'USDT',
        fiat: 'EUR',
        amount: '1000',
        totalPrice: '930',
        commission: '0',
        orderStatus: 'COMPLETED',
      }),
    ]);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({
      kind: DISPOSAL,
      asset: 'USDT',
      grossValueEurCents: 93_000,
      contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT,
    });
  });

  it('a failed or refunded card payment opens no lot', async () => {
    const payment = { transactionType: '0', cryptoCurrency: 'BTC', fiatCurrency: 'EUR', obtainAmount: '0.01' };
    const legs = await normalise([
      apiRecord(CRYPTO_EVENT_TYPE.FIAT_PAYMENT, { ...payment, sourceAmount: '400', totalFee: '4', status: 'Failed' }),
      apiRecord(CRYPTO_EVENT_TYPE.FIAT_PAYMENT, { ...payment, sourceAmount: '400', totalFee: '4', status: 'Refunded' }),
    ]);
    expect(legs).toEqual([]);
  });

  it('a cancelled, rejected or failed withdrawal disposes of no network fee', async () => {
    const withdrawal = { coin: 'BTC', amount: '0.1', transactionFee: '0.0005' };
    const legs = await normalise([
      apiRecord(CRYPTO_EVENT_TYPE.WITHDRAW, { ...withdrawal, id: '1', status: 1 }),
      apiRecord(CRYPTO_EVENT_TYPE.WITHDRAW, { ...withdrawal, id: '3', status: 3 }),
      apiRecord(CRYPTO_EVENT_TYPE.WITHDRAW, { ...withdrawal, id: '5', status: 5 }),
    ]);
    expect(legs).toEqual([]);
  });

  it('a completed withdrawal keeps its transfer_out and the fee disposal', async () => {
    const legs = await normalise([
      apiRecord(CRYPTO_EVENT_TYPE.WITHDRAW, { coin: 'BTC', amount: '0.1', transactionFee: '0.0005', status: 6 }),
    ]);
    expect(kinds(legs)).toEqual([
      [TRANSFER_OUT, 'BTC', '0.1'],
      [DISPOSAL, 'BTC', '0.0005'],
    ]);
  });

  it('a rejected or wrong deposit opens no transfer_in lot', async () => {
    const legs = await normalise([
      apiRecord(CRYPTO_EVENT_TYPE.DEPOSIT, { coin: 'ETH', amount: '2', txId: 'x', status: 2 }),
      apiRecord(CRYPTO_EVENT_TYPE.DEPOSIT, { coin: 'ETH', amount: '2', txId: 'y', status: 7 }),
    ]);
    expect(legs).toEqual([]);
  });

  it('a credited deposit still opens its transfer_in lot', async () => {
    const legs = await normalise([
      apiRecord(CRYPTO_EVENT_TYPE.DEPOSIT, { coin: 'ETH', amount: '2', txId: 'z', status: 1 }),
    ]);
    expect(kinds(legs)).toEqual([[TRANSFER_IN, 'ETH', '2']]);
  });

  it('a failed convert disposes of nothing', async () => {
    const legs = await normalise([
      apiRecord(CRYPTO_EVENT_TYPE.CONVERT, {
        fromAsset: 'BTC',
        toAsset: 'USDT',
        fromAmount: '0.1',
        toAmount: '4000',
        orderStatus: 'FAIL',
      }),
    ]);
    expect(legs).toEqual([]);
  });

  it('a record still in flight keeps its legs, because its stored payload is never refreshed', async () => {
    // Ingestion keeps the first payload it sees (ON CONFLICT DO NOTHING), so
    // dropping an in-flight order here would lose it for good once it completes.
    const legs = await normalise([
      apiRecord(CRYPTO_EVENT_TYPE.C2C, {
        tradeType: 'BUY',
        asset: 'USDT',
        fiat: 'EUR',
        amount: '100',
        totalPrice: '93',
        commission: '0',
        orderStatus: 'TRADING',
      }),
    ]);
    expect(kinds(legs)).toEqual([[ACQUISITION, 'USDT', '100']]);
  });
});

// ============================================================
// Card sale (fiat payments, transactionType=1)
// ============================================================

describe('card payments', () => {
  const sale = {
    orderNo: 's1',
    transactionType: '1',
    cryptoCurrency: 'BTC',
    fiatCurrency: 'EUR',
    obtainAmount: '0.01',
    sourceAmount: '950',
    totalFee: '0',
    status: 'Completed',
  };

  it('a sale of crypto to the card is a disposal paid in fiat, not a purchase', async () => {
    const legs = await normalise([apiRecord(CRYPTO_EVENT_TYPE.FIAT_PAYMENT, sale)]);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({
      kind: DISPOSAL,
      asset: 'BTC',
      quantityNative: '0.01',
      counterAsset: 'EUR',
      counterQuantityNative: '950',
      grossValueEurCents: 95_000,
      priceSource: CRYPTO_PRICE_SOURCE.FIAT_COUNTER,
      contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT,
    });
  });

  it('a card purchase (transactionType=0) is still an acquisition', async () => {
    const legs = await normalise([apiRecord(CRYPTO_EVENT_TYPE.FIAT_PAYMENT, { ...sale, transactionType: '0' })]);
    expect(legs[0]?.kind).toBe(ACQUISITION);
  });
});

// ============================================================
// CSV: Staking Purchase and negative reward rows
// ============================================================

describe('Binance CSV: locking principal is not income', () => {
  it('"Staking Purchase" rows produce no staking_reward, in either wallet', async () => {
    const { events, summary } = importCsv([
      '1,2025-03-01 09:00:00,Spot,Staking Purchase,ETH,-10,',
      '1,2025-03-01 09:00:00,Earn,Staking Purchase,ETH,10,',
    ]);
    expect(events).toEqual([]);
    expect(summary).toMatchObject({ rowsMapped: 0, rowsSkipped: 2, skippedOperations: { 'Staking Purchase': 2 } });
    expect(await normalise(events)).toEqual([]);
  });

  it('a negative row of a reward operation is skipped, never turned into positive income', async () => {
    const { events, summary } = importCsv([
      '1,2025-03-01 09:00:00,Earn,Simple Earn Flexible Interest,USDT,-0.5,',
      '1,2025-03-02 09:00:00,Earn,Simple Earn Flexible Interest,USDT,0.25,',
    ]);
    expect(summary).toMatchObject({ rowsMapped: 1, rowsSkipped: 1 });
    const legs = await normalise(events);
    expect(kinds(legs)).toEqual([[STAKING_REWARD, 'USDT', '0.25']]);
  });

  it('real staking rewards still reach 0033 as staking_reward', async () => {
    const { events } = importCsv(['1,2025-03-01 09:00:00,Earn,Staking Rewards,ETH,0.01,']);
    const legs = await normalise(events);
    expect(kinds(legs)).toEqual([[STAKING_REWARD, 'ETH', '0.01']]);
  });
});

// ============================================================
// CSV: internal wallet transfer
// ============================================================

describe('Binance CSV: moving coins between Spot and Funding', () => {
  it('opens no transfer_in lot for either side of the move', async () => {
    const { events, summary } = importCsv([
      '1,2025-04-01 12:00:00,Spot,Transfer Between Main and Funding Wallet,BTC,-0.5,',
      '1,2025-04-01 12:00:00,Funding,Transfer Between Main and Funding Wallet,BTC,0.5,',
    ]);
    expect(events).toEqual([]);
    expect(summary.skippedOperations).toEqual({ 'Transfer Between Main and Funding Wallet': 2 });
    expect(await normalise(events)).toEqual([]);
  });

  it('a real deposit still opens its transfer_in lot', async () => {
    const { events } = importCsv(['1,2025-04-01 12:00:00,Spot,Deposit,BTC,0.5,']);
    const legs = await normalise(events);
    expect(kinds(legs)).toEqual([[TRANSFER_IN, 'BTC', '0.5']]);
  });
});

// ============================================================
// CSV: several fills in the same second
// ============================================================

describe('Binance CSV: a spot order filled several times in the same second', () => {
  const LEGACY = 'User_ID,UTC_Time,Account,Operation,Coin,Change,Remark';
  const CURRENT = 'User ID,Time,Account,Operation,Coin,Change,Remark';

  // [label, header, rows]. Which layout real exports use within one second is
  // unverified, so both the grouped and the interleaved order are pinned.
  const FILL_LAYOUTS: Array<[string, string, string[]]> = [
    [
      'legacy header, rows grouped by operation',
      LEGACY,
      [
        '1,2025-03-01 12:00:00,Spot,Buy,BTC,0.1,',
        '1,2025-03-01 12:00:00,Spot,Buy,BTC,0.2,',
        '1,2025-03-01 12:00:00,Spot,Sell,USDT,-3000,',
        '1,2025-03-01 12:00:00,Spot,Sell,USDT,-6000,',
        '1,2025-03-01 12:00:00,Spot,Fee,BNB,-0.001,',
        '1,2025-03-01 12:00:00,Spot,Fee,BNB,-0.002,',
      ],
    ],
    [
      'current header, one triplet per fill',
      CURRENT,
      [
        '1,25-03-01 12:00:00,Spot,Transaction Buy,BTC,0.1,',
        '1,25-03-01 12:00:00,Spot,Transaction Spend,USDT,-3000,',
        '1,25-03-01 12:00:00,Spot,Transaction Fee,BNB,-0.001,',
        '1,25-03-01 12:00:00,Spot,Transaction Buy,BTC,0.2,',
        '1,25-03-01 12:00:00,Spot,Transaction Spend,USDT,-6000,',
        '1,25-03-01 12:00:00,Spot,Transaction Fee,BNB,-0.002,',
      ],
    ],
  ];

  it.each(FILL_LAYOUTS)('keeps every fill (%s)', async (_label, header, lines) => {
    const { events, summary } = importCsv(lines, header);

    expect(summary).toMatchObject({ rowsRead: 6, rowsMapped: 6, rowsSkipped: 0 });
    expect(events.map((event) => event.rawPayload)).toEqual([
      expect.objectContaining({ qty: '0.1', quoteQty: '3000', commission: '0.001', commissionAsset: 'BNB' }),
      expect.objectContaining({ qty: '0.2', quoteQty: '6000', commission: '0.002', commissionAsset: 'BNB' }),
    ]);

    const legs = await normalise(events);
    expect(kinds(legs)).toEqual([
      [ACQUISITION, 'BTC', '0.1'],
      [DISPOSAL, 'USDT', '3000'],
      [ACQUISITION, 'BTC', '0.2'],
      [DISPOSAL, 'USDT', '6000'],
    ]);
  });

  it('keeps the historical id of the first fill, so re-importing a file adds only the missing fills', () => {
    const firstFillOnly = importCsv([
      '1,2025-03-01 12:00:00,Spot,Buy,BTC,0.1,',
      '1,2025-03-01 12:00:00,Spot,Sell,USDT,-3000,',
      '1,2025-03-01 12:00:00,Spot,Fee,BNB,-0.001,',
    ]);
    const bothFills = importCsv([
      '1,2025-03-01 12:00:00,Spot,Buy,BTC,0.1,',
      '1,2025-03-01 12:00:00,Spot,Sell,USDT,-3000,',
      '1,2025-03-01 12:00:00,Spot,Fee,BNB,-0.001,',
      '1,2025-03-01 12:00:00,Spot,Buy,BTC,0.2,',
      '1,2025-03-01 12:00:00,Spot,Sell,USDT,-6000,',
      '1,2025-03-01 12:00:00,Spot,Fee,BNB,-0.002,',
    ]);
    expect(bothFills.events).toHaveLength(2);
    expect(bothFills.events[0]?.externalId).toBe(firstFillOnly.events[0]?.externalId);
    expect(bothFills.events[1]?.externalId).not.toBe(bothFills.events[0]?.externalId);
  });

  it('gives two identical fills distinct ids, so the unique key does not drop the second', () => {
    const { events } = importCsv([
      '1,2025-03-01 12:00:00,Spot,Buy,BTC,0.1,',
      '1,2025-03-01 12:00:00,Spot,Sell,USDT,-3000,',
      '1,2025-03-01 12:00:00,Spot,Buy,BTC,0.1,',
      '1,2025-03-01 12:00:00,Spot,Sell,USDT,-3000,',
    ]);
    expect(events).toHaveLength(2);
    expect(new Set(events.map((event) => event.externalId)).size).toBe(2);
  });

  it('sums the rows of a single pair when the fill counts do not line up', async () => {
    const { events, summary } = importCsv([
      '1,2025-03-01 12:00:00,Spot,Buy,BTC,0.1,',
      '1,2025-03-01 12:00:00,Spot,Buy,BTC,0.2,',
      '1,2025-03-01 12:00:00,Spot,Sell,USDT,-9000,',
    ]);
    expect(summary).toMatchObject({ rowsMapped: 3, rowsSkipped: 0 });
    const legs = await normalise(events);
    expect(kinds(legs)).toEqual([
      [ACQUISITION, 'BTC', '0.3'],
      [DISPOSAL, 'USDT', '9000'],
    ]);
  });

  it('reports the rows it cannot pair as skipped instead of counting them as mapped', () => {
    const { events, summary } = importCsv([
      '1,2025-03-01 12:00:00,Spot,Buy,BTC,0.1,',
      '1,2025-03-01 12:00:00,Spot,Sell,USDT,-3000,',
      '1,2025-03-01 12:00:00,Spot,Buy,ETH,1,',
    ]);
    expect(events).toHaveLength(1);
    expect(summary).toMatchObject({ rowsMapped: 2, rowsSkipped: 1, skippedOperations: { Buy: 1 } });
  });

  describe('several coin pairs traded in the same second', () => {
    /** The fields that say which coin was bought with which, and how much of each. */
    function trades(events: RawEventInput[]) {
      return events.map(({ rawPayload: { symbol, baseAsset, quoteAsset, qty, quoteQty } }) => ({
        symbol,
        baseAsset,
        quoteAsset,
        qty,
        quoteQty,
      }));
    }

    it('pairs each bought coin with the coin paid for it, so no purchase drops out of FIFO', async () => {
      // ETH bought with BTC and BTC bought with USDT. Taking the first given
      // row of another coin would pair ETH with USDT and leave both BTC rows out.
      const { events, summary } = importCsv([
        '1,2025-03-01 12:00:00,Spot,Buy,ETH,1,',
        '1,2025-03-01 12:00:00,Spot,Buy,BTC,0.05,',
        '1,2025-03-01 12:00:00,Spot,Sell,USDT,-2000,',
        '1,2025-03-01 12:00:00,Spot,Sell,BTC,-0.0625,',
      ]);

      expect(summary).toMatchObject({ rowsRead: 4, rowsMapped: 4, rowsSkipped: 0, skippedOperations: {} });
      expect(trades(events)).toEqual([
        { symbol: 'ETHBTC', baseAsset: 'ETH', quoteAsset: 'BTC', qty: '1', quoteQty: '0.0625' },
        { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', qty: '0.05', quoteQty: '2000' },
      ]);

      const legs = await normalise(events);
      expect(kinds(legs)).toEqual([
        [ACQUISITION, 'ETH', '1'],
        [DISPOSAL, 'BTC', '0.0625'],
        [ACQUISITION, 'BTC', '0.05'],
        [DISPOSAL, 'USDT', '2000'],
      ]);
    });

    it('leaves a group the first-free pairing already got right untouched, ids included', () => {
      // Swapping the two given rows would pair as many rows, so only the
      // row-order preference keeps these fills. The ids are pinned as literals:
      // the first is the one the one-event-per-second importer stored for this
      // second, and a change to either makes a re-import store that fill twice.
      const { events, summary } = importCsv([
        '1,2025-03-01 12:00:00,Spot,Buy,ETH,1,',
        '1,2025-03-01 12:00:00,Spot,Sell,BTC,-0.0625,',
        '1,2025-03-01 12:00:00,Spot,Fee,BNB,-0.001,',
        '1,2025-03-01 12:00:00,Spot,Buy,SOL,10,',
        '1,2025-03-01 12:00:00,Spot,Sell,USDT,-1500,',
        '1,2025-03-01 12:00:00,Spot,Fee,BNB,-0.002,',
      ]);

      expect(summary).toMatchObject({ rowsMapped: 6, rowsSkipped: 0 });
      expect(events.map((event) => [event.externalId, event.rawPayload])).toEqual([
        [
          'csv-spot-af7e421caf38de9b',
          expect.objectContaining({ symbol: 'ETHBTC', qty: '1', quoteQty: '0.0625', commission: '0.001' }),
        ],
        [
          'csv-spot-c63788deed15df75-1',
          expect.objectContaining({ symbol: 'SOLUSDT', qty: '10', quoteQty: '1500', commission: '0.002' }),
        ],
      ]);
    });

    it('breaks a tie between equally complete pairings by row order', () => {
      // BTC can only be bought with USDT or EUR, so four pairings keep all six
      // rows. The first bought row keeps the first given row whenever a
      // complete pairing still exists, which is the nth-with-nth order
      // Binance lists a trade's rows in, bent only as far as BTC needs.
      const { events, summary } = importCsv([
        '1,2025-03-01 12:00:00,Spot,Buy,ETH,1,',
        '1,2025-03-01 12:00:00,Spot,Buy,SOL,10,',
        '1,2025-03-01 12:00:00,Spot,Buy,BTC,0.05,',
        '1,2025-03-01 12:00:00,Spot,Sell,USDT,-2500,',
        '1,2025-03-01 12:00:00,Spot,Sell,EUR,-1800,',
        '1,2025-03-01 12:00:00,Spot,Sell,BTC,-0.04,',
      ]);

      expect(summary).toMatchObject({ rowsMapped: 6, rowsSkipped: 0 });
      expect(trades(events)).toEqual([
        { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', qty: '1', quoteQty: '2500' },
        { symbol: 'SOLBTC', baseAsset: 'SOL', quoteAsset: 'BTC', qty: '10', quoteQty: '0.04' },
        { symbol: 'BTCEUR', baseAsset: 'BTC', quoteAsset: 'EUR', qty: '0.05', quoteQty: '1800' },
      ]);
    });
  });
});
