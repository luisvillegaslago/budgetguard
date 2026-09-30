/**
 * Unit tests: the cross-source dedup of spot fills, now that API syncs run
 * through it as well as CSV uploads. It must drop a fill the other source
 * already stored, and nothing else:
 * - an API fill of another market that happens to share the second and a
 *   quantity with a stored CSV fill is a different trade;
 * - a CSV fill of the same market stored with the inverted symbol is the same
 *   trade and is still dropped;
 * - re-importing a CSV must add a second fill of the same size in the same
 *   second, which the first import missed.
 *
 * Matching is one-to-one: a stored row stands for one candidate at most, so
 * two alike fills of one second are never collapsed into the one stored, and
 * the fills of an overlapping CSV export are recognised whatever order it
 * lists them in.
 */

import { CRYPTO_EVENT_TYPE } from '@/constants/finance';
import type { RawEventInput } from '@/services/exchanges/shared/types';

const SECOND_MS = Date.UTC(2025, 2, 10, 12, 0, 5);

interface StoredRow {
  EventType: string;
  ExternalID: string;
  payload: Record<string, unknown>;
  ms: string;
  RewardPayload: null;
}

let storedRows: StoredRow[] = [];

/**
 * A stored row as the index query returns it: every payload key the SQL reads
 * with `"RawPayload"->'key' AS "column"` comes back as that column, NULL when
 * the payload lacks it.
 */
function mockQueryRow(sql: string, row: StoredRow): Record<string, unknown> {
  const columns = Array.from(sql.matchAll(/"RawPayload"->'(\w+)' AS "(\w+)"/g), ([, key = '', column = '']) => [
    column,
    row.payload[key] ?? null,
  ]);
  return {
    EventType: row.EventType,
    ExternalID: row.ExternalID,
    ms: row.ms,
    RewardPayload: row.RewardPayload,
    ...Object.fromEntries(columns),
  };
}

jest.mock('@/services/database/connection', () => ({
  query: jest.fn(async (sql: string) => storedRows.map((row) => mockQueryRow(sql, row))),
}));

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 1),
  AuthError: class AuthError extends Error {},
}));

import { dropCrossSourceDuplicates, loadCrossSourceIndex } from '@/services/database/CryptoRawEventsRepository';
import { query } from '@/services/database/connection';
import { type RewardEventType, rewardExternalId } from '@/services/exchanges/shared/rewardExternalId';

function stored(externalId: string, payload: Record<string, unknown>): StoredRow {
  return {
    EventType: CRYPTO_EVENT_TYPE.SPOT_TRADE,
    ExternalID: externalId,
    payload,
    ms: String(SECOND_MS),
    RewardPayload: null,
  };
}

function candidate(externalId: string, payload: Record<string, unknown>): RawEventInput {
  return {
    eventType: CRYPTO_EVENT_TYPE.SPOT_TRADE,
    externalId,
    occurredAt: new Date(SECOND_MS + 400),
    rawPayload: payload,
  };
}

function idsOf(events: RawEventInput[]): string[] {
  return events.map((event) => event.externalId);
}

// A CSV market buy of BTC paid with 100 USDT: the importer stores the acquired coin first.
const CSV_BTC_BUY = {
  symbol: 'BTCUSDT',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  isBuyer: true,
  qty: '0.001',
  quoteQty: '100',
  csvSource: true,
};

/** An API fill of the same trade as CSV_BTC_BUY, or of another one just like it. */
function apiBtcBuy(tradeId: number): RawEventInput {
  return candidate(`BTCUSDT-${tradeId}`, {
    symbol: 'BTCUSDT',
    id: tradeId,
    isBuyer: true,
    qty: '0.001',
    quoteQty: '100',
  });
}

