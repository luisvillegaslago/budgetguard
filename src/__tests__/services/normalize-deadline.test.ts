/**
 * Integration: normalizeForUser under a sync round's time budget.
 *
 * A sync job normalises after its last fetch, inside the same function
 * invocation, and pricing an event can take a while (price lookups). With the
 * round's budget, the run starts no event once it is spent, lets the one being
 * priced finish, and stamps only the events it processed: the rest keep
 * NormalizedAt NULL and the next round picks them up. Without a budget (the
 * manual normalise route, the CSV upload) it drains the queue as before.
 *
 * The repository is an in-memory queue with the SQL's semantics: unstamped
 * events in order, removed once stamped. Prices are stubbed; the clock is
 * injected and moved past the deadline from inside a price lookup, the way a
 * slow lookup would.
 */

import { CRYPTO_EVENT_TYPE, CRYPTO_PRICE_SOURCE, CRYPTO_SYNC_CUTOFF_GRACE_MS } from '@/constants/finance';

jest.mock('binance', () => ({ MainClient: class {} }));

interface QueuedRaw {
  rawEventId: string;
  eventType: string;
  occurredAt: string;
  rawPayload: Record<string, unknown>;
}

let queue: QueuedRaw[] = [];
let inserted: TaxableEventInput[] = [];
const stamped: string[][] = [];

jest.mock('@/services/database/TaxableEventsRepository', () => ({
  listUnnormalisedRawEventsForUser: jest.fn(async (_userId: number, limit: number) => queue.slice(0, limit)),
  markRawEventsNormalized: jest.fn(async (ids: string[]) => {
    stamped.push(ids);
    queue = queue.filter((raw) => !ids.includes(raw.rawEventId));
  }),
  bulkInsertTaxableEventsForUser: jest.fn(async (_userId: number, legs: TaxableEventInput[]) => {
    inserted.push(...legs);
    return legs.length;
  }),
}));

const mockClock = {
  now: 0,
  lookups: 0,
  passDeadlineAtLookup: null as number | null,
  // The lookup that passes the deadline and then never answers.
  hangAtLookup: null as number | null,
};
const DEADLINE = 1_000;

jest.mock('@/services/exchanges/binance/PriceService', () => ({
  ...jest.requireActual<typeof import('@/services/exchanges/binance/PriceService')>(
    '@/services/exchanges/binance/PriceService',
  ),
  getPriceEurCents: jest.fn(async (asset: string, at: Date) => {
    mockClock.lookups += 1;
    // A lookup that takes the round past its deadline while it is running.
    if (mockClock.lookups === mockClock.passDeadlineAtLookup) mockClock.now = DEADLINE;
    if (mockClock.lookups === mockClock.hangAtLookup) {
      mockClock.now = DEADLINE;
      await new Promise(() => undefined);
    }
    return {
      asset,
      dateUtc: at.toISOString().slice(0, 10),
      eurPriceCents: 4_000_000,
      eurPriceMicroCents: 4_000_000_000_000,
      source: CRYPTO_PRICE_SOURCE.BINANCE_EUR,
    };
  }),
}));

import { listUnnormalisedRawEventsForUser, type TaxableEventInput } from '@/services/database/TaxableEventsRepository';
import { normalizeForUser } from '@/services/exchanges/binance/NormalizationService';
import type { SyncBudget } from '@/services/exchanges/shared/syncBudget';

// listUnnormalisedRawEventsForUser's page size in NormalizationService.
const BATCH_SIZE = 200;

const USER_ID = 1;

function reward(id: number): QueuedRaw {
  const occurredAt = new Date(Date.UTC(2025, 5, id));
  return {
    rawEventId: String(id),
    eventType: CRYPTO_EVENT_TYPE.EARN_FLEX,
    occurredAt: occurredAt.toISOString(),
    rawPayload: { asset: 'BTC', rewards: '0.001', projectId: 'BTC001', type: 'REALTIME', time: occurredAt.getTime() },
  };
}

function budget(): SyncBudget {
  return { deadline: DEADLINE, now: () => mockClock.now };
}

