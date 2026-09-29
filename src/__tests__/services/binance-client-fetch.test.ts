/**
 * BinanceClient fetch helpers against a stubbed MainClient that follows the
 * documented Binance semantics.
 *
 * myTrades: without `fromId` it returns the most recent `limit` fills; with
 * `fromId` it returns fills with id >= fromId in ascending order. Ids are the
 * symbol's global trade sequence, so one user's fills are far apart.
 *
 * Reward endpoints return no id of their own and the same reward can come
 * back at a different position whenever the requested window changes.
 */

import { CRYPTO_SYNC_TASK_FAILURE } from '@/constants/finance';

type Row = Record<string, unknown>;

const mockTrades = new Map<string, Row[]>();
const mockTradeCalls: Array<{ symbol: string; fromId?: number }> = [];
let mockRewardRows: Row[] = [];

function mockTradePage(params: { symbol: string; fromId?: number; limit?: number }): Row[] {
  mockTradeCalls.push({ symbol: params.symbol, fromId: params.fromId });
  const fills = mockTrades.get(params.symbol);
  if (!fills) {
    throw { code: -1121, msg: 'Invalid symbol.' };
  }
  const limit = params.limit ?? 500;
  if (params.fromId == null) return fills.slice(-limit);
  const fromId = params.fromId;
  // Binary search: first fill with id >= fromId (fills are sorted by id).
  let lo = 0;
  let hi = fills.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (Number(fills[mid]?.id) < fromId) lo = mid + 1;
    else hi = mid;
  }
  return fills.slice(lo, lo + limit);
}

jest.mock('binance', () => ({
  MainClient: jest.fn().mockImplementation(() => ({
    getAccountTradeList: async (params: { symbol: string; fromId?: number; limit?: number }) => mockTradePage(params),
    getFlexibleRewardsHistory: async () => ({ rows: mockRewardRows, total: mockRewardRows.length }),
    getLockedRewardsHistory: async () => ({ rows: mockRewardRows, total: mockRewardRows.length }),
    getEthStakingHistory: async () => ({ rows: mockRewardRows, total: mockRewardRows.length }),
    getStakingHistory: async () => mockRewardRows,
  })),
}));

import {
  BinanceClient,
  BinanceClientError,
  eventsFetchedBeforeFailure,
} from '@/services/exchanges/binance/BinanceClient';

// Far apart on purpose: another user's trades fill the gaps in the sequence.
const ID_STRIDE = 1_237;
const FIRST_ID = 9_000_000;
const T0 = Date.UTC(2025, 0, 1);

function makeFills(count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    symbol: 'BTCUSDT',
    id: FIRST_ID + i * ID_STRIDE,
    orderId: 100 + i,
    qty: '0.001',
    quoteQty: '95',
    commission: '0',
    commissionAsset: 'BNB',
    isBuyer: i % 2 === 0,
    time: T0 + i * 60_000,
  }));
}

function newClient(): BinanceClient {
  return new BinanceClient({ apiKey: 'key', apiSecret: 'secret' });
}

const EVERYTHING_TO = Date.UTC(2030, 0, 1);

beforeEach(() => {
  mockTrades.clear();
  mockTradeCalls.length = 0;
  mockRewardRows = [];
});