describe('dropCrossSourceDuplicates — spot fills matched by second', () => {
  it('keeps an API fill of another market with the same quote amount in the same second', async () => {
    storedRows = [stored('csv-spot-a', CSV_BTC_BUY)];
    const index = await loadCrossSourceIndex(1);

    const ethFill = candidate('ETHUSDT-1', { symbol: 'ETHUSDT', isBuyer: true, qty: '0.05', quoteQty: '100' });
    const { kept } = dropCrossSourceDuplicates(index, [ethFill]);

    expect(kept).toHaveLength(1);
  });

  it('still drops the API fill of the same trade stored from a CSV with the inverted symbol', async () => {
    // Selling BTC for USDT: the CSV stores the acquired USDT first, so its symbol reads USDTBTC.
    storedRows = [
      stored('csv-spot-a', {
        symbol: 'USDTBTC',
        baseAsset: 'USDT',
        quoteAsset: 'BTC',
        isBuyer: true,
        qty: '100',
        quoteQty: '0.001',
        csvSource: true,
      }),
    ];
    const index = await loadCrossSourceIndex(1);

    const apiSell = candidate('BTCUSDT-7', { symbol: 'BTCUSDT', isBuyer: false, qty: '0.001', quoteQty: '100' });
    const { kept } = dropCrossSourceDuplicates(index, [apiSell]);

    expect(kept).toHaveLength(0);
  });

  it('keeps an API fill of a market no stored fill shares', async () => {
    storedRows = [stored('csv-spot-a', CSV_BTC_BUY)];
    const index = await loadCrossSourceIndex(1);

    const unknownMarket = candidate('XYZ-1', { symbol: 'XYZ', isBuyer: true, qty: '0.001', quoteQty: '100' });
    const { kept } = dropCrossSourceDuplicates(index, [unknownMarket]);

    expect(kept).toHaveLength(1);
  });

  it('drops the API sell of a market whose quote is not a known suffix (BTCPLN)', async () => {
    // The CSV writes the acquired coin first, so a BTC sell for PLN reads PLNBTC.
    storedRows = [
      stored('csv-spot-a', {
        symbol: 'PLNBTC',
        baseAsset: 'PLN',
        quoteAsset: 'BTC',
        isBuyer: true,
        qty: '400',
        quoteQty: '0.001',
        csvSource: true,
      }),
    ];
    const index = await loadCrossSourceIndex(1);

    const apiSell = candidate('BTCPLN-3', { symbol: 'BTCPLN', isBuyer: false, qty: '0.001', quoteQty: '400' });
    const { kept } = dropCrossSourceDuplicates(index, [apiSell]);

    expect(kept).toHaveLength(0);
  });

  it('drops a CSV fill the API already stored under its market symbol', async () => {
    storedRows = [stored('BTCPLN-3', { symbol: 'BTCPLN', isBuyer: false, qty: '0.001', quoteQty: '400' })];
    const index = await loadCrossSourceIndex(1);

    const csvSell = candidate('csv-spot-pln', {
      symbol: 'PLNBTC',
      baseAsset: 'PLN',
      quoteAsset: 'BTC',
      isBuyer: true,
      qty: '400',
      quoteQty: '0.001',
      csvSource: true,
    });
    const { kept } = dropCrossSourceDuplicates(index, [csvSell]);

    expect(kept).toHaveLength(0);
  });
});

