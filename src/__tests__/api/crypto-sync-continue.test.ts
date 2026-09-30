/**
 * Integration: POST /api/crypto/sync/[jobId]/continue → claimSyncRound.
 *
 * The route runs the next round of a sync job that ran out of time, and the
 * cron's first round of each job. What must hold:
 *  - only a caller with CRON_SECRET gets in, compared in constant time;
 *  - a round is started once: a duplicate call, a stale round, or a job that
 *    is no longer running is a 409 that starts nothing;
 *  - the round runs in after(), as the job's owner, from where the last one
 *    stopped.
 *
 * The claim is one UPDATE. The fake database applies to an in-memory table
 * each guard clause the statement contains, and only those, so dropping a
 * guard from the SQL makes these tests fail. The statement itself was prepared
 * read-only against local PostgreSQL 17 on 2026-09-29.
 */

import { API_ERROR, CRYPTO_EXCHANGE, CRYPTO_SYNC_MODE, CRYPTO_SYNC_STATUS } from '@/constants/finance';

interface MockJobRow {
  JobID: number;
  UserID: number;
  Exchange: string;
  Mode: string;
  Status: string;
  ScopeFrom: string;
  ScopeTo: string;
  Progress: Record<string, unknown>;
  ResumeState: Record<string, unknown>;
  ErrorCode?: string;
  ErrorMessage?: string;
}

const mockTable: MockJobRow[] = [];

// The claim's guard clauses, as the statement spells them.
const MOCK_CLAUSE = {
  ROUND: `("ResumeState"->>'round')::int = $2`,
  UNCLAIMED: `"ResumeState"->>'claimed' = 'false'`,
  RUNNING: `"Status" = 'running'`,
  FIRST_ROUND_PENDING: `("Status" = 'pending' AND $2 = 1)`,
} as const;

function mockClaim(sql: string, params: unknown[]): unknown[] {
  const [jobId, round] = params as [number, number];
  const has = (clause: string) => sql.includes(clause);
  const statusGuarded = has(MOCK_CLAUSE.RUNNING) || has(MOCK_CLAUSE.FIRST_ROUND_PENDING);
  const row = mockTable.find(
    (job) =>
      job.JobID === jobId &&
      (!has(MOCK_CLAUSE.ROUND) || Number(job.ResumeState.round) === round) &&
      (!has(MOCK_CLAUSE.UNCLAIMED) || job.ResumeState.claimed === false) &&
      (!statusGuarded ||
        (has(MOCK_CLAUSE.RUNNING) && job.Status === 'running') ||
        (has(MOCK_CLAUSE.FIRST_ROUND_PENDING) && job.Status === 'pending' && round === 1)),
  );
  if (!row) return [];
  row.ResumeState = { ...row.ResumeState, claimed: true };
  return [{ ...row, Round: Number(row.ResumeState.round ?? 1) }];
}

/** markJobFailed: `$1` the code, `$2` the message, `$3` the job, for a job not yet ended. */
function mockFail(sql: string, params: unknown[]): unknown[] {
  const [errorCode, errorMessage, jobId] = params as [string, string, number];
  const endedJobsKept = sql.includes(`"Status" IN ('pending', 'running')`);
  const row = mockTable.find(
    (job) => job.JobID === jobId && (!endedJobsKept || ['pending', 'running'].includes(job.Status)),
  );
  if (row) Object.assign(row, { Status: 'failed', ErrorCode: errorCode, ErrorMessage: errorMessage });
  return [];
}

jest.mock('@/services/database/connection', () => ({
  query: jest.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('jsonb_set("ResumeState"')) return mockClaim(sql, params);
    if (sql.includes(`SET "Status" = 'failed'`)) return mockFail(sql, params);
    throw new Error(`unexpected SQL in test: ${sql.slice(0, 80)}`);
  }),
}));

jest.mock('@/services/exchanges/binance/BinanceSyncService', () => ({
  runSync: jest.fn(async () => undefined),
}));

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => {
    throw new Error('the continue route must not need a session');
  }),
  AuthError: class AuthError extends Error {},
}));

