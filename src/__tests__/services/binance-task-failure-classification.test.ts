/**
 * classifyTaskFailure decides what one failed sync task does to its job:
 * FATAL stops it, TRANSIENT ends it failed so the next incremental sync fetches
 * the same windows again, and PERMANENT lets it complete with the gap reported,
 * because a failure that repeats on every run would otherwise freeze the
 * incremental anchor for good.
 *
 * Binance errors reach the classifier the way production builds them: the SDK's
 * BaseRestClient.parseException rethrows `{ code, message, body, headers,
 * requestUrl, ... }` with Binance's own code and no HTTP status, and
 * BinanceClient.mapBinanceError turns that into a BinanceClientError.
 */

import { API_ERROR, CRYPTO_EVENT_TYPE, CRYPTO_SYNC_FAILURE_KIND, CRYPTO_SYNC_TASK_FAILURE } from '@/constants/finance';

let mockDepositError: unknown = null;

jest.mock('binance', () => ({
  MainClient: jest.fn().mockImplementation(() => ({
    getDepositHistory: async () => {
      if (mockDepositError) throw mockDepositError;
      return [];
    },
  })),
}));

import {
  BinanceClient,
  BinanceClientError,
  classifyTaskFailure,
  SpotHistoryTruncatedError,
} from '@/services/exchanges/binance/BinanceClient';

/** The object BaseRestClient.parseException throws for a non-2xx Binance answer. */
function sdkError(code: number, msg: string): Record<string, unknown> {
  return {
    code,
    message: msg,
    body: { code, msg },
    headers: {},
    requestUrl: 'https://api.binance.com/sapi/v1/capital/deposit/hisrec',
  };
}

/** What a sync task sees when the deposit endpoint answers with `error`. */
async function errorFromDepositCall(error: unknown): Promise<unknown> {
  mockDepositError = error;
  try {
    await new BinanceClient({ apiKey: 'key', apiSecret: 'secret' }).fetchDeposits(0, 1);
  } catch (thrown) {
    return thrown;
  }
  throw new Error('the deposit call was expected to fail');
}

afterEach(() => {
  mockDepositError = null;
});

describe('classifyTaskFailure', () => {
  it('a spot history too long to walk is permanent when nothing was walked: the next run walks the same pages', () => {
    expect(classifyTaskFailure(new BinanceClientError(CRYPTO_SYNC_TASK_FAILURE.HISTORY_TRUNCATED))).toEqual({
      kind: CRYPTO_SYNC_FAILURE_KIND.PERMANENT,
      code: CRYPTO_SYNC_TASK_FAILURE.HISTORY_TRUNCATED,
    });
    expect(classifyTaskFailure(new SpotHistoryTruncatedError([], -1))).toEqual({
      kind: CRYPTO_SYNC_FAILURE_KIND.PERMANENT,
      code: CRYPTO_SYNC_TASK_FAILURE.HISTORY_TRUNCATED,
    });
  });

  it('a spot history too long to walk is resumable once fills were walked: they are stored and the next run goes on', () => {
    const walked = [
      {
        eventType: CRYPTO_EVENT_TYPE.SPOT_TRADE,
        externalId: 'BTCUSDT-9000000',
        occurredAt: new Date(0),
        rawPayload: { symbol: 'BTCUSDT', id: 9_000_000 },
      },
    ];

    expect(classifyTaskFailure(new SpotHistoryTruncatedError(walked, 9_000_000))).toEqual({
      kind: CRYPTO_SYNC_FAILURE_KIND.RESUMABLE,
      code: CRYPTO_SYNC_TASK_FAILURE.HISTORY_RESUMES_NEXT_RUN,
    });
  });

  it('Binance refusing an endpoint to the key (-2015) is permanent', async () => {
    const error = await errorFromDepositCall(sdkError(-2015, 'Invalid API-key, IP, or permissions for action.'));

    expect(classifyTaskFailure(error)).toEqual({
      kind: CRYPTO_SYNC_FAILURE_KIND.PERMANENT,
      code: CRYPTO_SYNC_TASK_FAILURE.ENDPOINT_NOT_PERMITTED,
    });
  });

  it('any other Binance error code is transient', async () => {
    const error = await errorFromDepositCall(
      sdkError(-1000, 'An unknown error occurred while processing the request.'),
    );

    expect(classifyTaskFailure(error)).toEqual({
      kind: CRYPTO_SYNC_FAILURE_KIND.TRANSIENT,
      code: API_ERROR.CRYPTO.EXCHANGE_UNAVAILABLE,
    });
  });

  it.each([
    ['a network error or a 5xx without a Binance code', new BinanceClientError(API_ERROR.CRYPTO.EXCHANGE_UNAVAILABLE)],
    ['a 429 still rate-limited after the retries', new BinanceClientError(API_ERROR.CRYPTO.RATE_LIMITED, 429)],
    ['a 418 IP ban', new BinanceClientError(API_ERROR.CRYPTO.RATE_LIMITED, 418)],
    [
      'Binance -1003 too many requests',
      new BinanceClientError(API_ERROR.CRYPTO.RATE_LIMITED, undefined, undefined, -1003),
    ],
    ['a trade page with a fill without an id', new BinanceClientError(CRYPTO_SYNC_TASK_FAILURE.TRADE_WITHOUT_ID)],
  ])('%s is transient', (_label, error) => {
    expect(classifyTaskFailure(error)).toEqual({ kind: CRYPTO_SYNC_FAILURE_KIND.TRANSIENT, code: error.code });
  });

  it.each([
    ['a database error while storing', new Error('connection terminated')],
    ['a thrown string', 'socket hang up'],
  ])('%s is transient and reported as task_failed', (_label, error) => {
    expect(classifyTaskFailure(error)).toEqual({
      kind: CRYPTO_SYNC_FAILURE_KIND.TRANSIENT,
      code: CRYPTO_SYNC_TASK_FAILURE.TASK_FAILED,
    });
  });

  it('a rejected signature stays fatal, even when Binance also sent -2015', () => {
    const error = new BinanceClientError(API_ERROR.CRYPTO.INVALID_SIGNATURE, 401, undefined, -2015);

    expect(classifyTaskFailure(error)).toEqual({
      kind: CRYPTO_SYNC_FAILURE_KIND.FATAL,
      code: API_ERROR.CRYPTO.INVALID_SIGNATURE,
    });
  });
});
