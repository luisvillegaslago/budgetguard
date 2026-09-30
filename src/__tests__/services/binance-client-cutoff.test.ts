/**
 * BinanceClient under a sync round's cutoff.
 *
 * A round stops starting tasks at its budget (240 s) and has until the
 * platform's limit (300 s) to save its state and hand off. What it already
 * started used to run unbounded: the SDK's own request timeout is five
 * minutes, a rate-limit retry waits 30 s then 60 s, and the weight throttle up
 * to 60 s. With a cutoff, no request is sent and no wait started once it would
 * be reached, and a request still unanswered then is abandoned, each with
 * SyncCutoffError so the sync reruns the task in the next round.
 *
 * The SDK is stubbed; timers and Date are fake, so a wait that should not
 * happen shows as a call that has not settled.
 */

import { CRYPTO_SYNC_FAILURE_KIND, CRYPTO_SYNC_TASK_FAILURE } from '@/constants/finance';

const mockSdk = {
  depositCalls: 0,
  // What the next deposit history call does.
  deposits: (): Promise<unknown> => Promise.resolve([]),
  accountCalls: 0,
  account: (): Promise<unknown> => Promise.resolve({ balances: [] }),
};

jest.mock('binance', () => ({
  MainClient: jest.fn().mockImplementation(() => ({
    getDepositHistory: () => {
      mockSdk.depositCalls += 1;
      return mockSdk.deposits();
    },
    getAccountInformation: () => {
      mockSdk.accountCalls += 1;
      return mockSdk.account();
    },
  })),
}));

import { BinanceClient, classifyTaskFailure } from '@/services/exchanges/binance/BinanceClient';
import { type SyncCutoff, SyncCutoffError } from '@/services/exchanges/shared/syncBudget';

/** The object the SDK throws when Binance answers -1003 (too many requests). */
const RATE_LIMITED = { code: -1003, message: 'Too many requests', body: { code: -1003, msg: 'Too many requests' } };

function cutoffIn(ms: number): SyncCutoff {
  return { at: Date.now() + ms, now: () => Date.now() };
}

function clientWith(cutoff: SyncCutoff): BinanceClient {
  return new BinanceClient({ apiKey: 'key', apiSecret: 'secret' }, cutoff);
}

/** Starts `call` and reports how it has settled so far, without awaiting it. */
function observe(call: Promise<unknown>): { settled: boolean; error: unknown } {
  const state: { settled: boolean; error: unknown } = { settled: false, error: undefined };
  call.then(
    () => {
      state.settled = true;
    },
    (error: unknown) => {
      state.settled = true;
      state.error = error;
    },
  );
  return state;
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  mockSdk.depositCalls = 0;
  mockSdk.deposits = () => Promise.resolve([]);
  mockSdk.accountCalls = 0;
  mockSdk.account = () => Promise.resolve({ balances: [] });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('BinanceClient with a round cutoff', () => {
  it('does not start a rate-limit wait that would reach the cutoff', async () => {
    mockSdk.deposits = () => Promise.reject(RATE_LIMITED);
    // The first retry waits 30 s; only 20 s are left.
    const call = observe(clientWith(cutoffIn(20_000)).fetchDeposits(0, 1));

    await jest.advanceTimersByTimeAsync(0);

    expect(call.settled).toBe(true);
    expect(call.error).toBeInstanceOf(SyncCutoffError);
    expect(mockSdk.depositCalls).toBe(1);
  });

  it('abandons a request still unanswered at the cutoff', async () => {
    mockSdk.deposits = () => new Promise(() => undefined);
    const call = observe(clientWith(cutoffIn(10_000)).fetchDeposits(0, 1));

    await jest.advanceTimersByTimeAsync(9_999);
    expect(call.settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);

    expect(call.settled).toBe(true);
    expect(call.error).toBeInstanceOf(SyncCutoffError);
  });

  it('sends nothing once the cutoff has passed', async () => {
    const call = observe(clientWith(cutoffIn(0)).fetchDeposits(0, 1));

    await jest.advanceTimersByTimeAsync(0);

    expect(call.error).toBeInstanceOf(SyncCutoffError);
    expect(mockSdk.depositCalls).toBe(0);
  });

  it('does not start a weight-throttle wait that would reach the cutoff', async () => {
    const client = clientWith(cutoffIn(10_000));
    // The tracker only ever sees its own estimate; set it past the threshold
    // the way a burst of heavy calls would.
    (client as unknown as { weight: { used: number } }).weight.used = 5_000;
    const call = observe(client.fetchDeposits(0, 1));

    await jest.advanceTimersByTimeAsync(0);

    expect(call.error).toBeInstanceOf(SyncCutoffError);
    expect(mockSdk.depositCalls).toBe(0);
  });

  it('passes a cut-off key check on instead of calling the key refused', async () => {
    mockSdk.account = () => new Promise(() => undefined);
    const call = observe(clientWith(cutoffIn(5_000)).isKeyAccepted());

    await jest.advanceTimersByTimeAsync(5_000);

    expect(call.error).toBeInstanceOf(SyncCutoffError);
  });

  it('classifies a cut-off call as transient under its own code', () => {
    expect(classifyTaskFailure(new SyncCutoffError())).toEqual({
      kind: CRYPTO_SYNC_FAILURE_KIND.TRANSIENT,
      code: CRYPTO_SYNC_TASK_FAILURE.ROUND_CUTOFF,
    });
  });
});
