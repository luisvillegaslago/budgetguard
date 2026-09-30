/**
 * Integration: the status transitions of CryptoSyncJobsRepository.
 *
 * - A transition only leaves from the statuses it names. The user can cancel a
 *   job while its worker finishes a task; that worker then completing or
 *   failing it must not overwrite the cancel, nor may a round that starts late
 *   revive it. A completed job overwritten that way would become the anchor of
 *   the next incremental sync without having fetched everything.
 * - A job that ends keeps only its round of ResumeState: the rest (task keys,
 *   failures, dedup decisions) can hold thousands of entries nothing reads
 *   after the end, and every job query, the panel's poll among them, reads the
 *   round out of that column.
 *
 * The fake database applies to an in-memory table each clause it finds in a
 * statement, and only those: the status it sets, the statuses its WHERE allows,
 * the round and claim guards, and the ResumeState reset. Dropping a guard or
 * the reset from the SQL makes these tests fail. The status guards and the
 * reset (jsonb_build_object) added on 2026-09-29 have NOT been run against
 * PostgreSQL yet: these tests check which clauses each statement carries, not
 * that PostgreSQL accepts them.
 */

import { API_ERROR, CRYPTO_SYNC_STATUS } from '@/constants/finance';

interface MockRow {
  JobID: number;
  UserID: number;
  Status: string;
  ErrorCode: string | null;
  ResumeState: Record<string, unknown>;
}

const mockRows: MockRow[] = [];

const MOCK_CLAUSE = {
  ENDED_RESUME_STATE: `"ResumeState" = jsonb_build_object('round', COALESCE(("ResumeState"->>'round')::int, 1), 'claimed', true)`,
  ROUND: `("ResumeState"->>'round')::int = $2`,
  UNCLAIMED: `"ResumeState"->>'claimed' = 'false'`,
} as const;

function mockParam(sql: string, column: string, params: unknown[]): unknown {
  const match = new RegExp(`"${column}" = \\$(\\d+)`).exec(sql);
  return match ? params[Number(match[1]) - 1] : undefined;
}

/** The statuses a WHERE clause lets through, or null when it names none. */
function mockAllowedStatuses(where: string): string[] | null {
  const list = /"Status" IN \(([^)]*)\)/.exec(where);
  if (list) return Array.from((list[1] ?? '').matchAll(/'(\w+)'/g), ([, status]) => status ?? '');
  const single = /"Status" = '(\w+)'/.exec(where);
  return single ? [single[1] ?? ''] : null;
}

function mockUpdate(sql: string, params: unknown[]): Array<{ JobID: number }> {
  const [set = '', where = ''] = sql.split('WHERE');
  const newStatus = /"Status" = '(\w+)'/.exec(set)?.[1];
  const allowed = mockAllowedStatuses(where);
  const jobId = mockParam(where, 'JobID', params);
  const userId = mockParam(where, 'UserID', params);
  const round = where.includes(MOCK_CLAUSE.ROUND) ? params[1] : undefined;
  const errorCode = mockParam(set, 'ErrorCode', params);
  const matched = mockRows.filter(
    (row) =>
      row.JobID === jobId &&
      (userId === undefined || row.UserID === userId) &&
      (allowed === null || allowed.includes(row.Status)) &&
      (round === undefined || Number(row.ResumeState.round) === round) &&
      (!where.includes(MOCK_CLAUSE.UNCLAIMED) || row.ResumeState.claimed === false),
  );
  matched.forEach((row) => {
    if (newStatus) row.Status = newStatus;
    if (errorCode !== undefined) row.ErrorCode = errorCode === null ? null : String(errorCode);
    if (set.includes(MOCK_CLAUSE.ENDED_RESUME_STATE)) {
      row.ResumeState = { round: Number(row.ResumeState.round ?? 1), claimed: true };
    }
  });
  return matched.map((row) => ({ JobID: row.JobID }));
}

jest.mock('@/services/database/connection', () => ({
  query: jest.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('UPDATE "CryptoSyncJobs"')) return mockUpdate(sql, params);
    throw new Error(`unexpected SQL in test: ${sql.slice(0, 80)}`);
  }),
}));

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 7),
  AuthError: class AuthError extends Error {},
}));

import {
  cancelJob,
  failUnclaimedSyncRound,
  markJobCompleted,
  markJobFailed,
  markJobRunning,
} from '@/services/database/CryptoSyncJobsRepository';

// The state a job carries in the middle of a long sync.
const MID_JOB_STATE = {
  round: 3,
  claimed: false,
  phase: 'fetch',
  completedTaskKeys: ['spot_trade:BTCUSDT', 'earn_flex:2025-01-01T00:00:00.000Z'],
  spotCandidates: ['BTCUSDT', 'ETHUSDT'],
  crossSource: { dropped: ['earn_flex|x'], consumed: ['earn_flex|y'] },
};

function job(status: string, resumeState: Record<string, unknown> = MID_JOB_STATE): MockRow {
  return { JobID: 31, UserID: 7, Status: status, ErrorCode: null, ResumeState: { ...resumeState } };
}