describe('dropCrossSourceDuplicates — one stored row stands for one candidate', () => {
  // The Binance CSV importer ids: the first fill of a second keeps the hash of
  // its rows, every later fill of that second carries its position.
  const FILL_A = { ...CSV_BTC_BUY, qty: '0.001', quoteQty: '95' };
  const FILL_B = { ...CSV_BTC_BUY, qty: '0.002', quoteQty: '190' };

  it('drops both fills of a second when an overlapping CSV export lists them in another order', async () => {
    // The first export listed A then B; the second lists B then A, so both get
    // ids the first import did not store and only the amounts recognise them.
    storedRows = [stored('csv-spot-a', FILL_A), stored('csv-spot-b-1', FILL_B)];
    const index = await loadCrossSourceIndex(1);

    const { kept, skipped } = dropCrossSourceDuplicates(index, [
      candidate('csv-spot-b', FILL_B),
      candidate('csv-spot-a-1', FILL_A),
    ]);

    expect(kept).toEqual([]);
    expect(skipped).toBe(2);
  });

  it('keeps the second of two same-size API fills of one second when the CSV stored only one', async () => {
    storedRows = [stored('csv-spot-a', CSV_BTC_BUY)];
    const index = await loadCrossSourceIndex(1);

    const { kept, skipped } = dropCrossSourceDuplicates(index, [apiBtcBuy(1), apiBtcBuy(2)]);

    expect(idsOf(kept)).toEqual(['BTCUSDT-2']);
    expect(skipped).toBe(1);
  });

  it.each([
    ['in the order the importer emits them', ['csv-spot-h', 'csv-spot-h-1']],
    ['in reverse order', ['csv-spot-h-1', 'csv-spot-h']],
  ])('re-importing a file adds the same-size fill the first import missed (%s)', async (_order, candidateIds) => {
    // The first import stored fill 0 only. Re-importing the file brings fill 0
    // again under its stored id, which the UNIQUE key absorbs, and fill 1 under
    // a new one: fill 0 must claim its own row, or fill 1 would be paired
    // with it and dropped.
    storedRows = [stored('csv-spot-h', CSV_BTC_BUY)];
    const index = await loadCrossSourceIndex(1);

    const { kept, skipped } = dropCrossSourceDuplicates(
      index,
      candidateIds.map((id) => candidate(id, CSV_BTC_BUY)),
    );

    const storedIds = storedRows.map((row) => row.ExternalID);
    expect(idsOf(kept).filter((id) => !storedIds.includes(id))).toEqual(['csv-spot-h-1']);
    expect(skipped).toBe(0);
  });

  it('keeps two alike fills of one CSV file when nothing is stored for them', async () => {
    // A kept candidate is not a stored row later candidates are paired with.
    storedRows = [];
    const index = await loadCrossSourceIndex(1);

    const { kept } = dropCrossSourceDuplicates(index, [
      candidate('csv-spot-h', CSV_BTC_BUY),
      candidate('csv-spot-h-1', CSV_BTC_BUY),
    ]);

    expect(idsOf(kept)).toEqual(['csv-spot-h', 'csv-spot-h-1']);
  });

  it('gives an event fetched again by a later task of the job the same answer, without using up a second row', async () => {
    // Two same-size CSV fills are stored. The first task pairs API fill 1 with
    // one of them; a later task returns fill 1 again together with fill 2.
    storedRows = [stored('csv-spot-h', CSV_BTC_BUY), stored('csv-spot-h-1', CSV_BTC_BUY)];
    const index = await loadCrossSourceIndex(1);

    const first = dropCrossSourceDuplicates(index, [apiBtcBuy(1)]);
    const later = dropCrossSourceDuplicates(index, [apiBtcBuy(1), apiBtcBuy(2)]);

    expect(first.kept).toEqual([]);
    expect(later.kept).toEqual([]);
  });

  it.each([
    ['stored first', ['tx-1', 'tx-2']],
    ['fetched first', ['tx-2', 'tx-1']],
  ])('a re-fetched API deposit claims its own row, not the CSV twin of another (%s)', async (_order, ids) => {
    // Two 100 USDT deposits on one day: the API stored tx-1, a CSV import
    // stored the other one. A sync overlapping that day fetches both again.
    const DAY_START_MS = Date.UTC(2025, 2, 10);
    const deposit = (externalId: string, hour: number, payload: Record<string, unknown>): RawEventInput => ({
      eventType: CRYPTO_EVENT_TYPE.DEPOSIT,
      externalId,
      occurredAt: new Date(DAY_START_MS + hour * 3_600_000),
      rawPayload: payload,
    });
    storedRows = [
      { ...stored('tx-1', { coin: 'USDT', amount: '100' }), EventType: CRYPTO_EVENT_TYPE.DEPOSIT },
      {
        ...stored('csv-deposit-2', { coin: 'USDT', amount: '100', csvSource: true }),
        EventType: CRYPTO_EVENT_TYPE.DEPOSIT,
      },
    ];
    const index = await loadCrossSourceIndex(1);

    const hours: Record<string, number> = { 'tx-1': 1, 'tx-2': 5 };
    const { kept } = dropCrossSourceDuplicates(
      index,
      ids.map((id) => deposit(id, hours[id] ?? 0, { coin: 'USDT', amount: '100' })),
    );

    // tx-1 is kept for the UNIQUE key to absorb; nothing new is stored.
    expect(idsOf(kept).filter((id) => id !== 'tx-1')).toEqual([]);
  });
});

