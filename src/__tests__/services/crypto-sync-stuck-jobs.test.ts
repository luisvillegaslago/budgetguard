/**
 * Integration: failStuckJobs tells a job that never started from one that
 * stopped reporting progress.
 *
 * Job 31 (2026-09-29) fetched 1590 of its 2063 windows before Vercel killed its
 * invocation, and was then failed with "Job never produced progress within the
 * timeout — background worker likely crashed or never started". A running job
 * that goes quiet must say that it stopped, not that it never produced
 * anything; a queued one that never started keeps its own code and message,
 * and the panel translates each code.
 *
 * The fake database reads from each UPDATE it receives which statuses it
 * targets, which parameter holds each case's minutes, the ErrorCode and
 * ErrorMessage it writes (parameter or literal) and whether it resets
 * ResumeState, and applies that to an in-memory table. The statements were
 * prepared read-only against local PostgreSQL 17 on 2026-09-29, before the
 * ResumeState reset was added to them; the statements with the reset have not
 * been run against PostgreSQL, nor has the cron-queue exemption: the fake
 * applies each of its clauses only when the statement carries it.
 *
 * A job waiting in the weekly cron's queue stays pending until the queued job
 * before it ends, which can take longer than the 5 minutes a pending job is
 * given. The panel calls failStuckJobs on every visit, so without the
 * exemption it would fail the users queued behind a long sync as never
 * started.
 */

import { API_ERROR, CRYPTO_SYNC_STATUS } from '@/constants/finance';

interface MockRow {
  JobID: number;
  Status: string;
  StartedAt: string | null;
  createdMinutesAgo: number;
  updatedMinutesAgo: number;
  ErrorCode: string | null;
  ErrorMessage: string | null;
  ResumeState: Record<string, unknown>;
}

const mockRows: MockRow[] = [];

// The SET clause that leaves an ended job only its round of ResumeState.
const MOCK_ENDED_RESUME_STATE = `"ResumeState" = jsonb_build_object('round', COALESCE(("ResumeState"->>'round')::int, 1), 'claimed', true)`;

// The clauses of the cron-queue exemption, as the statement spells them.
const MOCK_QUEUE_CLAUSE = {
  // A job still waiting for its first round: this containment, negated with the one below.
  WAITING: `AND NOT ("ResumeState" @> '{"round":1,"claimed":false,"inCronQueue":true}'::jsonb`,
  QUEUE_MARKER: `going."ResumeState" @> '{"inCronQueue": true}'::jsonb`,
  GOING_RUNNING: `going."Status" = 'running'`,
  GOING_CLAIMED: `going."ResumeState" @> '{"claimed": true}'::jsonb`,
} as const;

/** Whether the jsonb on the left contains every key and value of the right. */
function mockContains(state: Record<string, unknown>, part: Record<string, unknown>): boolean {
  return Object.entries(part).every(([key, value]) => state[key] === value);
}

/** The exemption, applied clause by clause: a waiting job while a job of the queue is under way. */
function mockExemptFromNeverStarted(sql: string, row: MockRow): boolean {
  if (!sql.includes(MOCK_QUEUE_CLAUSE.WAITING)) return false;
  if (!mockContains(row.ResumeState, { round: 1, claimed: false, inCronQueue: true })) return false;
  return mockRows.some(
    (going) =>
      (!sql.includes(MOCK_QUEUE_CLAUSE.QUEUE_MARKER) || going.ResumeState.inCronQueue === true) &&
      ((sql.includes(MOCK_QUEUE_CLAUSE.GOING_RUNNING) && going.Status === 'running') ||
        (sql.includes(MOCK_QUEUE_CLAUSE.GOING_CLAIMED) &&
          going.Status === 'pending' &&
          going.ResumeState.claimed === true)),
  );
}

/** The parameter a `$n` in the SQL names, or the literal after `column = '...'`. */
function mockValueOf(sql: string, column: string, params: unknown[]): string | null {
  const param = new RegExp(`"${column}" = \\$(\\d+)`).exec(sql);
  if (param) return String(params[Number(param[1]) - 1]);
  const literal = new RegExp(`"${column}" = '([^']*)'`).exec(sql);
  return literal ? (literal[1] ?? null) : null;
}