jest.mock('node:crypto', () => {
  const actual = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return { ...actual, timingSafeEqual: jest.fn(actual.timingSafeEqual) };
});

// after() callbacks are collected, then run by the test.
const mockAfter: Array<() => Promise<void>> = [];

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
  after: (fn: () => Promise<void>) => {
    mockAfter.push(fn);
  },
}));

import { timingSafeEqual } from 'node:crypto';
import { POST } from '@/app/api/crypto/sync/[jobId]/continue/route';
import { runSync } from '@/services/exchanges/binance/BinanceSyncService';

const SECRET = 'test-cron-secret';
const savedSecret = process.env.CRON_SECRET;

function request(jobId: number, body: unknown, authorization: string | null = `Bearer ${SECRET}`) {
  const headers: Record<string, string> = authorization === null ? {} : { authorization };
  return {
    url: `https://budgetguard.test/api/crypto/sync/${jobId}/continue`,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  };
}

async function post(jobId: number, body: unknown, authorization?: string | null) {
  const response = await POST(request(jobId, body, authorization) as never, {
    params: Promise.resolve({ jobId: String(jobId) }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function runScheduledRounds(): Promise<void> {
  await Promise.all(mockAfter.splice(0).map((fn) => fn()));
}

function job(overrides: Partial<MockJobRow>): MockJobRow {
  return {
    JobID: 31,
    UserID: 7,
    Exchange: CRYPTO_EXCHANGE.BINANCE,
    Mode: CRYPTO_SYNC_MODE.FULL,
    Status: CRYPTO_SYNC_STATUS.RUNNING,
    ScopeFrom: '2017-07-14T00:00:00.000Z',
    ScopeTo: '2026-09-29T10:00:00.000Z',
    Progress: { spot_trade: { fetched: 10, totalWindows: 300, completedWindows: 300, lastWindowEnd: null } },
    ResumeState: { round: 2, claimed: false, phase: 'fetch', completedTaskKeys: ['spot_trade:BTCUSDT'] },
    ...overrides,
  };
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  mockTable.length = 0;
  mockAfter.length = 0;
  jest.mocked(runSync).mockClear();
  jest.mocked(timingSafeEqual).mockClear();
});

afterAll(() => {
  process.env.CRON_SECRET = savedSecret;
});

describe('POST /api/crypto/sync/[jobId]/continue — who may call it', () => {
  it.each([
    ['no Authorization header', null],
    ['a wrong secret of the same length', `Bearer ${'x'.repeat(SECRET.length)}`],
    ['a wrong secret of another length', 'Bearer short'],
  ])('answers 401 to %s and claims nothing', async (_case, authorization) => {
    mockTable.push(job({}));

    const response = await post(31, { round: 2 }, authorization);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe(API_ERROR.UNAUTHORIZED);
    expect(mockTable[0]?.ResumeState.claimed).toBe(false);
    expect(mockAfter).toEqual([]);
  });

  it('compares the secret in constant time', async () => {
    mockTable.push(job({}));

    await post(31, { round: 2 }, `Bearer ${'x'.repeat(SECRET.length)}`);
    await post(31, { round: 2 });

    expect(timingSafeEqual).toHaveBeenCalledTimes(2);
  });

  it('answers 503 when the server has no CRON_SECRET, whatever the caller sends', async () => {
    delete process.env.CRON_SECRET;
    mockTable.push(job({}));

    const response = await post(31, { round: 2 }, 'Bearer ');

    expect(response.status).toBe(503);
    expect(mockAfter).toEqual([]);
  });
});

describe('POST /api/crypto/sync/[jobId]/continue — one worker per round', () => {
  it('claims the announced round, answers 202 and runs it as the job owner from where the last round stopped', async () => {
    mockTable.push(job({}));

    const response = await post(31, { round: 2 });

    expect(response.status).toBe(202);
    expect(response.body.data).toEqual({ jobId: 31, round: 2 });
    expect(runSync).not.toHaveBeenCalled();
    await runScheduledRounds();
    expect(runSync).toHaveBeenCalledTimes(1);
    expect(runSync).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        jobId: 31,
        exchange: CRYPTO_EXCHANGE.BINANCE,
        mode: CRYPTO_SYNC_MODE.FULL,
        scopeFrom: new Date('2017-07-14T00:00:00.000Z'),
        scopeTo: new Date('2026-09-29T10:00:00.000Z'),
        budget: expect.objectContaining({ deadline: expect.any(Number) }),
        resume: {
          state: expect.objectContaining({ round: 2, claimed: true, completedTaskKeys: ['spot_trade:BTCUSDT'] }),
          progress: job({}).Progress,
        },
      }),
    );
  });

  it('a duplicate call for the same round is a 409 that starts nothing', async () => {
    mockTable.push(job({}));

    const first = await post(31, { round: 2 });
    const second = await post(31, { round: 2 });

    expect(first.status).toBe(202);
    expect(second.status).toBe(409);
    expect(second.body.error).toBe(API_ERROR.CRYPTO.SYNC_CONTINUATION_REFUSED);
    await runScheduledRounds();
    expect(runSync).toHaveBeenCalledTimes(1);
  });

  it('a stale round is a 409 that starts nothing', async () => {
    mockTable.push(job({ ResumeState: { round: 3, claimed: false } }));

    const response = await post(31, { round: 2 });

    expect(response.status).toBe(409);
    expect(mockTable[0]?.ResumeState.claimed).toBe(false);
    expect(mockAfter).toEqual([]);
  });

  it.each([
    CRYPTO_SYNC_STATUS.CANCELLED,
    CRYPTO_SYNC_STATUS.FAILED,
    CRYPTO_SYNC_STATUS.COMPLETED,
  ])('a %s job does not continue', async (status) => {
    mockTable.push(job({ Status: status }));

    const response = await post(31, { round: 2 });

    expect(response.status).toBe(409);
    expect(mockAfter).toEqual([]);
  });

  it('starts the first round of a job the cron queued, but never one the manual sync route runs itself', async () => {
    mockTable.push(job({ JobID: 40, Status: CRYPTO_SYNC_STATUS.PENDING, ResumeState: { round: 1, claimed: false } }));
    mockTable.push(job({ JobID: 41, Status: CRYPTO_SYNC_STATUS.PENDING, ResumeState: {} }));

    const queued = await post(40, { round: 1 });
    const manual = await post(41, { round: 1 });

    expect(queued.status).toBe(202);
    expect(manual.status).toBe(409);
    await runScheduledRounds();
    expect(runSync).toHaveBeenCalledTimes(1);
  });

  it('fails the job with its own code when the claimed round has a state it cannot read, instead of a 500 that leaves the round claimed with no worker', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockTable.push(job({ ResumeState: { round: 2, claimed: false, phase: 'rebalance' } }));

    const response = await post(31, { round: 2 });

    expect(response.status).toBe(409);
    expect(mockTable[0]).toMatchObject({
      Status: CRYPTO_SYNC_STATUS.FAILED,
      ErrorCode: API_ERROR.CRYPTO.SYNC_RESUME_STATE_INVALID,
    });
    expect(mockAfter).toEqual([]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('phase'));
    error.mockRestore();
  });

  it("keeps zod's issues in the server log and out of the job's message, which the panel shows", async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockTable.push(job({ ResumeState: { round: 2, claimed: false, phase: 'rebalance' } }));

    await post(31, { round: 2 });

    const stored = mockTable[0]?.ErrorMessage ?? '';
    expect(stored).toContain('Round 2');
    // Neither the path into the stored JSON, nor its value, nor zod's wording.
    expect(stored).not.toMatch(/phase|rebalance|invalid|expected/i);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('rebalance'));
    error.mockRestore();
  });

  it('answers 400 to a body without a round', async () => {
    mockTable.push(job({}));

    const response = await post(31, {});

    expect(response.status).toBe(400);
    expect(mockTable[0]?.ResumeState.claimed).toBe(false);
  });
});