describe('BinanceClient.fetchSpotTrades', () => {
  it('returns every fill exactly once when the history is longer than one page', async () => {
    mockTrades.set('BTCUSDT', makeFills(1_500));

    const events = await newClient().fetchSpotTrades('BTCUSDT', 0, EVERYTHING_TO);

    const ids = events.map((event) => event.externalId);
    expect(events).toHaveLength(1_500);
    expect(new Set(ids).size).toBe(1_500);
    expect(ids[0]).toBe(`BTCUSDT-${FIRST_ID}`);
    // One call for the recent page, then two forward pages up to it.
    expect(mockTradeCalls.length).toBeLessThanOrEqual(3);
  });

  it('makes a single call for a symbol whose whole history fits in one page', async () => {
    mockTrades.set('BTCUSDT', makeFills(300));

    const events = await newClient().fetchSpotTrades('BTCUSDT', 0, EVERYTHING_TO);

    expect(events).toHaveLength(300);
    expect(mockTradeCalls).toHaveLength(1);
  });

  it('does not walk older pages when the recent page already reaches before the scope', async () => {
    const fills = makeFills(1_500);
    mockTrades.set('BTCUSDT', fills);
    const scopeFrom = Number(fills[1_200]?.time);

    const events = await newClient().fetchSpotTrades('BTCUSDT', scopeFrom, EVERYTHING_TO);

    expect(events).toHaveLength(300);
    expect(mockTradeCalls).toHaveLength(1);
  });

  it('keeps only the fills inside the scope when it has to walk forward', async () => {
    const fills = makeFills(2_500);
    mockTrades.set('BTCUSDT', fills);
    const scopeFrom = Number(fills[100]?.time);
    const scopeTo = Number(fills[199]?.time);

    const events = await newClient().fetchSpotTrades('BTCUSDT', scopeFrom, scopeTo);

    expect(events.map((event) => event.externalId)).toEqual(
      fills.slice(100, 200).map((fill) => `BTCUSDT-${String(fill.id)}`),
    );
  });

  it('fails instead of returning a truncated history', async () => {
    // More fills than the forward walk is allowed to page through.
    mockTrades.set('BTCUSDT', makeFills(101_500));

    const promise = newClient().fetchSpotTrades('BTCUSDT', 0, EVERYTHING_TO);

    await expect(promise).rejects.toBeInstanceOf(BinanceClientError);
    await expect(promise).rejects.toMatchObject({ code: CRYPTO_SYNC_TASK_FAILURE.HISTORY_TRUNCATED });
  });

  it('hands over the fills it walked when it runs out of pages, from the first fill and without the recent page', async () => {
    const fills = makeFills(101_500);
    mockTrades.set('BTCUSDT', fills);

    const error = await newClient()
      .fetchSpotTrades('BTCUSDT', 0, EVERYTHING_TO)
      .catch((thrown: unknown) => thrown);

    // 100 pages of 1,000 from fromId=0. The recent page (the last 1,000 fills)
    // is left out: storing it would make the next run resume past the 500
    // fills in between.
    expect(eventsFetchedBeforeFailure(error).map((event) => event.externalId)).toEqual(
      fills.slice(0, 100_000).map((fill) => `BTCUSDT-${String(fill.id)}`),
    );
  });

  it('rejects a page with a fill without an id as a malformed answer, not as a history too long to walk', async () => {
    const fills = makeFills(1_000);
    fills[500] = { ...fills[500], id: undefined };
    mockTrades.set('BTCUSDT', fills);

    const promise = newClient().fetchSpotTrades('BTCUSDT', 0, EVERYTHING_TO);

    await expect(promise).rejects.toMatchObject({ code: CRYPTO_SYNC_TASK_FAILURE.TRADE_WITHOUT_ID });
    expect(eventsFetchedBeforeFailure(await promise.catch((thrown: unknown) => thrown))).toEqual([]);
  });

  it('treats an invalid symbol as an empty history', async () => {
    const events = await newClient().fetchSpotTrades('NOPEUSDT', 0, EVERYTHING_TO);

    expect(events).toEqual([]);
  });
});

describe('BinanceClient.fetchSpotTrades after the last stored fill', () => {
  function fillIds(fills: Row[]): string[] {
    return fills.map((fill) => `BTCUSDT-${String(fill.id)}`);
  }

  it('resumes after the stored fill instead of walking a busy pair from its first fill', async () => {
    // Walking from fromId=0 would need 119 pages to reach the recent fills,
    // past the 100-page cap, and fail with history_truncated.
    const fills = makeFills(120_000);
    mockTrades.set('BTCUSDT', fills);
    const lastStoredId = Number(fills[118_500]?.id);
    const scopeFrom = Number(fills[118_000]?.time);

    const events = await newClient().fetchSpotTrades('BTCUSDT', scopeFrom, EVERYTHING_TO, lastStoredId);

    expect(events.map((event) => event.externalId)).toEqual(fillIds(fills.slice(118_501)));
    expect(mockTradeCalls).toEqual([
      { symbol: 'BTCUSDT', fromId: lastStoredId + 1 },
      { symbol: 'BTCUSDT', fromId: Number(fills[119_500]?.id) + 1 },
    ]);
  });

  it('keeps the fills between the stored one and the scope start', async () => {
    const fills = makeFills(2_000);
    mockTrades.set('BTCUSDT', fills);
    const lastStoredId = Number(fills[99]?.id);
    const scopeFrom = Number(fills[1_500]?.time);

    const events = await newClient().fetchSpotTrades('BTCUSDT', scopeFrom, EVERYTHING_TO, lastStoredId);

    expect(events.map((event) => event.externalId)).toEqual(fillIds(fills.slice(100)));
  });

  it('stops at the scope end', async () => {
    const fills = makeFills(5_000);
    mockTrades.set('BTCUSDT', fills);
    const lastStoredId = Number(fills[99]?.id);
    const scopeFrom = Number(fills[1_000]?.time);
    const scopeTo = Number(fills[1_599]?.time);

    const events = await newClient().fetchSpotTrades('BTCUSDT', scopeFrom, scopeTo, lastStoredId);

    expect(events.map((event) => event.externalId)).toEqual(fillIds(fills.slice(100, 1_600)));
    // The second page crosses scopeTo; nothing after it is requested.
    expect(mockTradeCalls).toHaveLength(2);
    expect(mockTradeCalls.every((call) => call.fromId != null && call.fromId > lastStoredId)).toBe(true);
  });

  it('hands over every fill after the stored one when it runs out of pages again', async () => {
    const fills = makeFills(102_500);
    mockTrades.set('BTCUSDT', fills);
    const lastStoredId = Number(fills[999]?.id);

    const promise = newClient().fetchSpotTrades('BTCUSDT', 0, EVERYTHING_TO, lastStoredId);

    await expect(promise).rejects.toMatchObject({ code: CRYPTO_SYNC_TASK_FAILURE.HISTORY_TRUNCATED });
    const walked = eventsFetchedBeforeFailure(await promise.catch((thrown: unknown) => thrown));
    expect(walked.map((event) => event.externalId)).toEqual(fillIds(fills.slice(1_000, 101_000)));
  });

  it('costs one call for a pair with nothing new since the stored fill', async () => {
    const fills = makeFills(300);
    mockTrades.set('BTCUSDT', fills);
    const lastStoredId = Number(fills[299]?.id);

    const events = await newClient().fetchSpotTrades('BTCUSDT', 0, EVERYTHING_TO, lastStoredId);

    expect(events).toEqual([]);
    expect(mockTradeCalls).toEqual([{ symbol: 'BTCUSDT', fromId: lastStoredId + 1 }]);
  });

  it('treats a stored pair that Binance no longer lists as having nothing new', async () => {
    const events = await newClient().fetchSpotTrades('NOPEUSDT', 0, EVERYTHING_TO, FIRST_ID);

    expect(events).toEqual([]);
  });
});