function mockMinutes(sql: string, column: string, params: unknown[]): number | null {
  const match = new RegExp(`"${column}" < NOW\\(\\) - \\(\\$(\\d+)::int`).exec(sql);
  return match ? Number(params[Number(match[1]) - 1]) : null;
}

function mockFailStuck(sql: string, params: unknown[]): Array<{ JobID: number }> {
  const pendingMinutes = /"Status" = 'pending'\s+AND\s+"StartedAt" IS NULL/.test(sql)
    ? mockMinutes(sql, 'CreatedAt', params)
    : null;
  const runningMinutes = /"Status" = 'running'/.test(sql) ? mockMinutes(sql, 'UpdatedAt', params) : null;
  const code = mockValueOf(sql, 'ErrorCode', params);
  const message = mockValueOf(sql, 'ErrorMessage', params);
  const stuck = mockRows.filter(
    (row) =>
      (pendingMinutes !== null &&
        row.Status === 'pending' &&
        row.StartedAt === null &&
        row.createdMinutesAgo > pendingMinutes &&
        !mockExemptFromNeverStarted(sql, row)) ||
      (runningMinutes !== null && row.Status === 'running' && row.updatedMinutesAgo > runningMinutes),
  );
  stuck.forEach((row) => {
    Object.assign(row, { Status: 'failed', ErrorCode: code, ErrorMessage: message });
    if (sql.includes(MOCK_ENDED_RESUME_STATE)) {
      row.ResumeState = { round: Number(row.ResumeState.round ?? 1), claimed: true };
    }
  });
  return stuck.map((row) => ({ JobID: row.JobID }));
}

jest.mock('@/services/database/connection', () => ({
  query: jest.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('UPDATE "CryptoSyncJobs"') && sql.includes('"FinishedAt" = CURRENT_TIMESTAMP')) {
      return mockFailStuck(sql, params);
    }
    throw new Error(`unexpected SQL in test: ${sql.slice(0, 80)}`);
  }),
}));

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 7),
  AuthError: class AuthError extends Error {},
}));

import { failStuckJobs } from '@/services/database/CryptoSyncJobsRepository';

function row(jobId: number, overrides: Partial<MockRow>): MockRow {
  return {
    JobID: jobId,
    Status: CRYPTO_SYNC_STATUS.RUNNING,
    StartedAt: '2026-09-29T10:00:00Z',
    createdMinutesAgo: 60,
    updatedMinutesAgo: 1,
    ErrorCode: null,
    ErrorMessage: null,
    ResumeState: { round: 2, claimed: true, completedTaskKeys: ['spot_trade:BTCUSDT'] },
    ...overrides,
  };
}

// A job the cron queued, still waiting for its first round.
const WAITING_IN_QUEUE: Partial<MockRow> = {
  Status: CRYPTO_SYNC_STATUS.PENDING,
  StartedAt: null,
  ResumeState: { round: 1, claimed: false, inCronQueue: true },
};

function job(jobId: number): MockRow | undefined {
  return mockRows.find((candidate) => candidate.JobID === jobId);
}

beforeEach(() => {
  mockRows.length = 0;
  mockRows.push(
    row(1, { Status: CRYPTO_SYNC_STATUS.PENDING, StartedAt: null, createdMinutesAgo: 10 }),
    row(2, { Status: CRYPTO_SYNC_STATUS.RUNNING, updatedMinutesAgo: 20 }),
    row(3, { Status: CRYPTO_SYNC_STATUS.PENDING, StartedAt: null, createdMinutesAgo: 1 }),
    row(4, { Status: CRYPTO_SYNC_STATUS.RUNNING, updatedMinutesAgo: 1 }),
  );
});

