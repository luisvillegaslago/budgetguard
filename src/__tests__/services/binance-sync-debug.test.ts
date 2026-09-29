/**
 * syncDebug's per-endpoint line names the events the cross-source filter
 * dropped, so an event wrongly taken for a CSV duplicate shows up in the debug
 * log instead of vanishing.
 *
 * The logger reads CRYPTO_SYNC_DEBUG once, when the module loads, so each test
 * loads a fresh copy with the variable set.
 */

import { CRYPTO_EVENT_TYPE } from '@/constants/finance';

type SyncDebug = typeof import('@/services/exchanges/binance/syncDebug')['syncDebug'];

async function withDebugEnabled(run: (debug: SyncDebug) => void): Promise<void> {
  const previous = process.env.CRYPTO_SYNC_DEBUG;
  process.env.CRYPTO_SYNC_DEBUG = '1';
  try {
    await jest.isolateModulesAsync(async () => {
      const { syncDebug } = await import('@/services/exchanges/binance/syncDebug');
      run(syncDebug);
    });
  } finally {
    if (previous === undefined) delete process.env.CRYPTO_SYNC_DEBUG;
    else process.env.CRYPTO_SYNC_DEBUG = previous;
  }
}

describe('syncDebug.endpointSummary', () => {
  let log: jest.SpyInstance;
  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    log.mockRestore();
  });

  it('names how many fetched events were dropped as already stored', async () => {
    await withDebugEnabled((debug) => {
      debug.endpointSummary(CRYPTO_EVENT_TYPE.SPOT_TRADE, 5, 0, 1, 2);
    });

    expect(log).toHaveBeenCalledWith(expect.stringContaining('fetched=5 duplicatesSkipped=2 failures=0'));
  });

  it('leaves the count out for a caller without a dedup step', async () => {
    await withDebugEnabled((debug) => {
      debug.endpointSummary('normalize', 5, 0, 7);
    });

    expect(log).toHaveBeenCalledWith(expect.stringContaining('fetched=5 failures=0 windows=7'));
  });
});
