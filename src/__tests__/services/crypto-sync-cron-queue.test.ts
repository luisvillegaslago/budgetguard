/**
 * Integration: the weekly cron's queue — findNextQueuedSyncJob →
 * startNextQueuedSyncJob → the continue route.
 *
 * The cron creates one job per credential and starts only the first; the round
 * that ends a job starts the next. Binance counts request weight per IP and
 * each BinanceClient keeps only its own count, so two users' syncs at once can
 * add up to a 429 or a 418 ban. What must hold:
 *  - the next job is the oldest one still waiting for its first round, and
 *    none is started while a job of the queue is under way;
 *  - a manual job (ResumeState '{}') is never taken from the queue, nor does a
 *    running manual job hold the queue up;
 *  - a job whose first round is not accepted is failed while that round is
 *    unclaimed and the next one is tried; a round claimed after all stops the
 *    queue there; a start with no time left fails nothing.
 *
 * The fake database applies each clause the statements carry, and only those,
 * to an in-memory table; `fetch` stands in for the continue route and claims
 * the round when it answers 202. These statements have NOT been run against
 * PostgreSQL: the tests check which clauses they carry, not that PostgreSQL
 * accepts them.
 */

import {
  API_ERROR,
  CRYPTO_EXCHANGE,
  CRYPTO_SYNC_HANDOFF_OUTCOME,
  CRYPTO_SYNC_INVOCATION_LIMIT_MS,
  CRYPTO_SYNC_ROUND_BUDGET_MS,
  CRYPTO_SYNC_STATUS,
} from '@/constants/finance';

interface MockJob {
  JobID: number;
  UserID: number;
  Exchange: string;
  Status: string;
  CreatedAt: number;
  ResumeState: Record<string, unknown>;
  ErrorCode?: string;
}

const mockJobs: MockJob[] = [];

// The clauses of findNextQueuedSyncJob, as the statement spells them.
const MOCK_CLAUSE = {
  PENDING: `WHERE "Status" = 'pending'`,
  WAITING: `"ResumeState" @> '{"round":1,"claimed":false,"inCronQueue":true}'::jsonb`,
  NONE_UNDER_WAY: 'AND NOT EXISTS (',
  QUEUE_MARKER: `going."ResumeState" @> '{"inCronQueue": true}'::jsonb`,
  GOING_RUNNING: `going."Status" = 'running'`,
  GOING_CLAIMED: `going."ResumeState" @> '{"claimed": true}'::jsonb`,
  OLDEST_FIRST: 'ORDER BY "CreatedAt", "JobID"',
  // failUnclaimedSyncRound's guards.
  ROUND: `("ResumeState"->>'round')::int = $2`,
  UNCLAIMED: `"ResumeState"->>'claimed' = 'false'`,
  NOT_ENDED: `"Status" IN ('pending', 'running')`,
} as const;

function mockContains(state: Record<string, unknown>, part: Record<string, unknown>): boolean {
  return Object.entries(part).every(([key, value]) => state[key] === value);
}

function mockFindNext(sql: string): unknown[] {
  const has = (clause: string) => sql.includes(clause);
  const underWay = mockJobs.some(
    (going) =>
      (!has(MOCK_CLAUSE.QUEUE_MARKER) || going.ResumeState.inCronQueue === true) &&
      ((has(MOCK_CLAUSE.GOING_RUNNING) && going.Status === 'running') ||
        (has(MOCK_CLAUSE.GOING_CLAIMED) && going.Status === 'pending' && going.ResumeState.claimed === true)),
  );
  if (has(MOCK_CLAUSE.NONE_UNDER_WAY) && underWay) return [];
  const waiting = mockJobs.filter(
    (job) =>
      (!has(MOCK_CLAUSE.PENDING) || job.Status === 'pending') &&
      (!has(MOCK_CLAUSE.WAITING) || mockContains(job.ResumeState, { round: 1, claimed: false, inCronQueue: true })),
  );
  const ordered = has(MOCK_CLAUSE.OLDEST_FIRST)
    ? [...waiting].sort((a, b) => a.CreatedAt - b.CreatedAt || a.JobID - b.JobID)
    : waiting;
  return ordered.slice(0, 1);
}