beforeEach(() => {
  queue = [1, 2, 3, 4, 5].map(reward);
  inserted = [];
  stamped.length = 0;
  mockClock.now = 0;
  mockClock.lookups = 0;
  mockClock.passDeadlineAtLookup = null;
  mockClock.hangAtLookup = null;
  jest.mocked(listUnnormalisedRawEventsForUser).mockClear();
});

describe('normalizeForUser with a round budget', () => {
  it('stops between events once the budget is spent and leaves the rest unstamped for the next round', async () => {
    // The second event's price lookup runs past the deadline.
    mockClock.passDeadlineAtLookup = 2;
    const progress: Array<[number, number]> = [];

    const result = await normalizeForUser(
      USER_ID,
      (processed, count) => {
        progress.push([processed, count]);
      },
      budget(),
    );

    expect(result).toMatchObject({ processed: 2, inserted: 2, stoppedAtDeadline: true });
    // The event being priced when the deadline passed was finished and stored.
    expect(inserted.map((leg) => leg.rawEventId)).toEqual(['1', '2']);
    expect(stamped).toEqual([['1', '2']]);
    expect(queue.map((raw) => raw.rawEventId)).toEqual(['3', '4', '5']);
    expect(progress).toEqual([[2, 2]]);
  });

  it('the next round, with a fresh budget, normalises what the first one left', async () => {
    mockClock.passDeadlineAtLookup = 2;
    await normalizeForUser(USER_ID, undefined, budget());
    mockClock.now = 0;

    const result = await normalizeForUser(USER_ID, undefined, budget());

    expect(result).toMatchObject({ processed: 3, inserted: 3, stoppedAtDeadline: false });
    expect(queue).toEqual([]);
    expect(inserted.map((leg) => leg.rawEventId)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('starts nothing when the budget is already spent', async () => {
    mockClock.now = DEADLINE;

    const result = await normalizeForUser(USER_ID, undefined, budget());

    expect(result).toMatchObject({ processed: 0, stoppedAtDeadline: true });
    expect(stamped).toEqual([]);
    expect(queue).toHaveLength(5);
  });

  it('finishes, rather than stops at the deadline, when the batch that ran past it emptied the queue', async () => {
    // Exactly one full batch, and the deadline passes on its last event: the
    // run has to look again to know the queue is empty.
    queue = Array.from({ length: BATCH_SIZE }, (_, i) => reward(i + 1));
    mockClock.passDeadlineAtLookup = BATCH_SIZE;

    const result = await normalizeForUser(USER_ID, undefined, budget());

    expect(result).toMatchObject({ processed: BATCH_SIZE, stoppedAtDeadline: false });
    expect(queue).toEqual([]);
    expect(listUnnormalisedRawEventsForUser).toHaveBeenCalledTimes(2);
  });

  it('abandons an event whose price lookup is still running at the cutoff, and leaves it queued', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    try {
      // The second event's lookup passes the deadline and never answers.
      mockClock.hangAtLookup = 2;
      const outcome: { result: Awaited<ReturnType<typeof normalizeForUser>> | null } = { result: null };
      normalizeForUser(USER_ID, undefined, budget()).then((result) => {
        outcome.result = result;
      });

      await jest.advanceTimersByTimeAsync(CRYPTO_SYNC_CUTOFF_GRACE_MS - 1);
      expect(outcome.result).toBeNull();
      await jest.advanceTimersByTimeAsync(1);

      expect(outcome.result).toMatchObject({ processed: 1, inserted: 1, stoppedAtDeadline: true });
      expect(stamped).toEqual([['1']]);
      expect(queue.map((raw) => raw.rawEventId)).toEqual(['2', '3', '4', '5']);
    } finally {
      jest.useRealTimers();
    }
  });

  it('without a budget drains the queue, as the manual normalise route expects', async () => {
    mockClock.passDeadlineAtLookup = 2;

    const result = await normalizeForUser(USER_ID);

    expect(result).toMatchObject({ processed: 5, inserted: 5, stoppedAtDeadline: false });
    expect(queue).toEqual([]);
  });
});