describe('failStuckJobs', () => {
  it('fails a queued job that never started with its own code and message', async () => {
    await failStuckJobs();

    expect(job(1)).toMatchObject({ Status: CRYPTO_SYNC_STATUS.FAILED, ErrorCode: API_ERROR.CRYPTO.SYNC_NEVER_STARTED });
    expect(job(1)?.ErrorMessage).toMatch(/queued for 5 minutes without starting/);
  });

  it('fails a running job that went quiet as stalled, without claiming it never produced progress', async () => {
    await failStuckJobs();

    expect(job(2)).toMatchObject({ Status: CRYPTO_SYNC_STATUS.FAILED, ErrorCode: API_ERROR.CRYPTO.SYNC_STALLED });
    expect(job(2)?.ErrorMessage).toMatch(/stopped reporting progress for 15 minutes/);
    expect(job(2)?.ErrorMessage).not.toMatch(/never/i);
  });

  it('leaves recent jobs alone and counts the ones it failed', async () => {
    const failed = await failStuckJobs();

    expect(failed).toBe(2);
    expect(job(3)?.Status).toBe(CRYPTO_SYNC_STATUS.PENDING);
    expect(job(4)?.Status).toBe(CRYPTO_SYNC_STATUS.RUNNING);
  });

  it("leaves a job waiting in the cron's queue alone while a job of the queue is under way", async () => {
    mockRows.length = 0;
    mockRows.push(
      // The queued job before it: running, or with its first round just claimed.
      row(5, { ResumeState: { round: 1, claimed: true, inCronQueue: true } }),
      row(6, { ...WAITING_IN_QUEUE, createdMinutesAgo: 30 }),
    );

    await failStuckJobs();

    expect(job(6)?.Status).toBe(CRYPTO_SYNC_STATUS.PENDING);

    const [going] = mockRows;
    if (going) Object.assign(going, { Status: CRYPTO_SYNC_STATUS.PENDING, StartedAt: null, createdMinutesAgo: 1 });
    await failStuckJobs();

    expect(job(6)?.Status).toBe(CRYPTO_SYNC_STATUS.PENDING);
  });

  it('fails the jobs waiting in the queue once none is under way, behind a stalled one in the same call', async () => {
    mockRows.length = 0;
    mockRows.push(
      row(5, { updatedMinutesAgo: 20, ResumeState: { round: 2, claimed: true, inCronQueue: true } }),
      row(6, { ...WAITING_IN_QUEUE, createdMinutesAgo: 30 }),
      row(7, { ...WAITING_IN_QUEUE, createdMinutesAgo: 30 }),
    );

    await failStuckJobs();

    expect(job(5)).toMatchObject({ Status: CRYPTO_SYNC_STATUS.FAILED, ErrorCode: API_ERROR.CRYPTO.SYNC_STALLED });
    expect(job(6)).toMatchObject({ Status: CRYPTO_SYNC_STATUS.FAILED, ErrorCode: API_ERROR.CRYPTO.SYNC_NEVER_STARTED });
    expect(job(7)?.Status).toBe(CRYPTO_SYNC_STATUS.FAILED);
  });

  it('still fails a manual job stuck in pending while a job of the queue is under way', async () => {
    mockRows.length = 0;
    mockRows.push(
      row(5, { ResumeState: { round: 1, claimed: true, inCronQueue: true } }),
      row(8, { Status: CRYPTO_SYNC_STATUS.PENDING, StartedAt: null, createdMinutesAgo: 30, ResumeState: {} }),
    );

    await failStuckJobs();

    expect(job(8)?.Status).toBe(CRYPTO_SYNC_STATUS.FAILED);
  });

  it('leaves each job it fails only its round of ResumeState, and the others their whole state', async () => {
    await failStuckJobs();

    expect(job(1)?.ResumeState).toEqual({ round: 2, claimed: true });
    expect(job(2)?.ResumeState).toEqual({ round: 2, claimed: true });
    expect(job(4)?.ResumeState).toEqual({ round: 2, claimed: true, completedTaskKeys: ['spot_trade:BTCUSDT'] });
  });
});