function mockFailUnclaimed(sql: string, params: unknown[]): unknown[] {
  const [jobId, round, errorCode] = params as [number, number, string];
  const has = (clause: string) => sql.includes(clause);
  const job = mockJobs.find(
    (candidate) =>
      candidate.JobID === jobId &&
      (!has(MOCK_CLAUSE.ROUND) || candidate.ResumeState.round === round) &&
      (!has(MOCK_CLAUSE.UNCLAIMED) || candidate.ResumeState.claimed === false) &&
      (!has(MOCK_CLAUSE.NOT_ENDED) || ['pending', 'running'].includes(candidate.Status)),
  );
  if (!job) return [];
  Object.assign(job, { Status: 'failed', ErrorCode: errorCode });
  job.ResumeState = { round: job.ResumeState.round ?? 1, claimed: true };
  return [{ JobID: job.JobID }];
}

jest.mock('@/services/database/connection', () => ({
  query: jest.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('SELECT "JobID", "UserID", "Exchange"')) return mockFindNext(sql);
    if (sql.includes(`SET "Status" = 'failed'`) && sql.includes(`"ResumeState"->>'claimed' = 'false'`)) {
      return mockFailUnclaimed(sql, params);
    }
    throw new Error(`unexpected SQL in test: ${sql.slice(0, 80)}`);
  }),
}));

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => {
    throw new Error('the queue runs without a session');
  }),
  AuthError: class AuthError extends Error {},
}));

import { findNextQueuedSyncJob } from '@/services/database/CryptoSyncJobsRepository';
import { startNextQueuedSyncJob } from '@/services/exchanges/binance/syncRounds';
import type { SyncBudget } from '@/services/exchanges/shared/syncBudget';

const APP_ORIGIN = 'https://budgetguard.test';
const savedEnv = { ...process.env };
const savedFetch = global.fetch;
const mockFetch = jest.fn();

function queued(jobId: number, overrides: Partial<MockJob> = {}): MockJob {
  return {
    JobID: jobId,
    UserID: jobId * 10,
    Exchange: CRYPTO_EXCHANGE.BINANCE,
    Status: CRYPTO_SYNC_STATUS.PENDING,
    CreatedAt: jobId,
    ResumeState: { round: 1, claimed: false, inCronQueue: true },
    ...overrides,
  };
}

function statusOf(jobId: number): string | undefined {
  return mockJobs.find((job) => job.JobID === jobId)?.Status;
}

function jobIdOf(url: string): number {
  return Number(/\/sync\/(\d+)\/continue$/.exec(url)?.[1]);
}

/** The continue route answering 202: it claims the job's first round. */
async function routeClaims(url: string): Promise<{ status: number }> {
  const job = mockJobs.find((candidate) => candidate.JobID === jobIdOf(url));
  if (job) job.ResumeState = { ...job.ResumeState, claimed: true };
  return { status: 202 };
}

function calledJobs(): number[] {
  return mockFetch.mock.calls.map(([url]) => jobIdOf(String(url)));
}

beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterAll(() => {
  process.env = savedEnv;
  global.fetch = savedFetch;
});

