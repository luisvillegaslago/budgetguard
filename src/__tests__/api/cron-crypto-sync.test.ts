/**
 * Integration: GET /api/cron/crypto-sync → startNextQueuedSyncJob → the continue route.
 *
 * The weekly cron used to run every user's sync inline, one after the other,
 * in its own invocation: one long sync could take the others past the 300 s
 * limit. It now only creates each job and has the first one's first round
 * claimed through POST /api/crypto/sync/[jobId]/continue, where each job gets
 * its own invocations and budget. The jobs still run one at a time: Binance
 * counts request weight per IP, so the round that ends a job starts the next
 * (binance-sync-ingestion.test.ts covers that side).
 *
 * The continue call carries CRON_SECRET, so where it goes is security
 * relevant: always the origin the server is configured with, never the Host
 * of the request, and never a redirect's target. The job repository is an
 * in-memory stand-in that applies the queue's rules (findNextQueuedSyncJob:
 * oldest waiting job first, none while one is under way; failUnclaimedSyncRound:
 * only a round still unclaimed); `fetch` stands in for the continue route,
 * which claims the round when it answers 202, and records where the calls went.
 */

import {
  API_ERROR,
  CRYPTO_CRON_SKIP_REASON,
  CRYPTO_EXCHANGE,
  CRYPTO_SYNC_INVOCATION_LIMIT_MS,
  CRYPTO_SYNC_MODE,
  CRYPTO_SYNC_STATUS,
} from '@/constants/finance';

interface MockJob {
  jobId: number;
  userId: number;
  exchange: string;
  status: string;
  inCronQueue: boolean;
  claimed: boolean;
}

const mockState = {
  credentials: [] as Array<{ userId: number; exchange: string }>,
  activeFor: new Set<number>(),
  // Users whose active job is one failStuckJobs fails: stuck since an earlier run.
  stuckFor: new Set<number>(),
  jobs: [] as MockJob[],
  createdJobs: [] as Array<{ userId: number; jobId: number; awaitsContinuation: boolean | undefined }>,
  failCreateFor: new Set<number>(),
  // Only the failures that matched a job still waiting for its round.
  failedUnclaimed: [] as Array<{ jobId: number; round: number; code: string }>,
};

function mockFindJob(jobId: number): MockJob | undefined {
  return mockState.jobs.find((job) => job.jobId === jobId);
}

jest.mock('@/services/database/ExchangeCredentialsRepository', () => ({
  listAllActiveCredentials: jest.fn(async () => mockState.credentials),
}));

jest.mock('@/services/database/CryptoSyncJobsRepository', () => ({
  failStuckJobs: jest.fn(async () => {
    const stuck = mockState.stuckFor.size;
    mockState.stuckFor.forEach((userId) => {
      mockState.activeFor.delete(userId);
    });
    return stuck;
  }),
  findActiveJobForUser: jest.fn(async (userId: number) => (mockState.activeFor.has(userId) ? { jobId: 1 } : null)),
  getLastCompletedJobForUser: jest.fn(async () => null),
  createSyncJobForUser: jest.fn(async (userId: number, input: { exchange: string; awaitsContinuation?: boolean }) => {
    if (mockState.failCreateFor.has(userId)) throw new Error('connection terminated');
    const jobId = 100 + mockState.createdJobs.length;
    mockState.createdJobs.push({ userId, jobId, awaitsContinuation: input.awaitsContinuation });
    mockState.jobs.push({
      jobId,
      userId,
      exchange: input.exchange,
      status: 'pending',
      inCronQueue: input.awaitsContinuation === true,
      claimed: false,
    });
    return { jobId };
  }),
  findNextQueuedSyncJob: jest.fn(async () => {
    const queued = mockState.jobs.filter((job) => job.inCronQueue);
    const underWay = queued.some((job) => job.status === 'running' || (job.status === 'pending' && job.claimed));
    const waiting = queued.find((job) => job.status === 'pending' && !job.claimed);
    if (underWay || !waiting) return null;
    return { jobId: waiting.jobId, userId: waiting.userId, exchange: waiting.exchange };
  }),
  failUnclaimedSyncRound: jest.fn(async (jobId: number, round: number, code: string) => {
    const job = mockFindJob(jobId);
    if (!job || round !== 1 || job.claimed || !['pending', 'running'].includes(job.status)) return false;
    job.status = 'failed';
    mockState.failedUnclaimed.push({ jobId, round, code });
    return true;
  }),
}));