describe('loadCrossSourceIndex — reward payloads', () => {
  const TIME = Date.UTC(2025, 0, 5);
  const REWARDS: Array<[RewardEventType, Record<string, unknown>, string]> = [
    [
      CRYPTO_EVENT_TYPE.EARN_FLEX,
      { asset: 'BTC', rewards: '0.00000120', projectId: 'BTC001', type: 'REALTIME', time: TIME },
      `BTC001-${TIME}-BTC-0`,
    ],
    [
      CRYPTO_EVENT_TYPE.EARN_LOCKED,
      { positionId: '777', asset: 'DOT', amount: '0.0123', type: 'Locked Rewards', time: TIME },
      `777-${TIME}-DOT-0`,
    ],
    [CRYPTO_EVENT_TYPE.ETH_STAKING, { asset: 'ETH', amount: '1.5', time: TIME }, `eth-${TIME}-0`],
    [
      CRYPTO_EVENT_TYPE.STAKING_INTEREST,
      { positionId: '55', asset: 'ADA', amount: '0.9', type: 'INTEREST', time: TIME },
      `staking-${TIME}-ADA-0`,
    ],
  ];

  it("asks for a reward's payload only when its ExternalID is not already in today's format", async () => {
    storedRows = [];
    await loadCrossSourceIndex(1);

    const [sql, params] = jest.mocked(query).mock.calls.at(-1) ?? ['', []];
    expect(sql).toMatch(
      /AND \("EventType" \|\| ':' \|\| "ExternalID"\) !~ \$3\s+THEN "RawPayload" END AS "RewardPayload"/,
    );
    const [, rewardTypes, currentIdPattern] = params as [number, string[], string];
    const sentWithPayload = (eventType: string, externalId: string) =>
      rewardTypes.includes(eventType) && !new RegExp(currentIdPattern).test(`${eventType}:${externalId}`);
    REWARDS.forEach(([eventType, record, legacyId]) => {
      expect(sentWithPayload(eventType, rewardExternalId(eventType, record))).toBe(false);
      expect(sentWithPayload(eventType, legacyId)).toBe(true);
    });
    // An id in another reward type's format is not taken for this type's.
    const flexId = rewardExternalId(CRYPTO_EVENT_TYPE.EARN_FLEX, REWARDS[0]?.[1] ?? {});
    expect(sentWithPayload(CRYPTO_EVENT_TYPE.EARN_LOCKED, flexId)).toBe(true);
  });
});

describe('dropCrossSourceDuplicates — dust conversions a second or two apart', () => {
  const DUST_SECOND_MS = Date.UTC(2025, 8, 24, 6, 14, 1);
  const CSV_DUST = { detail: { fromAsset: 'HEMI', amount: '41.81410321', targetAsset: 'BNB' }, csvSource: true };
  const API_DUST = { detail: { fromAsset: 'HEMI', amount: '41.81410321', targetAsset: 'BNB', transId: 299864575090 } };

  function storedDust(externalId: string, payload: Record<string, unknown>, ms: number): StoredRow {
    return { EventType: CRYPTO_EVENT_TYPE.DUST, ExternalID: externalId, payload, ms: String(ms), RewardPayload: null };
  }

  function dustCandidate(externalId: string, payload: Record<string, unknown>, ms: number): RawEventInput {
    return { eventType: CRYPTO_EVENT_TYPE.DUST, externalId, occurredAt: new Date(ms), rawPayload: payload };
  }

  it('drops the API copy of a conversion the CSV stored one second earlier', async () => {
    storedRows = [storedDust('csv-dust-1', CSV_DUST, DUST_SECOND_MS)];
    const index = await loadCrossSourceIndex(1);

    const { kept } = dropCrossSourceDuplicates(index, [dustCandidate('299864575090', API_DUST, DUST_SECOND_MS + 1000)]);

    expect(kept).toHaveLength(0);
  });

  it.each([
    [5, 0],
    [-1, 0],
    [6, 1],
  ])('an API conversion %i s from the stored CSV row is kept %i time(s)', async (offsetSeconds, keptCount) => {
    storedRows = [storedDust('csv-dust-1', CSV_DUST, DUST_SECOND_MS)];
    const index = await loadCrossSourceIndex(1);

    const candidateAt = DUST_SECOND_MS + offsetSeconds * 1000;
    const { kept } = dropCrossSourceDuplicates(index, [dustCandidate('299864575090', API_DUST, candidateAt)]);

    expect(kept).toHaveLength(keptCount);
  });

  it('drops a CSV conversion the API stored one second later', async () => {
    storedRows = [storedDust('299864575090', API_DUST, DUST_SECOND_MS + 1000)];
    const index = await loadCrossSourceIndex(1);

    const { kept } = dropCrossSourceDuplicates(index, [dustCandidate('csv-dust-1', CSV_DUST, DUST_SECOND_MS)]);

    expect(kept).toHaveLength(0);
  });
});