function only(): MockRow {
  const row = mockRows[0];
  if (!row) throw new Error('no job in the table');
  return row;
}

beforeEach(() => {
  mockRows.length = 0;
});

describe('a transition only leaves from the statuses it names', () => {
  it('marks a queued job running', async () => {
    mockRows.push(job(CRYPTO_SYNC_STATUS.PENDING));

    await expect(markJobRunning(31)).resolves.toBe(true);
    expect(only().Status).toBe(CRYPTO_SYNC_STATUS.RUNNING);
  });

  it.each([
    CRYPTO_SYNC_STATUS.CANCELLED,
    CRYPTO_SYNC_STATUS.FAILED,
    CRYPTO_SYNC_STATUS.COMPLETED,
  ])('never revives a %s job as running, and says so', async (status) => {
    mockRows.push(job(status));

    await expect(markJobRunning(31)).resolves.toBe(false);
    expect(only().Status).toBe(status);
  });

  it('completes a running job', async () => {
    mockRows.push(job(CRYPTO_SYNC_STATUS.RUNNING));

    await markJobCompleted(31);

    expect(only().Status).toBe(CRYPTO_SYNC_STATUS.COMPLETED);
  });

  it.each([CRYPTO_SYNC_STATUS.CANCELLED, CRYPTO_SYNC_STATUS.FAILED])('does not complete a %s job', async (status) => {
    mockRows.push(job(status));

    await markJobCompleted(31);

    expect(only().Status).toBe(status);
  });

  it.each([CRYPTO_SYNC_STATUS.PENDING, CRYPTO_SYNC_STATUS.RUNNING])('fails a %s job', async (status) => {
    mockRows.push(job(status));

    await markJobFailed(31, API_ERROR.CRYPTO.SYNC_ROUND_LIMIT, 'The sync used all its rounds.');

    expect(only()).toMatchObject({ Status: CRYPTO_SYNC_STATUS.FAILED, ErrorCode: API_ERROR.CRYPTO.SYNC_ROUND_LIMIT });
  });

  it.each([
    CRYPTO_SYNC_STATUS.CANCELLED,
    CRYPTO_SYNC_STATUS.COMPLETED,
  ])('does not overwrite a %s job with a failure', async (status) => {
    mockRows.push(job(status));

    await markJobFailed(31, API_ERROR.CRYPTO.SYNC_ROUND_LIMIT, 'The sync used all its rounds.');

    expect(only()).toMatchObject({ Status: status, ErrorCode: null });
  });

  it('fails an unclaimed round only while the job waits for it', async () => {
    mockRows.push(job(CRYPTO_SYNC_STATUS.CANCELLED));
    await expect(failUnclaimedSyncRound(31, 3, API_ERROR.CRYPTO.SYNC_HANDOFF_FAILED, 'refused')).resolves.toBe(false);
    expect(only().Status).toBe(CRYPTO_SYNC_STATUS.CANCELLED);

    mockRows.length = 0;
    mockRows.push(job(CRYPTO_SYNC_STATUS.RUNNING, { ...MID_JOB_STATE, claimed: true }));
    await expect(failUnclaimedSyncRound(31, 3, API_ERROR.CRYPTO.SYNC_HANDOFF_FAILED, 'refused')).resolves.toBe(false);
    expect(only().Status).toBe(CRYPTO_SYNC_STATUS.RUNNING);
  });
});

describe('a job that ends keeps only its round of ResumeState', () => {
  const ENDED = { round: 3, claimed: true };

  it('when it completes', async () => {
    mockRows.push(job(CRYPTO_SYNC_STATUS.RUNNING));
    await markJobCompleted(31);
    expect(only().ResumeState).toEqual(ENDED);
  });

  it('when it fails', async () => {
    mockRows.push(job(CRYPTO_SYNC_STATUS.RUNNING));
    await markJobFailed(31, API_ERROR.CRYPTO.SYNC_FAILED, 'transient failures');
    expect(only().ResumeState).toEqual(ENDED);
  });

  it('when the user cancels it', async () => {
    mockRows.push(job(CRYPTO_SYNC_STATUS.RUNNING));
    await expect(cancelJob(31)).resolves.toBe(true);
    expect(only()).toMatchObject({ Status: CRYPTO_SYNC_STATUS.CANCELLED, ResumeState: ENDED });
  });

  it('when its next round cannot be started', async () => {
    mockRows.push(job(CRYPTO_SYNC_STATUS.RUNNING));
    await failUnclaimedSyncRound(31, 3, API_ERROR.CRYPTO.SYNC_HANDOFF_FAILED, 'no answer');
    expect(only()).toMatchObject({ Status: CRYPTO_SYNC_STATUS.FAILED, ResumeState: ENDED });
  });

  it('a job that never needed a second round still reads as round 1', async () => {
    mockRows.push(job(CRYPTO_SYNC_STATUS.RUNNING, {}));
    await markJobCompleted(31);
    expect(only().ResumeState).toEqual({ round: 1, claimed: true });
  });
});
