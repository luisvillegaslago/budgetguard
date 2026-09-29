/**
 * Unit tests: the job an incremental API sync anchors on.
 *
 * A CSV upload is recorded as a completed job for the same exchange, but it
 * only covers what its file holds. If it became the anchor, the next API sync
 * would start after the upload and skip every window since the previous API
 * sync. The lookup must skip jobs stamped with the CSV progress key, which is
 * the same constant the CSV route writes.
 *
 * The fake database applies the query's own filters to an in-memory table;
 * the SQL itself was run read-only against Neon on 2026-09-29 (the main user
 * anchors on API job 30, the CSV-only account on nothing).
 */

import {
  CRYPTO_CSV_IMPORT_PROGRESS_KEY,
  CRYPTO_EVENT_TYPE,
  CRYPTO_EXCHANGE,
  CRYPTO_SYNC_MODE,
  CRYPTO_SYNC_STATUS,
} from '@/constants/finance';

interface JobRow {
  JobID: number;
  UserID: number;
  Exchange: string;
  Mode: string;
  Status: string;
  Progress: Record<string, unknown>;
  FinishedAt: string;
}

const WINDOW = { fetched: 1, totalWindows: 1, completedWindows: 1, lastWindowEnd: null };

let jobs: JobRow[] = [];

jest.mock('@/services/database/connection', () => ({
  query: jest.fn(async (sql: string, params: unknown[] = []) => {
    const [userId, exchange, csvKey] = params as [number, string, string | undefined];
    const skipsCsv = sql.includes('"Progress" ? $3');
    return jobs
      .filter(
        (job) => job.UserID === userId && job.Exchange === exchange && job.Status === CRYPTO_SYNC_STATUS.COMPLETED,
      )
      .filter((job) => !(skipsCsv && csvKey !== undefined && csvKey in job.Progress))
      .sort((a, b) => b.FinishedAt.localeCompare(a.FinishedAt))
      .slice(0, 1);
  }),
}));

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 2),
  AuthError: class AuthError extends Error {},
}));

import { getLastCompletedJobForUser } from '@/services/database/CryptoSyncJobsRepository';

function job(id: number, userId: number, finishedAt: string, progress: Record<string, unknown>): JobRow {
  return {
    JobID: id,
    UserID: userId,
    Exchange: CRYPTO_EXCHANGE.BINANCE,
    Mode: CRYPTO_SYNC_MODE.INCREMENTAL,
    Status: CRYPTO_SYNC_STATUS.COMPLETED,
    Progress: progress,
    FinishedAt: finishedAt,
  };
}

const API_PROGRESS = { [CRYPTO_EVENT_TYPE.SPOT_TRADE]: WINDOW };
const CSV_PROGRESS = { [CRYPTO_CSV_IMPORT_PROGRESS_KEY]: WINDOW, normalize: WINDOW };

describe('getLastCompletedJobForUser — the anchor of an incremental API sync', () => {
  it('skips a later CSV upload and anchors on the last API sync', async () => {
    jobs = [job(30, 2, '2026-08-15T05:00:00.000Z', API_PROGRESS), job(31, 2, '2026-09-20T10:00:00.000Z', CSV_PROGRESS)];

    const anchor = await getLastCompletedJobForUser(2, CRYPTO_EXCHANGE.BINANCE);

    expect(anchor?.jobId).toBe(30);
  });

  it('has no anchor for an account that only ever uploaded CSVs', async () => {
    jobs = [job(28, 3, '2026-06-28T10:00:00.000Z', CSV_PROGRESS)];

    const anchor = await getLastCompletedJobForUser(3, CRYPTO_EXCHANGE.BINANCE);

    expect(anchor).toBeNull();
  });
});
