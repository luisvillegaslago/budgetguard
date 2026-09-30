/**
 * startSyncRound: the call that asks the continue route to run the next round.
 *
 * A round hands off in what is left of its own invocation, which the platform
 * ends at 300 s. With two full attempts of 15 s it could still be calling at
 * 300 s, be killed, and leave the job waiting fifteen minutes for
 * failStuckJobs. So a round passes its budget: two full calls only while both
 * end 5 s before the limit, else one cut to the time left, else none and the
 * job fails at once. Every failed hand-off reaches the server log, without
 * the secret. A first call refused although the round was just announced
 * fails the job while the round is still unclaimed.
 *
 * The job repository is stubbed; fetch never answers unless a test says so, and
 * fake timers end each call at its timeout. The budget's clock is injected.
 */

import {
  API_ERROR,
  CRYPTO_SYNC_HANDOFF_OUTCOME,
  CRYPTO_SYNC_HANDOFF_TIMEOUT_MS,
  CRYPTO_SYNC_INVOCATION_LIMIT_MS,
  CRYPTO_SYNC_ROUND_BUDGET_MS,
} from '@/constants/finance';

const mockFailed = {
  calls: [] as Array<{ jobId: number; round: number; code: string; message: string }>,
  // What failUnclaimedSyncRound answers: false when its WHERE matched nothing
  // (the round was claimed, or the job ended meanwhile).
  matches: true,
};

jest.mock('@/services/database/CryptoSyncJobsRepository', () => ({
  failUnclaimedSyncRound: jest.fn(async (jobId: number, round: number, code: string, message: string) => {
    mockFailed.calls.push({ jobId, round, code, message });
    return mockFailed.matches;
  }),
}));

import { startSyncRound } from '@/services/exchanges/binance/syncRounds';
import type { SyncBudget } from '@/services/exchanges/shared/syncBudget';

const SECRET = 'test-cron-secret';
const BYPASS = 'test-bypass-secret';
const APP_ORIGIN = 'https://budgetguard.test';
const START = 1_000_000;
const JOB_ID = 31;
const ROUND = 2;

const clock = { now: START };
const savedEnv = { ...process.env };
const savedFetch = global.fetch;
const mockFetch = jest.fn();
let error: jest.SpyInstance;
let warn: jest.SpyInstance;

/** The budget of a round whose invocation began at START, read at clock.now. */
function budget(): SyncBudget {
  return { deadline: START + CRYPTO_SYNC_ROUND_BUDGET_MS, now: () => clock.now };
}

/** A call that only ends when its caller aborts it. */
function neverAnswers(_url: string, init: RequestInit): Promise<never> {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new Error('This operation was aborted')));
  });
}

/** Starts the hand-off and reports when it settles, without awaiting it. */
function handOffAt(msIntoInvocation: number) {
  clock.now = START + msIntoInvocation;
  const state: { outcome: string | null } = { outcome: null };
  const done = startSyncRound(JOB_ID, ROUND, budget()).then((outcome) => {
    state.outcome = outcome;
  });
  return { state, done };
}

function loggedErrors(): string {
  return error.mock.calls.map((args) => args.map(String).join(' ')).join('\n');
}

beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterAll(() => {
  process.env = savedEnv;
  global.fetch = savedFetch;
});

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  // A round that stopped at its budget, unless a test hands off later.
  clock.now = START + CRYPTO_SYNC_ROUND_BUDGET_MS;
  process.env.CRON_SECRET = SECRET;
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET = BYPASS;
  process.env.NEXTAUTH_URL = APP_ORIGIN;
  delete process.env.VERCEL_ENV;
  mockFailed.calls = [];
  mockFailed.matches = true;
  mockFetch.mockReset();
  mockFetch.mockImplementation(neverAnswers);
  error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  error.mockRestore();
  warn.mockRestore();
});