// The cron must not run a sync itself: this stand-in records any attempt.
jest.mock('@/services/exchanges/binance/BinanceSyncService', () => ({
  computeSyncScope: () => ({ scopeFrom: new Date('2026-09-21T00:00:00Z'), scopeTo: new Date('2026-09-28T05:00:00Z') }),
  runSync: jest.fn(async () => undefined),
}));

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(),
  AuthError: class AuthError extends Error {},
}));

jest.mock('node:crypto', () => {
  const actual = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return { ...actual, timingSafeEqual: jest.fn(actual.timingSafeEqual) };
});

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { timingSafeEqual } from 'node:crypto';
import { GET, maxDuration } from '@/app/api/cron/crypto-sync/route';
import { failStuckJobs, findActiveJobForUser } from '@/services/database/CryptoSyncJobsRepository';
import { runSync } from '@/services/exchanges/binance/BinanceSyncService';

const SECRET = 'test-cron-secret';
const APP_ORIGIN = 'https://budgetguard.test';
const savedEnv = { ...process.env };
const savedFetch = global.fetch;
const mockFetch = jest.fn();

interface CronReport {
  triggered: unknown[];
  queued: unknown[];
  skipped: unknown[];
}

function cronRequest(url = `${APP_ORIGIN}/api/cron/crypto-sync`, extraHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = { authorization: `Bearer ${SECRET}`, ...extraHeaders };
  return { url, headers: { get: (name: string) => headers[name.toLowerCase()] ?? null } } as unknown as Request;
}

async function runCron(request: Request = cronRequest()) {
  const response = await GET(request);
  return {
    status: response.status,
    body: (await response.json()) as { data: CronReport },
  };
}

function calledUrls(): string[] {
  return mockFetch.mock.calls.map(([url]) => String(url));
}

/** The continue route answering 202: it claims the job's first round. */
async function routeClaims(url: string): Promise<{ status: number }> {
  const jobId = Number(/\/sync\/(\d+)\/continue$/.exec(url)?.[1]);
  const job = mockFindJob(jobId);
  if (job) job.claimed = true;
  return { status: 202 };
}

beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterAll(() => {
  process.env = savedEnv;
  global.fetch = savedFetch;
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  process.env.NEXTAUTH_URL = APP_ORIGIN;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  mockState.credentials = [
    { userId: 1, exchange: CRYPTO_EXCHANGE.BINANCE },
    { userId: 2, exchange: CRYPTO_EXCHANGE.BINANCE },
    { userId: 3, exchange: CRYPTO_EXCHANGE.BINANCE },
  ];
  mockState.activeFor = new Set([3]);
  mockState.stuckFor = new Set();
  mockState.jobs = [];
  mockState.createdJobs = [];
  mockState.failCreateFor = new Set();
  mockState.failedUnclaimed = [];
  mockFetch.mockReset();
  mockFetch.mockImplementation(routeClaims);
  jest.mocked(runSync).mockClear();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /api/cron/crypto-sync', () => {
  it('creates one job per credential and starts only the first through the continue route, running none inline', async () => {
    const response = await runCron();

    expect(response.status).toBe(200);
    expect(runSync).not.toHaveBeenCalled();
    expect(mockState.createdJobs).toEqual([
      { userId: 1, jobId: 100, awaitsContinuation: true },
      { userId: 2, jobId: 101, awaitsContinuation: true },
    ]);
    // Two credentials, one continue call: the second job waits for the first to end.
    expect(calledUrls()).toEqual([`${APP_ORIGIN}/api/crypto/sync/100/continue`]);
    expect(mockFetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ round: 1 }),
      redirect: 'manual',
      headers: expect.objectContaining({ Authorization: `Bearer ${SECRET}` }),
    });
    expect(response.body.data.triggered).toEqual([{ userId: 1, exchange: CRYPTO_EXCHANGE.BINANCE, jobId: 100 }]);
    expect(response.body.data.queued).toEqual([{ userId: 2, exchange: CRYPTO_EXCHANGE.BINANCE, jobId: 101 }]);
    expect(response.body.data.skipped).toEqual([
      { userId: 3, exchange: CRYPTO_EXCHANGE.BINANCE, reason: CRYPTO_CRON_SKIP_REASON.ALREADY_RUNNING },
    ]);
    expect(mockFindJob(101)).toMatchObject({ status: CRYPTO_SYNC_STATUS.PENDING, claimed: false });
  });

  it('fails stuck jobs once, before looking for active ones, so a job an earlier run left behind does not skip its user every week', async () => {
    mockState.stuckFor = new Set([3]);

    const response = await runCron();

    expect(failStuckJobs).toHaveBeenCalledTimes(1);
    const [stuckCheck] = jest.mocked(failStuckJobs).mock.invocationCallOrder;
    jest.mocked(findActiveJobForUser).mock.invocationCallOrder.forEach((lookup) => {
      expect(stuckCheck).toBeLessThan(lookup);
    });
    expect(mockState.createdJobs.map((created) => created.userId)).toEqual([1, 2, 3]);
    expect(response.body.data.skipped).toEqual([]);
  });

  it('sends the continue call to the configured origin, whatever Host the cron request carried', async () => {
    await runCron(
      cronRequest('https://attacker.example/api/cron/crypto-sync', {
        host: 'attacker.example',
        'x-forwarded-host': 'attacker.example',
      }),
    );

    expect(calledUrls()).toHaveLength(1);
    calledUrls().forEach((url) => {
      expect(url.startsWith(`${APP_ORIGIN}/`)).toBe(true);
    });
  });

  it('falls back to the production hostname Vercel provides when NEXTAUTH_URL is not set', async () => {
    delete process.env.NEXTAUTH_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'budgetguard-tau.vercel.app';

    await runCron();

    expect(calledUrls()[0]).toBe('https://budgetguard-tau.vercel.app/api/crypto/sync/100/continue');
  });

  it('sends nothing, and fails each job with its own code, when no origin is configured', async () => {
    delete process.env.NEXTAUTH_URL;

    const response = await runCron();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockState.failedUnclaimed).toEqual([
      { jobId: 100, round: 1, code: API_ERROR.CRYPTO.SYNC_ORIGIN_NOT_CONFIGURED },
      { jobId: 101, round: 1, code: API_ERROR.CRYPTO.SYNC_ORIGIN_NOT_CONFIGURED },
    ]);
    expect(response.body.data.triggered).toEqual([]);
    expect(response.body.data.queued).toEqual([]);
  });

  it('treats a redirect as a failed start, never follows it, and moves on to the next job', async () => {
    mockFetch.mockResolvedValue({ status: 307, headers: { get: () => 'https://elsewhere.example/steal' } });

    await runCron();

    // One retry per job, both to the configured origin; the redirect target is never called.
    expect(calledUrls()).toEqual([
      `${APP_ORIGIN}/api/crypto/sync/100/continue`,
      `${APP_ORIGIN}/api/crypto/sync/100/continue`,
      `${APP_ORIGIN}/api/crypto/sync/101/continue`,
      `${APP_ORIGIN}/api/crypto/sync/101/continue`,
    ]);
    expect(mockState.failedUnclaimed.map((failure) => failure.code)).toEqual([
      API_ERROR.CRYPTO.SYNC_HANDOFF_FAILED,
      API_ERROR.CRYPTO.SYNC_HANDOFF_FAILED,
    ]);
  });

  it('reports a refused start under its own reason, apart from a start that never got an answer', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockFetch.mockResolvedValueOnce({ status: 409 }).mockRejectedValue(new Error('connect ECONNREFUSED'));

    const response = await runCron();

    expect(response.body.data.triggered).toEqual([]);
    expect(response.body.data.skipped).toEqual(
      expect.arrayContaining([
        {
          userId: 1,
          exchange: CRYPTO_EXCHANGE.BINANCE,
          reason: CRYPTO_CRON_SKIP_REASON.CONTINUATION_REFUSED,
          jobId: 100,
        },
        { userId: 2, exchange: CRYPTO_EXCHANGE.BINANCE, reason: CRYPTO_CRON_SKIP_REASON.NOT_STARTED, jobId: 101 },
      ]),
    );
  });

  it('fails a job whose start was refused after a failed call, instead of leaving it pending, and starts the next', async () => {
    // The first call never reached the route and the retry was refused: the
    // round is still unclaimed, and nothing else would ever start or fail it.
    mockFetch
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce({ status: 409 })
      .mockImplementation(routeClaims);

    const response = await runCron();

    expect(mockState.failedUnclaimed).toEqual([{ jobId: 100, round: 1, code: API_ERROR.CRYPTO.SYNC_HANDOFF_FAILED }]);
    expect(mockFindJob(100)?.status).toBe(CRYPTO_SYNC_STATUS.FAILED);
    expect(calledUrls()).toEqual([
      `${APP_ORIGIN}/api/crypto/sync/100/continue`,
      `${APP_ORIGIN}/api/crypto/sync/100/continue`,
      `${APP_ORIGIN}/api/crypto/sync/101/continue`,
    ]);
    expect(response.body.data.triggered).toEqual([{ userId: 2, exchange: CRYPTO_EXCHANGE.BINANCE, jobId: 101 }]);
  });

  it("one credential's failure does not keep the others from starting", async () => {
    mockState.failCreateFor = new Set([1]);

    const response = await runCron();

    expect(calledUrls()).toEqual([`${APP_ORIGIN}/api/crypto/sync/100/continue`]);
    expect(mockState.createdJobs.map((created) => created.userId)).toEqual([2]);
    expect(response.body.data.skipped).toContainEqual({
      userId: 1,
      exchange: CRYPTO_EXCHANGE.BINANCE,
      reason: CRYPTO_CRON_SKIP_REASON.NOT_STARTED,
    });
  });

  it('refuses a call without the secret and creates nothing', async () => {
    const response = await GET({
      url: `${APP_ORIGIN}/api/cron/crypto-sync`,
      headers: { get: () => null },
    } as unknown as Request);

    expect(response.status).toBe(401);
    expect(mockState.createdJobs).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(failStuckJobs).not.toHaveBeenCalled();
  });

  it('compares the secret in constant time, and refuses a wrong one of the same length', async () => {
    const wrong = await GET({
      url: `${APP_ORIGIN}/api/cron/crypto-sync`,
      headers: { get: () => `Bearer ${'x'.repeat(SECRET.length)}` },
    } as unknown as Request);
    await runCron();

    expect(wrong.status).toBe(401);
    expect(timingSafeEqual).toHaveBeenCalledTimes(2);
  });

  it('uses the incremental mode for every job it creates', async () => {
    const { createSyncJobForUser } = jest.requireMock<typeof import('@/services/database/CryptoSyncJobsRepository')>(
      '@/services/database/CryptoSyncJobsRepository',
    );

    await runCron();

    expect(jest.mocked(createSyncJobForUser).mock.calls.map(([, input]) => input.mode)).toEqual([
      CRYPTO_SYNC_MODE.INCREMENTAL,
      CRYPTO_SYNC_MODE.INCREMENTAL,
    ]);
  });

  it('declares the platform limit its continue calls are kept inside', () => {
    expect(maxDuration * 1000).toBe(CRYPTO_SYNC_INVOCATION_LIMIT_MS);
  });
});