describe('Reward ExternalIDs do not depend on the position in the page', () => {
  const flexA = { asset: 'BTC', rewards: '0.00000120', projectId: 'BTC001', type: 'REALTIME', time: T0 };
  const flexB = { asset: 'BTC', rewards: '0.00000045', projectId: 'BTC001', type: 'BONUS', time: T0 };
  const locked = (positionId: string): Row => ({
    positionId,
    asset: 'DOT',
    amount: '0.0123',
    lockPeriod: '60',
    type: 'Locked Rewards',
    time: T0,
  });
  const eth = (amount: string, distributeAmount: string): Row => ({
    asset: 'ETH',
    amount,
    distributeAmount,
    status: 'SUCCESS',
    conversionRatio: '1',
    time: T0,
  });
  const lockedA = locked('777');
  const lockedB = locked('778');
  const ethA = eth('1.5', '1.49');
  const ethB = eth('0.5', '0.49');
  const interestA = { positionId: '55', asset: 'ADA', amount: '0.9', type: 'INTEREST', status: 'SUCCESS', time: T0 };
  const interestB = { positionId: '56', asset: 'ADA', amount: '0.9', type: 'INTEREST', status: 'SUCCESS', time: T0 };
  const filler = (i: number): Row => ({
    asset: 'SOL',
    rewards: String(i),
    amount: String(i),
    distributeAmount: String(i),
    projectId: 'SOL001',
    positionId: String(9_000 + i),
    type: 'REALTIME',
    time: T0 - (i + 1) * 86_400_000,
  });

  const cases: Array<[string, Row, Row, (client: BinanceClient) => Promise<Array<{ externalId: string }>>]> = [
    ['earn_flex', flexA, flexB, (client) => client.fetchFlexibleEarnRewards(0, EVERYTHING_TO)],
    ['earn_locked', lockedA, lockedB, (client) => client.fetchLockedEarnRewards(0, EVERYTHING_TO)],
    ['eth_staking', ethA, ethB, (client) => client.fetchEthStakingRewards(0, EVERYTHING_TO)],
    ['staking_interest', interestA, interestB, (client) => client.fetchStakingInterest(0, EVERYTHING_TO)],
  ];

  it.each(cases)('%s: the same reward keeps its id when the window shifts', async (_label, reward, sibling, fetch) => {
    const client = newClient();

    mockRewardRows = [reward, sibling];
    const first = await fetch(client);
    mockRewardRows = [filler(1), filler(2), filler(3), sibling, reward];
    const second = await fetch(client);

    expect(second[4]?.externalId).toBe(first[0]?.externalId);
    expect(second[3]?.externalId).toBe(first[1]?.externalId);
    // Two different rewards of the same instant never share an id.
    expect(first[0]?.externalId).not.toBe(first[1]?.externalId);
  });
});