beforeEach(() => {
  mockJobs.length = 0;
  process.env.CRON_SECRET = 'test-cron-secret';
  process.env.NEXTAUTH_URL = APP_ORIGIN;
  mockFetch.mockReset();
  mockFetch.mockImplementation(routeClaims);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('findNextQueuedSyncJob', () => {
  it('returns the oldest job still waiting for its first round', async () => {
    mockJobs.push(queued(3, { CreatedAt: 2 }), queued(2, { CreatedAt: 1 }), queued(1, { CreatedAt: 2 }));

    await expect(findNextQueuedSyncJob()).resolves.toEqual({
      jobId: 2,
      userId: 20,
      exchange: CRYPTO_EXCHANGE.BINANCE,
    });
  });

  it.each([
    [
      'running',
      queued(1, { Status: CRYPTO_SYNC_STATUS.RUNNING, ResumeState: { round: 2, claimed: false, inCronQueue: true } }),
    ],
    [
      'pending with its first round claimed',
      queued(1, { ResumeState: { round: 1, claimed: true, inCronQueue: true } }),
    ],
  ])('returns none while a job of the queue is %s', async (_case, going) => {
    mockJobs.push(going, queued(2));

    await expect(findNextQueuedSyncJob()).resolves.toBeNull();
  });

  it('never takes a manual job, and a running manual job does not hold the queue up', async () => {
    mockJobs.push(
      queued(1, { Status: CRYPTO_SYNC_STATUS.RUNNING, ResumeState: {} }),
      queued(2, { ResumeState: {} }),
      queued(3, { Status: CRYPTO_SYNC_STATUS.CANCELLED, ResumeState: { round: 1, claimed: true } }),
      queued(4),
    );

    await expect(findNextQueuedSyncJob()).resolves.toMatchObject({ jobId: 4 });
  });
});

describe('startNextQueuedSyncJob', () => {
  it('starts only the oldest waiting job when its first round is accepted', async () => {
    mockJobs.push(queued(1), queued(2));

    const starts = await startNextQueuedSyncJob();

    expect(starts).toEqual([
      { jobId: 1, userId: 10, exchange: CRYPTO_EXCHANGE.BINANCE, outcome: CRYPTO_SYNC_HANDOFF_OUTCOME.ACCEPTED },
    ]);
    expect(calledJobs()).toEqual([1]);
    expect(mockFetch.mock.calls[0]?.[1]).toMatchObject({ body: JSON.stringify({ round: 1 }) });
    expect(statusOf(2)).toBe(CRYPTO_SYNC_STATUS.PENDING);
  });

  it('fails a job whose first round was not accepted and starts the next', async () => {
    mockJobs.push(queued(1), queued(2), queued(3));
    mockFetch.mockResolvedValueOnce({ status: 500 }).mockResolvedValueOnce({ status: 500 });

    const starts = await startNextQueuedSyncJob();

    expect(starts.map(({ jobId, outcome }) => ({ jobId, outcome }))).toEqual([
      { jobId: 1, outcome: CRYPTO_SYNC_HANDOFF_OUTCOME.FAILED },
      { jobId: 2, outcome: CRYPTO_SYNC_HANDOFF_OUTCOME.ACCEPTED },
    ]);
    expect(statusOf(1)).toBe(CRYPTO_SYNC_STATUS.FAILED);
    expect(mockJobs.find((job) => job.JobID === 1)).toMatchObject({ ErrorCode: API_ERROR.CRYPTO.SYNC_HANDOFF_FAILED });
    expect(statusOf(3)).toBe(CRYPTO_SYNC_STATUS.PENDING);
  });

  it('stops at a first round a timed-out call claimed after all, and leaves it running', async () => {
    mockJobs.push(queued(1), queued(2));
    // The first call reaches the route, which claims the round, but its answer
    // is lost; the retry is refused because the round is taken.
    mockFetch
      .mockImplementationOnce(async (url: string) => {
        await routeClaims(url);
        throw new Error('socket hang up');
      })
      .mockResolvedValueOnce({ status: 409 });

    const starts = await startNextQueuedSyncJob();

    expect(starts.map(({ jobId, outcome }) => ({ jobId, outcome }))).toEqual([
      { jobId: 1, outcome: CRYPTO_SYNC_HANDOFF_OUTCOME.REFUSED },
    ]);
    expect(statusOf(1)).toBe(CRYPTO_SYNC_STATUS.PENDING);
    expect(calledJobs()).toEqual([1, 1]);
    expect(statusOf(2)).toBe(CRYPTO_SYNC_STATUS.PENDING);
  });

  it('tries nothing, and fails nothing, when no call fits in what is left of the invocation', async () => {
    mockJobs.push(queued(1), queued(2));
    const start = Date.now();
    // 6 s left: under the 5 s reserve plus the shortest call worth making.
    const almostOver: SyncBudget = {
      deadline: start + CRYPTO_SYNC_ROUND_BUDGET_MS,
      now: () => start + CRYPTO_SYNC_INVOCATION_LIMIT_MS - 6_000,
    };

    const starts = await startNextQueuedSyncJob(almostOver);

    expect(starts).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
    expect([statusOf(1), statusOf(2)]).toEqual([CRYPTO_SYNC_STATUS.PENDING, CRYPTO_SYNC_STATUS.PENDING]);
  });
});