describe('startSyncRound — the calls fit in what is left of the invocation', () => {
  it('a round that stopped at its budget makes two full calls', async () => {
    const { state } = handOffAt(CRYPTO_SYNC_ROUND_BUDGET_MS);

    await jest.advanceTimersByTimeAsync(CRYPTO_SYNC_HANDOFF_TIMEOUT_MS);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(CRYPTO_SYNC_HANDOFF_TIMEOUT_MS);

    expect(state.outcome).toBe(CRYPTO_SYNC_HANDOFF_OUTCOME.FAILED);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('with less left than two full calls, makes one, cut to end 5 s before the limit', async () => {
    // 15 s left: one call of 10 s.
    const { state } = handOffAt(CRYPTO_SYNC_INVOCATION_LIMIT_MS - 15_000);

    await jest.advanceTimersByTimeAsync(9_999);
    expect(state.outcome).toBeNull();
    await jest.advanceTimersByTimeAsync(1);

    expect(state.outcome).toBe(CRYPTO_SYNC_HANDOFF_OUTCOME.FAILED);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFailed.calls).toEqual([
      expect.objectContaining({ jobId: JOB_ID, round: ROUND, code: API_ERROR.CRYPTO.SYNC_HANDOFF_FAILED }),
    ]);
    expect(mockFailed.calls[0]?.message).toContain('no answer within 10000 ms');
  });

  it('with too little left for a useful call, makes none and fails the job at once', async () => {
    const { state, done } = handOffAt(CRYPTO_SYNC_INVOCATION_LIMIT_MS - 7_000);

    await done;

    expect(state.outcome).toBe(CRYPTO_SYNC_HANDOFF_OUTCOME.FAILED);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockFailed.calls).toEqual([
      expect.objectContaining({ jobId: JOB_ID, round: ROUND, code: API_ERROR.CRYPTO.SYNC_HANDOFF_FAILED }),
    ]);
  });
});

describe('startSyncRound — what a failed or refused hand-off leaves behind', () => {
  it('logs every failed hand-off with its code and status, never the secrets', async () => {
    mockFetch.mockResolvedValue({ status: 500 });

    await startSyncRound(JOB_ID, ROUND, budget());

    expect(error).toHaveBeenCalledTimes(1);
    expect(loggedErrors()).toContain(API_ERROR.CRYPTO.SYNC_HANDOFF_FAILED);
    expect(loggedErrors()).toContain('HTTP 500');
    expect(loggedErrors()).not.toContain(SECRET);
    expect(loggedErrors()).not.toContain(BYPASS);
  });

  it("keeps a network error's own text in the server log and out of the job, which the panel shows", async () => {
    // What fetch throws names the host, address and port it tried.
    mockFetch.mockRejectedValue(new Error('connect ECONNREFUSED 10.1.2.3:443 (internal.budgetguard.test)'));

    const outcome = await startSyncRound(JOB_ID, ROUND, budget());

    expect(outcome).toBe(CRYPTO_SYNC_HANDOFF_OUTCOME.FAILED);
    expect(mockFailed.calls).toEqual([
      expect.objectContaining({ jobId: JOB_ID, round: ROUND, code: API_ERROR.CRYPTO.SYNC_HANDOFF_FAILED }),
    ]);
    const stored = mockFailed.calls[0]?.message ?? '';
    expect(stored).toContain(`Round ${ROUND}`);
    expect(stored).not.toMatch(/ECONNREFUSED|10\.1\.2\.3|internal\.budgetguard/);
    expect(loggedErrors()).toContain('ECONNREFUSED 10.1.2.3:443');
  });

  it('a first call refused while the round is still unclaimed fails the job and warns', async () => {
    mockFetch.mockResolvedValue({ status: 409 });

    const outcome = await startSyncRound(JOB_ID, ROUND, budget());

    expect(outcome).toBe(CRYPTO_SYNC_HANDOFF_OUTCOME.REFUSED);
    expect(mockFailed.calls).toEqual([
      expect.objectContaining({ jobId: JOB_ID, round: ROUND, code: API_ERROR.CRYPTO.SYNC_HANDOFF_FAILED }),
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a first call refused for a job cancelled or a round claimed meanwhile changes nothing and stays quiet', async () => {
    mockFetch.mockResolvedValue({ status: 409 });
    mockFailed.matches = false;

    await startSyncRound(JOB_ID, ROUND, budget());

    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('a refusal after a failed first call needs nothing: that call may have claimed the round', async () => {
    mockFetch.mockRejectedValueOnce(new Error('socket hang up')).mockResolvedValueOnce({ status: 409 });

    const outcome = await startSyncRound(JOB_ID, ROUND, budget());

    expect(outcome).toBe(CRYPTO_SYNC_HANDOFF_OUTCOME.REFUSED);
    expect(mockFailed.calls).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });
});
