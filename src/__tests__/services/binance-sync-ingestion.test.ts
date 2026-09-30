/**
 * Integration: BinanceSyncService.runSync → BinanceClient → CryptoRawEventsRepository.
 *
 * Only the edges are stubbed: the Binance SDK (with the documented endpoint
 * semantics), the job/credential repositories, and `query()`, which is backed
 * by an in-memory CryptoRawEvents table that enforces the same two things
 * PostgreSQL does here: UNIQUE(UserID, EventType, ExternalID) with ON CONFLICT
 * DO NOTHING, and the 65,535 bind-parameter ceiling per statement.
 */

import {
  API_ERROR,
  CRYPTO_EVENT_TYPE,
  CRYPTO_EXCHANGE,
  CRYPTO_SYNC_COMPLETED_WITH_GAPS,
  CRYPTO_SYNC_CUTOFF_GRACE_MS,
  CRYPTO_SYNC_HANDOFF_RESERVE_MS,
  CRYPTO_SYNC_HANDOFF_TIMEOUT_MS,
  CRYPTO_SYNC_INVOCATION_LIMIT_MS,
  CRYPTO_SYNC_MAX_ROUNDS,
  CRYPTO_SYNC_MODE,
  CRYPTO_SYNC_PHASE,
  CRYPTO_SYNC_ROUND_BUDGET_MS,
  CRYPTO_SYNC_STATUS,
  CRYPTO_SYNC_TASK_FAILURE,
  type CryptoSyncMode,
} from '@/constants/finance';

type Row = Record<string, unknown>;

interface MockStoredRow {
  UserID: number;
  Source: string;
  EventType: string;
  ExternalID: string;
  OccurredAt: string;
  RawPayload: Row;
}

const MOCK_PG_MAX_BIND_PARAMS = 65_535;

const mockDb = {
  rows: [] as MockStoredRow[],
  uniqueKeys: new Set<string>(),
  insertParamCounts: [] as number[],
  rejectInserts: false,
  lastTradeIdLookups: 0,
  // Discovery's database source: assets seen in stored events.
  interactedAssetLookups: 0,
};

/**
 * The last-stored-trade-id query over the in-memory table, with the filters
 * the SQL applies: this user's spot trades stored by the Binance API (not a
 * CSV import) whose payload carries a numeric id, highest id per symbol.
 */
function mockLastTradeIds(params: unknown[]): Array<{ Symbol: string; LastTradeID: string }> {
  mockDb.lastTradeIdLookups += 1;
  const [userId, eventType, source] = params as [number, string, string];
  const highest = new Map<string, number>();
  mockDb.rows
    .filter((row) => row.UserID === userId && row.EventType === eventType && row.Source === source)
    .filter((row) => row.RawPayload.csvSource !== true && /^[0-9]+$/.test(String(row.RawPayload.id ?? '')))
    .forEach((row) => {
      const symbol = String(row.RawPayload.symbol);
      highest.set(symbol, Math.max(highest.get(symbol) ?? 0, Number(row.RawPayload.id)));
    });
  return Array.from(highest.entries()).map(([symbol, id]) => ({ Symbol: symbol, LastTradeID: String(id) }));
}

/**
 * The cross-source index query over the in-memory table, as PostgreSQL answers
 * it: every payload key the SQL reads with `"RawPayload"->'key' AS "column"`
 * comes back as that column (NULL when absent), and a reward's full payload
 * only when `EventType:ExternalID` does not match the current-id pattern.
 */
function mockCrossSourceIndex(sql: string, params: unknown[]): Row[] {
  const [userId, rewardTypes, currentIdPattern] = params as [number, string[], string];
  const columns = Array.from(sql.matchAll(/"RawPayload"->'(\w+)' AS "(\w+)"/g), ([, key = '', column = '']) => ({
    key,
    column,
  }));
  const isCurrentId = new RegExp(currentIdPattern);
  return mockDb.rows
    .filter((row) => row.UserID === userId)
    .map((row) => ({
      EventType: row.EventType,
      ExternalID: row.ExternalID,
      ms: String(Date.parse(row.OccurredAt)),
      RewardPayload:
        rewardTypes.includes(row.EventType) && !isCurrentId.test(`${row.EventType}:${row.ExternalID}`)
          ? row.RawPayload
          : null,
      ...Object.fromEntries(columns.map(({ key, column }) => [column, row.RawPayload[key] ?? null])),
    }));
}

async function mockQuery(sql: string, params: unknown[] = []): Promise<unknown[]> {
  if (sql.includes('INSERT INTO "CryptoRawEvents"')) {
    mockDb.insertParamCounts.push(params.length);
    if (params.length > MOCK_PG_MAX_BIND_PARAMS) {
      throw new Error(`too many bind parameters: ${params.length}`);
    }
    if (mockDb.rejectInserts) throw new Error('connection terminated');
    let inserted = 0;
    Array.from({ length: params.length / 7 }, (_, i) => params.slice(i * 7, i * 7 + 7)).forEach((values) => {
      const [userId, source, eventType, externalId, occurredAt, payload] = values;
      const uniqueKey = `${String(userId)}|${String(eventType)}|${String(externalId)}`;
      if (mockDb.uniqueKeys.has(uniqueKey)) return;
      mockDb.uniqueKeys.add(uniqueKey);
      mockDb.rows.push({
        UserID: Number(userId),
        Source: String(source),
        EventType: String(eventType),
        ExternalID: String(externalId),
        OccurredAt: String(occurredAt),
        RawPayload: JSON.parse(String(payload)) as Row,
      });
      inserted += 1;
    });
    return [{ inserted }];
  }
  if (sql.includes('AS "RewardPayload"')) return mockCrossSourceIndex(sql, params);
  if (sql.includes('SELECT DISTINCT asset')) {
    mockDb.interactedAssetLookups += 1;
    return [];
  }
  if (sql.includes('"LastTradeID"')) return mockLastTradeIds(params);
  throw new Error(`unexpected SQL in test: ${sql.slice(0, 80)}`);
}

jest.mock('@/services/database/connection', () => ({
  query: (sql: string, params?: unknown[]) => mockQuery(sql, params),
}));

// ---------- Binance SDK stub ----------

const mockApi = {
  trades: new Map<string, Row[]>(),
  convert: [] as Row[],
  flexRewards: [] as Row[],
  lockedRewards: [] as Row[],
  ethStaking: [] as Row[],
  stakingInterest: [] as Row[],
  depositError: null as unknown,
  withdrawError: null as unknown,
  tradeCalls: [] as Array<{ symbol: string; fromId?: number }>,
  accountCalls: 0,
  // From this call on, GET /api/v3/account answers -2015 (key revoked mid-job).
  accountRefusedFromCall: null as number | null,
  // Windowed task calls, in order, with the window start they asked for.
  calls: [] as Array<{ method: string; startTime: number }>,
  // Runs as each of those calls starts: a test moves the clock from here.
  onCall: null as ((method: string, startTime: number) => void) | null,
  // Runs as each myTrades page is requested; a test throws from here to fail it.
  onTradePage: null as ((symbol: string, fromId?: number) => void) | null,
  // Runs as each GET /api/v3/account call starts, with its number.
  onAccountCall: null as ((call: number) => void) | null,
  // True for a flexible-rewards call that never answers.
  hangCall: null as ((method: string, startTime: number) => boolean) | null,
  // getBalances, the first discovery source: its coins, or what it throws.
  balances: [] as Row[],
  balancesError: null as unknown,
  balancesCalls: 0,
};

const MOCK_METHOD = {
  CONVERT: 'getConvertTradeHistory',
  FLEX: 'getFlexibleRewardsHistory',
  LOCKED: 'getLockedRewardsHistory',
  DEPOSIT: 'getDepositHistory',
  WITHDRAW: 'getWithdrawHistory',
} as const;

function mockNoteCall(method: string, params?: { startTime?: number }): void {
  const startTime = Number(params?.startTime);
  mockApi.calls.push({ method, startTime });
  mockApi.onCall?.(method, startTime);
}

/** The object the SDK's BaseRestClient.parseException throws for a non-2xx answer. */
function mockSdkError(code: number, msg: string): Row {
  return { code, message: msg, body: { code, msg }, headers: {}, requestUrl: 'https://api.binance.com/' };
}

const MOCK_KEY_REFUSED = mockSdkError(-2015, 'Invalid API-key, IP, or permissions for action.');

function mockInWindow(time: unknown, start?: number, end?: number): boolean {
  const t = Number(time);
  return (start == null || t >= start) && (end == null || t <= end);
}

function mockRewardsIn(rows: Row[], p: { startTime: number; endTime: number }): Row[] {
  return rows.filter((row) => mockInWindow(row.time, p.startTime, p.endTime));
}

function mockTradePage(params: { symbol: string; fromId?: number; limit?: number }): Row[] {
  mockApi.onTradePage?.(params.symbol, params.fromId);
  if (mockApi.trades.has(params.symbol)) mockApi.tradeCalls.push({ symbol: params.symbol, fromId: params.fromId });
  const fills = mockApi.trades.get(params.symbol) ?? [];
  const limit = params.limit ?? 500;
  if (params.fromId == null) return fills.slice(-limit);
  const fromId = params.fromId;
  // Binary search for the first fill with id >= fromId (fixtures are sorted by
  // id): a linear scan per page makes the 100-page walks take seconds.
  let lo = 0;
  let hi = fills.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (Number(fills[mid]?.id) < fromId) lo = mid + 1;
    else hi = mid;
  }
  return fills.slice(lo, lo + limit);
}

jest.mock('binance', () => ({
  MainClient: jest.fn().mockImplementation(() => ({
    getBalances: async () => {
      mockApi.balancesCalls += 1;
      if (mockApi.balancesError) throw mockApi.balancesError;
      return mockApi.balances;
    },
    getAccountInformation: async () => {
      mockApi.accountCalls += 1;
      mockApi.onAccountCall?.(mockApi.accountCalls);
      if (mockApi.accountRefusedFromCall != null && mockApi.accountCalls >= mockApi.accountRefusedFromCall) {
        throw MOCK_KEY_REFUSED;
      }
      return { balances: [] };
    },
    getAccountTradeList: async (params: { symbol: string; fromId?: number; limit?: number }) => mockTradePage(params),
    getConvertTradeHistory: async (p: { startTime: number; endTime: number }) => {
      mockNoteCall(MOCK_METHOD.CONVERT, p);
      return { list: mockApi.convert.filter((row) => mockInWindow(row.createTime, p.startTime, p.endTime)) };
    },
    // Binance returns rewards newest first.
    getFlexibleRewardsHistory: async (p: { startTime: number; endTime: number }) => {
      mockNoteCall(MOCK_METHOD.FLEX, p);
      if (mockApi.hangCall?.(MOCK_METHOD.FLEX, p.startTime)) await new Promise(() => undefined);
      const rows = mockApi.flexRewards
        .filter((row) => mockInWindow(row.time, p.startTime, p.endTime))
        .sort((a, b) => Number(b.time) - Number(a.time));
      return { rows, total: rows.length };
    },
    getLockedRewardsHistory: async (p: { startTime: number; endTime: number }) => {
      mockNoteCall(MOCK_METHOD.LOCKED, p);
      return { rows: mockRewardsIn(mockApi.lockedRewards, p) };
    },
    getEthStakingHistory: async (p: { startTime: number; endTime: number }) => ({
      rows: mockRewardsIn(mockApi.ethStaking, p),
    }),
    getStakingHistory: async (p: { startTime: number; endTime: number }) => mockRewardsIn(mockApi.stakingInterest, p),
    getAssetDividendRecord: async () => ({ rows: [], total: 0 }),
    getDepositHistory: async (p?: { startTime?: number }) => {
      mockNoteCall(MOCK_METHOD.DEPOSIT, p);
      if (mockApi.depositError) throw mockApi.depositError;
      return [];
    },
    getWithdrawHistory: async (p?: { startTime?: number }) => {
      mockNoteCall(MOCK_METHOD.WITHDRAW, p);
      if (mockApi.withdrawError) throw mockApi.withdrawError;
      return [];
    },
    getFiatOrderHistory: async () => ({ data: [] }),
    getFiatPaymentsHistory: async () => ({ data: [] }),
    getDustLog: async () => ({ userAssetDribblets: [] }),
    getC2CTradeHistory: async () => ({ data: [] }),
  })),
}));

// A test that must know which task runs when (the round deadline tests) runs
// the tasks one at a time.
const mockLimiter = { sequential: false };

// p-limit ships as ESM only; a minimal limiter keeps the worker's concurrency.
jest.mock('p-limit', () => ({
  __esModule: true,
  default: (concurrency: number) => {
    let active = 0;
    const queue: Array<() => void> = [];
    const next = () => {
      if (active >= (mockLimiter.sequential ? 1 : concurrency)) return;
      const run = queue.shift();
      if (!run) return;
      active += 1;
      run();
    };
    return <T>(fn: () => Promise<T>) =>
      new Promise<T>((resolve, reject) => {
        queue.push(() => {
          fn()
            .then(resolve, reject)
            .finally(() => {
              active -= 1;
              next();
            });
        });
        next();
      });
  },
}));

// ---------- Job / credential repositories ----------

const mockJobs = {
  completed: [] as number[],
  completedWarnings: new Map<number, unknown>(),
  failed: [] as Array<{ jobId: number; code: string; message: string }>,
  // Last Progress written per job, as the JSONB column would hold it.
  progress: new Map<number, Record<string, Row>>(),
  // Last EventsIngested written per job.
  eventsIngested: new Map<number, number>(),
  // Jobs marked running, one entry per call.
  running: [] as number[],
  // What markJobRunning answers: false once the job is no longer pending.
  runningAccepted: true,
  // What each round that ran out of time saved for the next one.
  handOffs: [] as Array<{ jobId: number; progress: Record<string, Row>; eventsIngested: number; state: Row }>,
  // What handOffSyncRound answers: false once the job was cancelled.
  handOffAccepted: true,
  failedUnclaimed: [] as Array<{ jobId: number; round: number; code: string; message: string }>,
  // The jobs waiting in the cron's queue, oldest first, as findNextQueuedSyncJob hands them out.
  queue: [] as Array<{ jobId: number; userId: number; exchange: string }>,
};

jest.mock('@/services/database/CryptoSyncJobsRepository', () => ({
  markJobRunning: jest.fn(async (jobId: number) => {
    mockJobs.running.push(jobId);
    return mockJobs.runningAccepted;
  }),
  handOffSyncRound: jest.fn(async (jobId: number, progress: unknown, eventsIngested: number, state: unknown) => {
    const saved = JSON.parse(JSON.stringify(progress)) as Record<string, Row>;
    mockJobs.handOffs.push({ jobId, progress: saved, eventsIngested, state: JSON.parse(JSON.stringify(state)) as Row });
    mockJobs.progress.set(jobId, saved);
    mockJobs.eventsIngested.set(jobId, eventsIngested);
    return mockJobs.handOffAccepted;
  }),
  failUnclaimedSyncRound: jest.fn(async (jobId: number, round: number, code: string, message: string) => {
    mockJobs.failedUnclaimed.push({ jobId, round, code, message });
    return true;
  }),
  updateJobProgress: jest.fn(async (jobId: number, progress: unknown, eventsIngested: number) => {
    mockJobs.progress.set(jobId, JSON.parse(JSON.stringify(progress)) as Record<string, Row>);
    mockJobs.eventsIngested.set(jobId, eventsIngested);
  }),
  isJobCancelled: jest.fn(async () => false),
  markJobCompleted: jest.fn(async (jobId: number, warning: unknown = null) => {
    mockJobs.completed.push(jobId);
    mockJobs.completedWarnings.set(jobId, warning);
  }),
  markJobFailed: jest.fn(async (jobId: number, code: string, message: string) => {
    mockJobs.failed.push({ jobId, code, message });
  }),
  // The status the job's recorded transitions give it; a job whose hand-off
  // write found it no longer running was cancelled.
  getJobStatus: jest.fn(async (jobId: number) => {
    if (mockJobs.completed.includes(jobId)) return 'completed';
    const failed = [...mockJobs.failed, ...mockJobs.failedUnclaimed].some((failure) => failure.jobId === jobId);
    if (failed) return 'failed';
    return mockJobs.handOffAccepted ? 'running' : 'cancelled';
  }),
  findNextQueuedSyncJob: jest.fn(async () => mockJobs.queue.shift() ?? null),
}));

jest.mock('@/services/database/ExchangeCredentialsRepository', () => ({
  getDecryptedActiveForUser: jest.fn(async () => ({ apiKey: 'key', apiSecret: 'secret' })),
}));

jest.mock('@/services/database/TaxableEventsRepository', () => ({
  countUnnormalisedRawEventsForUser: jest.fn(async () => 0),
}));

jest.mock('@/services/exchanges/binance/NormalizationService', () => ({
  normalizeForUser: jest.fn(async () => ({
    processed: 0,
    inserted: 0,
    skipped: 0,
    failed: 0,
    failures: [],
    stoppedAtDeadline: false,
  })),
}));

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 7),
  AuthError: class AuthError extends Error {},
}));

import { SyncResumeStateSchema } from '@/schemas/crypto';
import { bulkInsertRawEventsForUser, filterCrossSourceDuplicates } from '@/services/database/CryptoRawEventsRepository';
import {
  failUnclaimedSyncRound,
  findNextQueuedSyncJob,
  handOffSyncRound,
} from '@/services/database/CryptoSyncJobsRepository';
import { countUnnormalisedRawEventsForUser } from '@/services/database/TaxableEventsRepository';
import { runSync, type SyncResumePoint } from '@/services/exchanges/binance/BinanceSyncService';
import { binanceCsvImporter } from '@/services/exchanges/binance/CsvImporter';
import { normalizeForUser } from '@/services/exchanges/binance/NormalizationService';
import { syncDebug } from '@/services/exchanges/binance/syncDebug';
import { type SyncBudget, startSyncBudget } from '@/services/exchanges/shared/syncBudget';

// ============================================================
// Helpers
// ============================================================

const USER_ID = 7;
const DAY_MS = 86_400_000;
const T0 = Date.UTC(2025, 0, 1);

let nextJobId = 1;

async function sync(scopeFrom: number, scopeTo: number, mode: CryptoSyncMode = CRYPTO_SYNC_MODE.FULL): Promise<number> {
  const jobId = nextJobId++;
  await runSync({
    userId: USER_ID,
    jobId,
    exchange: CRYPTO_EXCHANGE.BINANCE,
    mode,
    scopeFrom: new Date(scopeFrom),
    scopeTo: new Date(scopeTo),
  });
  return jobId;
}

/** Stores fills the way an earlier API sync did: fetchSpotTrades' payload and ExternalID. */
async function storeApiFills(fills: Row[]): Promise<void> {
  await bulkInsertRawEventsForUser(
    USER_ID,
    fills.map((fill) => ({
      eventType: CRYPTO_EVENT_TYPE.SPOT_TRADE,
      externalId: `${String(fill.symbol)}-${String(fill.id)}`,
      occurredAt: new Date(Number(fill.time)),
      rawPayload: fill,
    })),
    1,
  );
}

function permanentFailuresOf(jobId: number, eventType: string): unknown {
  return mockJobs.progress.get(jobId)?.[eventType]?.permanentFailures;
}

function resumableFailuresOf(jobId: number, eventType: string): unknown {
  return mockJobs.progress.get(jobId)?.[eventType]?.resumableFailures;
}

function duplicatesSkippedOf(jobId: number, eventType: string): unknown {
  return mockJobs.progress.get(jobId)?.[eventType]?.duplicatesSkipped;
}

/** The CSV upload route's ingestion path: import, cross-source filter, insert. */
async function importCsv(csv: string): Promise<{ kept: number; skipped: number }> {
  const { events } = binanceCsvImporter.import(csv, 'binance-export.csv');
  const { kept, skipped } = await filterCrossSourceDuplicates(USER_ID, events);
  await bulkInsertRawEventsForUser(USER_ID, kept, 999);
  return { kept: kept.length, skipped };
}

function rowsOf(eventType: string): MockStoredRow[] {
  return mockDb.rows.filter((row) => row.EventType === eventType);
}

function makeFills(symbol: string, count: number, startMs: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    symbol,
    id: 5_000_000 + i * 1_237,
    orderId: 10_000 + i,
    price: '95000',
    qty: '0.001',
    quoteQty: '95',
    commission: '0',
    commissionAsset: 'BNB',
    isBuyer: true,
    isMaker: false,
    time: startMs + i * 30_000,
  }));
}

// Stands in for the continue route; a test sets the answer it needs.
const mockFetch = jest.fn();

function resetWorld(): void {
  mockDb.rows = [];
  mockDb.uniqueKeys = new Set<string>();
  mockDb.insertParamCounts = [];
  mockDb.rejectInserts = false;
  mockApi.trades.clear();
  mockApi.convert = [];
  mockApi.flexRewards = [];
  mockApi.lockedRewards = [];
  mockApi.ethStaking = [];
  mockApi.stakingInterest = [];
  mockApi.depositError = null;
  mockApi.withdrawError = null;
  mockApi.tradeCalls = [];
  mockApi.accountCalls = 0;
  mockApi.accountRefusedFromCall = null;
  mockDb.lastTradeIdLookups = 0;
  mockJobs.completed = [];
  mockJobs.completedWarnings = new Map();
  mockJobs.failed = [];
  mockJobs.progress = new Map();
  mockJobs.eventsIngested = new Map();
  mockJobs.running = [];
  mockJobs.runningAccepted = true;
  mockJobs.handOffs = [];
  mockJobs.handOffAccepted = true;
  mockJobs.failedUnclaimed = [];
  mockJobs.queue = [];
  mockApi.calls = [];
  mockApi.onCall = null;
  mockApi.onTradePage = null;
  mockApi.onAccountCall = null;
  mockApi.hangCall = null;
  mockApi.balances = [];
  mockApi.balancesError = null;
  mockApi.balancesCalls = 0;
  mockDb.interactedAssetLookups = 0;
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ status: 202 });
}

beforeEach(resetWorld);

// ============================================================
// CRYPTO-INGEST-01 / 02 — spot history and chunked insert
// ============================================================

describe('spot trade ingestion', () => {
  it('stores every fill of a symbol with more fills than one INSERT can carry', async () => {
    mockApi.trades.set('BTCUSDT', makeFills('BTCUSDT', 10_000, T0));

    const jobId = await sync(T0, T0 + 10 * DAY_MS);

    const stored = rowsOf(CRYPTO_EVENT_TYPE.SPOT_TRADE);
    expect(stored).toHaveLength(10_000);
    expect(new Set(stored.map((row) => row.ExternalID)).size).toBe(10_000);
    expect(Math.max(...mockDb.insertParamCounts)).toBeLessThanOrEqual(MOCK_PG_MAX_BIND_PARAMS);
    expect(mockJobs.completed).toEqual([jobId]);
    expect(mockJobs.failed).toEqual([]);
  });

  it('keeps two distinct API fills that look alike instead of treating one as a duplicate', async () => {
    const [first, second] = makeFills('BTCUSDT', 2, T0);
    if (!first || !second) throw new Error('fixture must have two fills');
    mockApi.trades.set('BTCUSDT', [first]);
    await sync(T0, T0 + DAY_MS);
    // Same second, qty and side as the stored fill, but another trade id.
    mockApi.trades.set('BTCUSDT', [first, { ...second, time: first.time }]);

    await sync(T0, T0 + DAY_MS);

    expect(rowsOf(CRYPTO_EVENT_TYPE.SPOT_TRADE)).toHaveLength(2);
  });
});

describe('a job that could not fetch everything', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it('ends failed, not completed, when an endpoint fails', async () => {
    mockApi.depositError = { code: -1000, msg: 'An unknown error occurred while processing the request.' };

    const jobId = await sync(T0, T0 + 10 * DAY_MS);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`Sync job ${jobId} failed`));
    expect(mockJobs.completed).toEqual([]);
    expect(mockJobs.failed).toEqual([
      expect.objectContaining({
        jobId,
        code: API_ERROR.CRYPTO.SYNC_FAILED,
        message: expect.stringContaining('deposit'),
      }),
    ]);
  });

  it('ends failed, not completed, when the raw events cannot be stored', async () => {
    mockApi.trades.set('BTCUSDT', makeFills('BTCUSDT', 3, T0));
    mockDb.rejectInserts = true;

    const jobId = await sync(T0, T0 + 10 * DAY_MS);

    expect(mockJobs.completed).toEqual([]);
    expect(mockJobs.failed).toEqual([expect.objectContaining({ jobId, code: API_ERROR.CRYPTO.SYNC_FAILED })]);
  });

  it('ends failed when a trade page carries a fill without an id, instead of completing with a history gap', async () => {
    // A malformed answer: the next run may get a good one, so the anchor stays.
    const fills = makeFills('BTCUSDT', 1_000, T0);
    fills[500] = { ...fills[500], id: undefined };
    mockApi.trades.set('BTCUSDT', fills);

    const jobId = await sync(T0, T0 + 10 * DAY_MS);

    expect(mockJobs.completed).toEqual([]);
    expect(mockJobs.failed).toEqual([
      expect.objectContaining({
        jobId,
        code: API_ERROR.CRYPTO.SYNC_FAILED,
        message: expect.stringContaining(`spot_trade/${CRYPTO_SYNC_TASK_FAILURE.TRADE_WITHOUT_ID} ×1: BTCUSDT`),
      }),
    ]);
    expect(permanentFailuresOf(jobId, CRYPTO_EVENT_TYPE.SPOT_TRADE)).toBeUndefined();
  });
});

// ============================================================
// Failures that every run would repeat do not freeze the anchor
// ============================================================

describe('a job whose only failures would repeat on every run', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it('completes, and reports the endpoint, when Binance refuses one endpoint to a key it accepts', async () => {
    mockApi.depositError = MOCK_KEY_REFUSED;

    const jobId = await sync(T0, T0 + 10 * DAY_MS);

    expect(mockJobs.failed).toEqual([]);
    expect(mockJobs.completed).toEqual([jobId]);
    expect(mockJobs.completedWarnings.get(jobId)).toEqual({
      code: CRYPTO_SYNC_COMPLETED_WITH_GAPS,
      message: expect.stringContaining('deposit'),
    });
    expect(permanentFailuresOf(jobId, CRYPTO_EVENT_TYPE.DEPOSIT)).toEqual([
      { code: CRYPTO_SYNC_TASK_FAILURE.ENDPOINT_NOT_PERMITTED, count: 1, symbols: [] },
    ]);
  });

  it('fails when the key itself stops being accepted during the job', async () => {
    // The refusal can then be a revoked key or a new IP whitelist rather than
    // this endpoint, and completing would move the anchor past the missing data.
    mockApi.depositError = MOCK_KEY_REFUSED;
    mockApi.accountRefusedFromCall = 2;

    const jobId = await sync(T0, T0 + 10 * DAY_MS);

    expect(mockJobs.completed).toEqual([]);
    expect(mockJobs.failed).toEqual([
      expect.objectContaining({
        jobId,
        code: API_ERROR.CRYPTO.SYNC_FAILED,
        message: expect.stringContaining('deposit'),
      }),
    ]);
    expect(permanentFailuresOf(jobId, CRYPTO_EVENT_TYPE.DEPOSIT)).toBeUndefined();
  });

  it('still fails when a transient failure comes with them, and keeps the permanent gap on record', async () => {
    mockApi.depositError = MOCK_KEY_REFUSED;
    mockApi.withdrawError = mockSdkError(-1000, 'An unknown error occurred while processing the request.');

    const jobId = await sync(T0, T0 + 10 * DAY_MS);

    expect(mockJobs.completed).toEqual([]);
    expect(mockJobs.failed).toEqual([expect.objectContaining({ jobId, code: API_ERROR.CRYPTO.SYNC_FAILED })]);
    const { message } = mockJobs.failed[0] ?? { message: '' };
    expect(message).toContain(`${CRYPTO_EVENT_TYPE.DEPOSIT}/${CRYPTO_SYNC_TASK_FAILURE.ENDPOINT_NOT_PERMITTED}`);
    expect(message).toContain(`${CRYPTO_EVENT_TYPE.WITHDRAW}/`);
    expect(permanentFailuresOf(jobId, CRYPTO_EVENT_TYPE.DEPOSIT)).toEqual([
      { code: CRYPTO_SYNC_TASK_FAILURE.ENDPOINT_NOT_PERMITTED, count: 1, symbols: [] },
    ]);
  });
});

// ============================================================
// A spot pair too busy to walk in one run is stored across runs
// ============================================================

describe('a spot pair with more fills than one run may walk', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    warn.mockRestore();
  });

  // More fills in scope than the forward walk may page through from fromId=0:
  // its 100 pages of 1,000 end at fill 99,999, and the recent page starts at
  // fill 100,500.
  const BUSY_PAIR_FILLS = 101_500;
  const WALK_CAP_FILLS = 100_000;

  function apiIdsOf(symbol: string): number[] {
    return rowsOf(CRYPTO_EVENT_TYPE.SPOT_TRADE)
      .filter((row) => row.RawPayload.symbol === symbol && row.RawPayload.csvSource !== true)
      .map((row) => Number(row.RawPayload.id));
  }

  it('completes, stores the fills it walked, and reports the pair as continuing next run', async () => {
    const btc = makeFills('BTCUSDT', BUSY_PAIR_FILLS, T0);
    mockApi.trades.set('BTCUSDT', btc);
    mockApi.trades.set('ETHUSDT', makeFills('ETHUSDT', 3, T0));

    const jobId = await sync(T0, T0 + 40 * DAY_MS);

    expect(mockJobs.failed).toEqual([]);
    expect(mockJobs.completed).toEqual([jobId]);
    expect(mockJobs.completedWarnings.get(jobId)).toEqual({
      code: CRYPTO_SYNC_COMPLETED_WITH_GAPS,
      message: expect.stringContaining(
        `${CRYPTO_EVENT_TYPE.SPOT_TRADE}/${CRYPTO_SYNC_TASK_FAILURE.HISTORY_RESUMES_NEXT_RUN} ×1: BTCUSDT`,
      ),
    });
    expect(resumableFailuresOf(jobId, CRYPTO_EVENT_TYPE.SPOT_TRADE)).toEqual([
      { code: CRYPTO_SYNC_TASK_FAILURE.HISTORY_RESUMES_NEXT_RUN, count: 1, symbols: ['BTCUSDT'] },
    ]);
    expect(permanentFailuresOf(jobId, CRYPTO_EVENT_TYPE.SPOT_TRADE)).toBeUndefined();
    // Every fill from the first one on, in one piece; the recent page is not
    // stored, or the next run would resume after it and skip the fills between.
    expect(apiIdsOf('BTCUSDT')).toEqual(btc.slice(0, WALK_CAP_FILLS).map((fill) => Number(fill.id)));
    expect(apiIdsOf('ETHUSDT')).toHaveLength(3);
  });

  it('the next incremental sync resumes after the walked fills and brings the rest', async () => {
    const btc = makeFills('BTCUSDT', BUSY_PAIR_FILLS, T0);
    mockApi.trades.set('BTCUSDT', btc);
    const firstJobId = await sync(T0, T0 + 40 * DAY_MS);
    mockApi.tradeCalls = [];

    const jobId = await sync(T0 + 30 * DAY_MS, T0 + 40 * DAY_MS, CRYPTO_SYNC_MODE.INCREMENTAL);

    expect(mockApi.tradeCalls).toEqual([
      { symbol: 'BTCUSDT', fromId: Number(btc[WALK_CAP_FILLS - 1]?.id) + 1 },
      { symbol: 'BTCUSDT', fromId: Number(btc[WALK_CAP_FILLS + 999]?.id) + 1 },
    ]);
    expect(mockJobs.completed).toEqual([firstJobId, jobId]);
    expect(mockJobs.completedWarnings.get(jobId)).toBeNull();
    expect(apiIdsOf('BTCUSDT')).toEqual(btc.map((fill) => Number(fill.id)));
  });

  it('a full sync that stops below fills an earlier run stored calls the gap permanent, and still stores what it walked', async () => {
    // What every API sync before 2026-09-29 left behind: the newest page only.
    // The next incremental sync resumes above it, so the fills between the
    // walk and that page would never be fetched.
    const btc = makeFills('BTCUSDT', BUSY_PAIR_FILLS, T0);
    mockApi.trades.set('BTCUSDT', btc);
    await storeApiFills(btc.slice(-1_000));

    const jobId = await sync(T0, T0 + 40 * DAY_MS, CRYPTO_SYNC_MODE.FULL);

    expect(mockJobs.completed).toEqual([jobId]);
    expect(mockJobs.completedWarnings.get(jobId)).toEqual({
      code: CRYPTO_SYNC_COMPLETED_WITH_GAPS,
      message: expect.stringContaining(
        `${CRYPTO_EVENT_TYPE.SPOT_TRADE}/${CRYPTO_SYNC_TASK_FAILURE.HISTORY_TRUNCATED} ×1: BTCUSDT`,
      ),
    });
    expect(permanentFailuresOf(jobId, CRYPTO_EVENT_TYPE.SPOT_TRADE)).toEqual([
      { code: CRYPTO_SYNC_TASK_FAILURE.HISTORY_TRUNCATED, count: 1, symbols: ['BTCUSDT'] },
    ]);
    expect(resumableFailuresOf(jobId, CRYPTO_EVENT_TYPE.SPOT_TRADE)).toBeUndefined();
    expect(apiIdsOf('BTCUSDT')).toHaveLength(WALK_CAP_FILLS + 1_000);
  });

  it('the walked fills go through the cross-source filter like any other', async () => {
    // The walked fill at the CSV trade's second is the CSV's BTC buy: same
    // second, quantity and side (makeFills spaces fills 30 s apart).
    const btc = makeFills('BTCUSDT', BUSY_PAIR_FILLS, T0);
    const csvTwin = btc[(TRADE_MS - T0) / 30_000];
    expect(csvTwin?.time).toBe(TRADE_MS);
    mockApi.trades.set('BTCUSDT', btc);
    await importCsv(CSV);

    const jobId = await sync(T0, T0 + 40 * DAY_MS);

    expect(duplicatesSkippedOf(jobId, CRYPTO_EVENT_TYPE.SPOT_TRADE)).toBe(1);
    const stored = apiIdsOf('BTCUSDT');
    expect(stored).toHaveLength(WALK_CAP_FILLS - 1);
    expect(stored).not.toContain(Number(csvTwin?.id));
  });

  /** Stores what a CSV import of these BTCUSDT buys leaves: same second, pair, side and size. */
  function storeCsvTwins(fills: Row[]): void {
    fills.forEach((fill, i) => {
      mockDb.rows.push({
        UserID: USER_ID,
        Source: CRYPTO_EXCHANGE.BINANCE,
        EventType: CRYPTO_EVENT_TYPE.SPOT_TRADE,
        ExternalID: `csv-spot-twin-${i}`,
        OccurredAt: new Date(Number(fill.time)).toISOString(),
        RawPayload: {
          symbol: 'BTCUSDT',
          baseAsset: 'BTC',
          quoteAsset: 'USDT',
          isBuyer: true,
          qty: fill.qty,
          quoteQty: fill.quoteQty,
          commission: '0',
          commissionAsset: null,
          time: fill.time,
          csvSource: true,
        },
      });
    });
  }

  it('an incremental walk whose every fill a CSV already holds is a permanent gap, not one the next sync continues', async () => {
    // Nothing the walk fetched is stored for the API, so the resume point stays
    // at btc[0] and every run would walk the same 100 pages into the same cap.
    const btc = makeFills('BTCUSDT', BUSY_PAIR_FILLS, T0);
    mockApi.trades.set('BTCUSDT', btc);
    await storeApiFills(btc.slice(0, 1));
    // The walk resumes after btc[0]; its 100 pages end at btc[WALK_CAP_FILLS].
    storeCsvTwins(btc.slice(1, WALK_CAP_FILLS + 1));

    const jobId = await sync(T0, T0 + 40 * DAY_MS, CRYPTO_SYNC_MODE.INCREMENTAL);

    expect(mockJobs.completed).toEqual([jobId]);
    expect(duplicatesSkippedOf(jobId, CRYPTO_EVENT_TYPE.SPOT_TRADE)).toBe(WALK_CAP_FILLS);
    expect(apiIdsOf('BTCUSDT')).toEqual([Number(btc[0]?.id)]);
    expect(permanentFailuresOf(jobId, CRYPTO_EVENT_TYPE.SPOT_TRADE)).toEqual([
      { code: CRYPTO_SYNC_TASK_FAILURE.HISTORY_TRUNCATED, count: 1, symbols: ['BTCUSDT'] },
    ]);
    expect(resumableFailuresOf(jobId, CRYPTO_EVENT_TYPE.SPOT_TRADE)).toBeUndefined();
  });

  it('an incremental walk that stores at least one fill the CSV lacks is still continued by the next sync', async () => {
    const btc = makeFills('BTCUSDT', BUSY_PAIR_FILLS, T0);
    mockApi.trades.set('BTCUSDT', btc);
    await storeApiFills(btc.slice(0, 1));
    // The CSV holds every walked fill but the newest, btc[WALK_CAP_FILLS].
    storeCsvTwins(btc.slice(1, WALK_CAP_FILLS));

    const jobId = await sync(T0, T0 + 40 * DAY_MS, CRYPTO_SYNC_MODE.INCREMENTAL);

    expect(mockJobs.completed).toEqual([jobId]);
    expect(apiIdsOf('BTCUSDT')).toEqual([Number(btc[0]?.id), Number(btc[WALK_CAP_FILLS]?.id)]);
    expect(resumableFailuresOf(jobId, CRYPTO_EVENT_TYPE.SPOT_TRADE)).toEqual([
      { code: CRYPTO_SYNC_TASK_FAILURE.HISTORY_RESUMES_NEXT_RUN, count: 1, symbols: ['BTCUSDT'] },
    ]);
    expect(permanentFailuresOf(jobId, CRYPTO_EVENT_TYPE.SPOT_TRADE)).toBeUndefined();
  });

  it('a walk whose fills the database refused stays resumable: the next run stores the same fills', async () => {
    mockApi.trades.set('BTCUSDT', makeFills('BTCUSDT', BUSY_PAIR_FILLS, T0));
    mockDb.rejectInserts = true;

    const jobId = await sync(T0, T0 + 40 * DAY_MS);

    expect(mockJobs.failed).toEqual([expect.objectContaining({ jobId, code: API_ERROR.CRYPTO.SYNC_FAILED })]);
    const { message } = mockJobs.failed[0] ?? { message: '' };
    expect(message).toContain(`${CRYPTO_EVENT_TYPE.SPOT_TRADE}/${CRYPTO_SYNC_TASK_FAILURE.INSERT_FAILED}`);
    expect(resumableFailuresOf(jobId, CRYPTO_EVENT_TYPE.SPOT_TRADE)).toEqual([
      { code: CRYPTO_SYNC_TASK_FAILURE.HISTORY_RESUMES_NEXT_RUN, count: 1, symbols: ['BTCUSDT'] },
    ]);
    expect(permanentFailuresOf(jobId, CRYPTO_EVENT_TYPE.SPOT_TRADE)).toBeUndefined();
  });

  it('still fails when a transient failure comes with it, and keeps the walked fills and the gap on record', async () => {
    mockApi.trades.set('BTCUSDT', makeFills('BTCUSDT', BUSY_PAIR_FILLS, T0));
    mockApi.depositError = mockSdkError(-1000, 'An unknown error occurred while processing the request.');

    const jobId = await sync(T0, T0 + 40 * DAY_MS);

    expect(mockJobs.completed).toEqual([]);
    expect(mockJobs.failed).toEqual([expect.objectContaining({ jobId, code: API_ERROR.CRYPTO.SYNC_FAILED })]);
    const { message } = mockJobs.failed[0] ?? { message: '' };
    expect(message).toContain(`${CRYPTO_EVENT_TYPE.SPOT_TRADE}/${CRYPTO_SYNC_TASK_FAILURE.HISTORY_RESUMES_NEXT_RUN}`);
    expect(message).toContain(`${CRYPTO_EVENT_TYPE.DEPOSIT}/`);
    expect(resumableFailuresOf(jobId, CRYPTO_EVENT_TYPE.SPOT_TRADE)).toEqual([
      { code: CRYPTO_SYNC_TASK_FAILURE.HISTORY_RESUMES_NEXT_RUN, count: 1, symbols: ['BTCUSDT'] },
    ]);
    expect(apiIdsOf('BTCUSDT')).toHaveLength(WALK_CAP_FILLS);
  });
});

// ============================================================
// EventsIngested is written the same way whatever the outcome
// ============================================================

describe('EventsIngested at the end of a job', () => {
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    warn.mockRestore();
    log.mockRestore();
  });

  it.each([
    [CRYPTO_SYNC_STATUS.COMPLETED, null],
    [CRYPTO_SYNC_STATUS.FAILED, mockSdkError(-1000, 'An unknown error occurred while processing the request.')],
  ])('a %s job keeps the events normalised on top of the raw ones', async (status, depositError) => {
    mockApi.trades.set('BTCUSDT', makeFills('BTCUSDT', 3, T0));
    mockApi.depositError = depositError;
    jest.mocked(countUnnormalisedRawEventsForUser).mockResolvedValueOnce(3);
    jest.mocked(normalizeForUser).mockImplementationOnce(async (_userId, onProgress) => {
      await onProgress?.(3, 2);
      return { processed: 3, inserted: 2, skipped: 0, failed: 0, failures: [], stoppedAtDeadline: false };
    });

    const jobId = await sync(T0, T0 + 10 * DAY_MS);

    const finished = status === CRYPTO_SYNC_STATUS.FAILED ? mockJobs.failed.map((f) => f.jobId) : mockJobs.completed;
    expect(finished).toEqual([jobId]);
    expect(mockJobs.eventsIngested.get(jobId)).toBe(3 + 2);
  });
});

// ============================================================
// Incremental spot sync resumes from the newest stored fill
// ============================================================

describe('spot trades in an incremental sync', () => {
  it('resume each pair after its newest API fill, with one lookup for every pair', async () => {
    // BTCUSDT is too busy to walk from its first fill: with fromId=0 the task
    // fails with history_truncated on every incremental run.
    const btc = makeFills('BTCUSDT', 101_500, T0);
    // ETHUSDT's new fills are older than the incremental scope start: an
    // earlier run stored up to eth[39] and nothing since, so they are missing
    // data and must come in anyway.
    const eth = makeFills('ETHUSDT', 50, T0 + 30 * DAY_MS);
    mockApi.trades.set('BTCUSDT', btc);
    mockApi.trades.set('ETHUSDT', eth);
    await storeApiFills([...btc.slice(100_990, 101_000), ...eth.slice(0, 40)]);
    // CSV rows carry no Binance trade id and never move the starting point.
    const csv = await importCsv(CSV);
    expect(csv.kept).toBe(3);
    const lastBtcId = Number(btc[100_999]?.id);
    const lastEthId = Number(eth[39]?.id);
    const scopeFrom = Number(btc[100_999]?.time) - DAY_MS;

    const jobId = await sync(scopeFrom, T0 + 40 * DAY_MS, CRYPTO_SYNC_MODE.INCREMENTAL);

    expect(mockJobs.failed).toEqual([]);
    expect(mockJobs.completed).toEqual([jobId]);
    expect(mockDb.lastTradeIdLookups).toBe(1);
    const callsFor = (symbol: string) => mockApi.tradeCalls.filter((call) => call.symbol === symbol);
    expect(callsFor('BTCUSDT')).toEqual([{ symbol: 'BTCUSDT', fromId: lastBtcId + 1 }]);
    expect(callsFor('ETHUSDT')).toEqual([{ symbol: 'ETHUSDT', fromId: lastEthId + 1 }]);
    const apiRows = rowsOf(CRYPTO_EVENT_TYPE.SPOT_TRADE).filter((row) => row.RawPayload.csvSource !== true);
    const idsOf = (symbol: string) =>
      apiRows.filter((row) => row.RawPayload.symbol === symbol).map((row) => Number(row.RawPayload.id));
    expect(idsOf('BTCUSDT').sort((a, b) => a - b)).toEqual(btc.slice(100_990).map((fill) => Number(fill.id)));
    expect(idsOf('ETHUSDT').sort((a, b) => a - b)).toEqual(eth.map((fill) => Number(fill.id)));
  });

  it('a full sync still walks each pair from its first fill', async () => {
    const btc = makeFills('BTCUSDT', 20, T0);
    mockApi.trades.set('BTCUSDT', btc);
    await storeApiFills(btc.slice(0, 5));

    await sync(T0, T0 + 10 * DAY_MS);

    // The stored pairs are still looked up, to be fetched; their ids are not used.
    expect(mockDb.lastTradeIdLookups).toBe(1);
    expect(mockApi.tradeCalls).toEqual([{ symbol: 'BTCUSDT', fromId: undefined }]);
    expect(rowsOf(CRYPTO_EVENT_TYPE.SPOT_TRADE)).toHaveLength(20);
  });

  // XYZ is in no discovery source: no balance, no reward or transfer, not in the
  // top-40 fallback. Only the fills an earlier API sync stored say the pair exists.
  it.each([
    [CRYPTO_SYNC_MODE.INCREMENTAL, 'resumes after the stored fill'],
    [CRYPTO_SYNC_MODE.FULL, 'walks it from its first fill'],
  ])('keeps fetching a pair whose coin was sold off (%s sync %s)', async (mode, _behaviour) => {
    const xyz = makeFills('XYZUSDT', 8, T0);
    mockApi.trades.set('XYZUSDT', xyz);
    await storeApiFills(xyz.slice(0, 5));

    await sync(T0, T0 + 10 * DAY_MS, mode);

    const expectedFromId = mode === CRYPTO_SYNC_MODE.INCREMENTAL ? Number(xyz[4]?.id) + 1 : undefined;
    expect(mockApi.tradeCalls.filter((call) => call.symbol === 'XYZUSDT')).toEqual([
      { symbol: 'XYZUSDT', fromId: expectedFromId },
    ]);
    const stored = rowsOf(CRYPTO_EVENT_TYPE.SPOT_TRADE).filter((row) => row.RawPayload.symbol === 'XYZUSDT');
    expect(stored).toHaveLength(8);
  });
});

// ============================================================
// CRYPTO-INGEST-03 / 04 / 05 — cross-source dedup on both paths
// ============================================================

const TRADE_SECOND = '2025-01-03 10:00:00';
const TRADE_MS = Date.UTC(2025, 0, 3, 10, 0, 0);
const CONVERT_MS = Date.UTC(2025, 0, 4, 9, 30, 0);
const REWARD_MS = Date.UTC(2025, 0, 5, 0, 0, 0);

const CSV = [
  'User_ID,UTC_Time,Account,Operation,Coin,Change,Remark',
  `1,${TRADE_SECOND},Spot,Transaction Buy,BTC,0.001,`,
  `1,${TRADE_SECOND},Spot,Transaction Spend,USDT,-95,`,
  '1,2025-01-04 09:30:00,Spot,Binance Convert,ETH,-0.5,',
  '1,2025-01-04 09:30:00,Spot,Binance Convert,USDC,1650,',
  '1,2025-01-05 00:00:00,Earn,Simple Earn Flexible Interest,BTC,0.00000120,',
].join('\n');

function seedApiWithTheCsvOperations(): void {
  mockApi.trades.set('BTCUSDT', [
    {
      symbol: 'BTCUSDT',
      id: 4_242_424,
      orderId: 77,
      price: '95000',
      qty: '0.001',
      quoteQty: '95',
      commission: '0',
      commissionAsset: 'BNB',
      isBuyer: true,
      isMaker: false,
      time: TRADE_MS,
    },
  ]);
  mockApi.convert = [
    {
      quoteId: 'q1',
      orderId: 900_001,
      orderStatus: 'SUCCESS',
      fromAsset: 'ETH',
      fromAmount: '0.5',
      toAsset: 'USDC',
      toAmount: '1650',
      ratio: '3300',
      inverseRatio: '0.0003',
      createTime: CONVERT_MS,
    },
  ];
  mockApi.flexRewards = [
    { asset: 'BTC', rewards: '0.00000120', projectId: 'BTC001', type: 'REALTIME', time: REWARD_MS },
  ];
}

describe('cross-source dedup', () => {
  it('an API sync after a CSV import does not store the same operations again', async () => {
    const csvResult = await importCsv(CSV);
    expect(csvResult.kept).toBe(3);
    seedApiWithTheCsvOperations();
    // An operation the CSV does not have must still come in.
    mockApi.flexRewards.push({
      asset: 'BTC',
      rewards: '0.00000130',
      projectId: 'BTC001',
      type: 'REALTIME',
      time: REWARD_MS + DAY_MS,
    });

    await sync(T0, T0 + 10 * DAY_MS);

    expect(rowsOf(CRYPTO_EVENT_TYPE.SPOT_TRADE)).toHaveLength(1);
    expect(rowsOf(CRYPTO_EVENT_TYPE.CONVERT)).toHaveLength(1);
    expect(rowsOf(CRYPTO_EVENT_TYPE.DIVIDEND)).toHaveLength(1);
    expect(rowsOf(CRYPTO_EVENT_TYPE.EARN_FLEX).map((row) => row.RawPayload.rewards)).toEqual(['0.00000130']);
  });

  it('an API sync records how many fetched events each endpoint dropped as already stored', async () => {
    // A wrongly dropped event must leave a trace, in the job and in the debug log.
    const endpointSummary = jest.spyOn(syncDebug, 'endpointSummary');
    await importCsv(CSV);
    seedApiWithTheCsvOperations();

    const jobId = await sync(T0, T0 + 10 * DAY_MS);

    expect(duplicatesSkippedOf(jobId, CRYPTO_EVENT_TYPE.SPOT_TRADE)).toBe(1);
    expect(duplicatesSkippedOf(jobId, CRYPTO_EVENT_TYPE.CONVERT)).toBe(1);
    expect(duplicatesSkippedOf(jobId, CRYPTO_EVENT_TYPE.EARN_FLEX)).toBe(1);
    expect(duplicatesSkippedOf(jobId, CRYPTO_EVENT_TYPE.DEPOSIT)).toBeUndefined();
    expect(endpointSummary).toHaveBeenCalledWith(CRYPTO_EVENT_TYPE.SPOT_TRADE, 1, 0, expect.any(Number), 1);
    expect(endpointSummary).toHaveBeenCalledWith(CRYPTO_EVENT_TYPE.DEPOSIT, 0, 0, expect.any(Number), 0);
    endpointSummary.mockRestore();
  });

  it('a CSV import after an API sync recognises the Earn reward as well as the trade and the convert', async () => {
    seedApiWithTheCsvOperations();
    await sync(T0, T0 + 10 * DAY_MS);
    expect(mockDb.rows).toHaveLength(3);

    const csvResult = await importCsv(CSV);

    expect(csvResult).toEqual({ kept: 0, skipped: 3 });
    expect(mockDb.rows).toHaveLength(3);
  });

  it('an API sync keeps the second of two same-size fills of one second when the CSV held only one', async () => {
    await importCsv(CSV);
    seedApiWithTheCsvOperations();
    const [fill] = mockApi.trades.get('BTCUSDT') ?? [];
    if (!fill) throw new Error('fixture must have the fill of the CSV trade');
    // Another trade of the same second, side and size: its own trade id.
    mockApi.trades.set('BTCUSDT', [fill, { ...fill, id: Number(fill.id) + 1, orderId: 78 }]);

    await sync(T0, T0 + 10 * DAY_MS);

    const spot = rowsOf(CRYPTO_EVENT_TYPE.SPOT_TRADE);
    expect(spot).toHaveLength(2);
    expect(spot.filter((row) => row.RawPayload.csvSource !== true)).toHaveLength(1);
  });

  it('a second CSV export that lists the fills of a second in another order stores none of them twice', async () => {
    // Fill ids depend on the position inside the second, so the second export
    // gives both fills ids the first one did not store.
    const header = 'User_ID,UTC_Time,Account,Operation,Coin,Change,Remark';
    const small = [
      `1,${TRADE_SECOND},Spot,Transaction Buy,BTC,0.001,`,
      `1,${TRADE_SECOND},Spot,Transaction Spend,USDT,-95,`,
    ];
    const large = [
      `1,${TRADE_SECOND},Spot,Transaction Buy,BTC,0.002,`,
      `1,${TRADE_SECOND},Spot,Transaction Spend,USDT,-190,`,
    ];
    await importCsv([header, ...small, ...large].join('\n'));
    expect(rowsOf(CRYPTO_EVENT_TYPE.SPOT_TRADE)).toHaveLength(2);

    const reordered = await importCsv([header, ...large, ...small].join('\n'));

    expect(reordered).toEqual({ kept: 0, skipped: 2 });
    expect(rowsOf(CRYPTO_EVENT_TYPE.SPOT_TRADE).map((row) => row.RawPayload.qty)).toEqual(['0.001', '0.002']);
  });

  it('re-importing a file adds the same-size fill of a second that the first import lacked', async () => {
    // The first file had one fill of the second; the second export has both.
    const header = 'User_ID,UTC_Time,Account,Operation,Coin,Change,Remark';
    const fill = [
      `1,${TRADE_SECOND},Spot,Transaction Buy,BTC,0.001,`,
      `1,${TRADE_SECOND},Spot,Transaction Spend,USDT,-95,`,
    ];
    await importCsv([header, ...fill].join('\n'));

    await importCsv([header, ...fill, ...fill].join('\n'));

    expect(rowsOf(CRYPTO_EVENT_TYPE.SPOT_TRADE)).toHaveLength(2);
  });
});

// ============================================================
// CRYPTO-INGEST-06 — reward ExternalIDs survive overlapping windows
// ============================================================

describe('Earn rewards across overlapping sync windows', () => {
  it('a second sync that overlaps the first inserts no reward twice', async () => {
    const days = 41; // 1 Jan → 10 Feb
    mockApi.flexRewards = Array.from({ length: days }, (_, day) => day).flatMap((day) => [
      { asset: 'BTC', rewards: `0.0000${100 + day}`, projectId: 'BTC001', type: 'REALTIME', time: T0 + day * DAY_MS },
      { asset: 'ETH', rewards: `0.000${100 + day}`, projectId: 'ETH001', type: 'REALTIME', time: T0 + day * DAY_MS },
    ]);

    await sync(T0, T0 + 30 * DAY_MS);
    await sync(T0 + 19 * DAY_MS, T0 + 40 * DAY_MS);

    expect(rowsOf(CRYPTO_EVENT_TYPE.EARN_FLEX)).toHaveLength(days * 2);
  });
});

describe('rewards stored under the earlier position-based ExternalID', () => {
  // The ids the client gave these rewards while the id still carried the row
  // index. No fetch produces them again.
  const LEGACY_FLEX_ID = `BTC001-${REWARD_MS}-BTC-0`;
  const flex = { asset: 'BTC', rewards: '0.00000120', projectId: 'BTC001', type: 'REALTIME', time: REWARD_MS };
  const locked = {
    positionId: '777',
    asset: 'DOT',
    amount: '0.0123',
    lockPeriod: '60',
    type: 'Locked Rewards',
    time: REWARD_MS,
  };
  const eth = {
    asset: 'ETH',
    amount: '1.5',
    distributeAmount: '1.49',
    status: 'PENDING',
    conversionRatio: '1',
    time: REWARD_MS,
  };
  const interest = {
    positionId: '55',
    asset: 'ADA',
    amount: '0.9',
    type: 'INTEREST',
    status: 'SUCCESS',
    time: REWARD_MS,
  };

  async function storeUnderLegacyIds(): Promise<void> {
    const occurredAt = new Date(REWARD_MS);
    await bulkInsertRawEventsForUser(
      USER_ID,
      [
        { eventType: CRYPTO_EVENT_TYPE.EARN_FLEX, externalId: LEGACY_FLEX_ID, occurredAt, rawPayload: flex },
        {
          eventType: CRYPTO_EVENT_TYPE.EARN_LOCKED,
          externalId: `777-${REWARD_MS}-DOT-0`,
          occurredAt,
          rawPayload: locked,
        },
        { eventType: CRYPTO_EVENT_TYPE.ETH_STAKING, externalId: `eth-${REWARD_MS}-0`, occurredAt, rawPayload: eth },
        {
          eventType: CRYPTO_EVENT_TYPE.STAKING_INTEREST,
          externalId: `staking-${REWARD_MS}-ADA-0`,
          occurredAt,
          rawPayload: interest,
        },
      ],
      1,
    );
  }

  it('a sync that returns them again does not store them a second time', async () => {
    await storeUnderLegacyIds();
    const nextDay = { ...flex, rewards: '0.00000130', time: REWARD_MS + DAY_MS };
    mockApi.flexRewards = [flex, nextDay];
    mockApi.lockedRewards = [locked];
    // The record settled after it was stored; the id leaves the status out.
    mockApi.ethStaking = [{ ...eth, status: 'SUCCESS' }];
    mockApi.stakingInterest = [interest];

    const jobId = await sync(T0, T0 + 10 * DAY_MS);

    expect(mockJobs.completed).toEqual([jobId]);
    expect(rowsOf(CRYPTO_EVENT_TYPE.EARN_FLEX).map((row) => row.ExternalID)).toEqual([
      LEGACY_FLEX_ID,
      expect.stringMatching(/^earn-flex-[0-9a-f]{16}$/),
    ]);
    expect(rowsOf(CRYPTO_EVENT_TYPE.EARN_LOCKED)).toHaveLength(1);
    expect(rowsOf(CRYPTO_EVENT_TYPE.ETH_STAKING)).toHaveLength(1);
    expect(rowsOf(CRYPTO_EVENT_TYPE.STAKING_INTEREST)).toHaveLength(1);
  });

  it('keeps a different reward of the same instant, asset and amount', async () => {
    await storeUnderLegacyIds();
    const bonus = { ...flex, type: 'BONUS' };
    mockApi.flexRewards = [flex, bonus];

    await sync(T0, T0 + 10 * DAY_MS);

    expect(rowsOf(CRYPTO_EVENT_TYPE.EARN_FLEX).map((row) => row.RawPayload.type)).toEqual(['REALTIME', 'BONUS']);
  });
});

// ============================================================
// A job longer than one function invocation runs in rounds
// ============================================================

describe('a job longer than one function invocation', () => {
  // The configured origin the next round is requested on, never the request's Host.
  const APP_ORIGIN = 'https://budgetguard.test';
  const SECRET = 'test-cron-secret';
  // Two 30-day windows for the reward endpoints.
  const SCOPE_TO = T0 + 60 * DAY_MS;
  const DEADLINE = 1_000;
  const clock = { now: 0 };
  const savedEnv = { ...process.env };
  const savedFetch = global.fetch;
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  const FLEX_REWARD = { asset: 'BTC', rewards: '0.00000120', projectId: 'BTC001', type: 'REALTIME', time: REWARD_MS };
  const LATER_FLEX_REWARD = { ...FLEX_REWARD, rewards: '0.00000130', time: T0 + 40 * DAY_MS };

  function budget(): SyncBudget {
    return { deadline: DEADLINE, now: () => clock.now };
  }

  async function runRound(jobId: number, resume?: SyncResumePoint): Promise<void> {
    await runSync({
      userId: USER_ID,
      jobId,
      exchange: CRYPTO_EXCHANGE.BINANCE,
      mode: CRYPTO_SYNC_MODE.FULL,
      scopeFrom: new Date(T0),
      scopeTo: new Date(SCOPE_TO),
      budget: budget(),
      resume,
    });
  }

  /** The first window's flex rewards take the round past its deadline while they are fetched. */
  function deadlinePassesDuringFirstFlexWindow(): void {
    mockApi.onCall = (method, startTime) => {
      if (method === MOCK_METHOD.FLEX && startTime === T0) clock.now = DEADLINE;
    };
  }

  /** What the continue route hands the next round: the saved state, now claimed, and the job's progress. */
  function claimedNextRound(jobId: number): SyncResumePoint {
    const handOff = mockJobs.handOffs.filter((saved) => saved.jobId === jobId).at(-1);
    if (!handOff) throw new Error(`job ${jobId} did not hand off`);
    return {
      state: SyncResumeStateSchema.parse({ ...handOff.state, claimed: true }),
      progress: handOff.progress as unknown as SyncResumePoint['progress'],
    };
  }

  /** Everything the job's outcome is made of, plus the task calls it took. */
  function outcomeOf(jobId: number) {
    return {
      completed: mockJobs.completed.filter((id) => id === jobId).length,
      failed: mockJobs.failed.filter((f) => f.jobId === jobId),
      warning: mockJobs.completedWarnings.get(jobId),
      progress: mockJobs.progress.get(jobId),
      eventsIngested: mockJobs.eventsIngested.get(jobId),
      rows: mockDb.rows.map((row) => `${row.EventType}|${row.ExternalID}`).sort(),
      taskCalls: mockApi.calls,
    };
  }

  beforeAll(() => {
    process.env.CRON_SECRET = SECRET;
    process.env.NEXTAUTH_URL = APP_ORIGIN;
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterAll(() => {
    process.env = savedEnv;
    global.fetch = savedFetch;
  });

  beforeEach(() => {
    mockLimiter.sequential = true;
    clock.now = 0;
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    mockLimiter.sequential = false;
    log.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  });

  it('starts no task once the budget is spent, finishes the one running, saves its state and asks once for the next round', async () => {
    mockApi.flexRewards = [FLEX_REWARD, LATER_FLEX_REWARD];
    deadlinePassesDuringFirstFlexWindow();

    await runRound(41);

    // The task running when the deadline passed was finished and stored...
    expect(rowsOf(CRYPTO_EVENT_TYPE.EARN_FLEX).map((row) => row.RawPayload.rewards)).toEqual(['0.00000120']);
    // ...and the next one was never started.
    expect(mockApi.calls.map((call) => call.method)).not.toContain(MOCK_METHOD.LOCKED);
    expect(mockJobs.completed).toEqual([]);
    expect(mockJobs.failed).toEqual([]);

    expect(mockJobs.handOffs).toHaveLength(1);
    const state = SyncResumeStateSchema.parse(mockJobs.handOffs[0]?.state);
    expect(state).toMatchObject({ round: 2, claimed: false, phase: CRYPTO_SYNC_PHASE.FETCH, normalize: null });
    const firstWindow = new Date(T0).toISOString();
    expect(state.completedTaskKeys).toContain(`${CRYPTO_EVENT_TYPE.EARN_FLEX}:${firstWindow}`);
    expect(state.completedTaskKeys).not.toContain(`${CRYPTO_EVENT_TYPE.EARN_LOCKED}:${firstWindow}`);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      `${APP_ORIGIN}/api/crypto/sync/41/continue`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ round: 2 }),
        redirect: 'manual',
        headers: expect.objectContaining({ Authorization: `Bearer ${SECRET}` }),
      }),
    );
  });

  it('the next round skips the completed tasks, and the job ends exactly as one uninterrupted run would', async () => {
    const seed = async () => {
      // One reward the CSV holds, which Binance lists in both Earn histories:
      // the CSV row stands for one of them, so the other must be kept, even
      // when the two are fetched in different rounds.
      await importCsv(
        [
          'User_ID,UTC_Time,Account,Operation,Coin,Change,Remark',
          '1,2025-01-05 00:00:00,Earn,Simple Earn Flexible Interest,BTC,0.00000120,',
        ].join('\n'),
      );
      mockApi.flexRewards = [FLEX_REWARD, LATER_FLEX_REWARD];
      mockApi.lockedRewards = [
        {
          positionId: '9',
          asset: 'BTC',
          amount: '0.00000120',
          lockPeriod: '30',
          type: 'Locked Rewards',
          time: REWARD_MS,
        },
      ];
      mockApi.trades.set('BTCUSDT', makeFills('BTCUSDT', 3, T0));
      // Binance refuses the deposit history to this key: a gap the job completes with.
      mockApi.depositError = MOCK_KEY_REFUSED;
    };

    await seed();
    await runRound(51);
    const uninterrupted = outcomeOf(51);
    expect(uninterrupted.completed).toBe(1);
    expect(mockJobs.handOffs).toEqual([]);

    resetWorld();
    clock.now = 0;
    await seed();
    deadlinePassesDuringFirstFlexWindow();
    await runRound(52);
    expect(mockJobs.completed).toEqual([]);
    mockApi.onCall = null;
    clock.now = 0;
    await runRound(52, claimedNextRound(52));

    // Same status, warning, Progress (per endpoint, gaps and dedup counts
    // included), EventsIngested and rows, and no task fetched twice.
    expect(outcomeOf(52)).toEqual(uninterrupted);
    expect(rowsOf(CRYPTO_EVENT_TYPE.EARN_LOCKED)).toHaveLength(1);
    expect(mockJobs.handOffs).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // StartedAt is set by the first round only.
    expect(mockJobs.running).toEqual([52]);
  });

  it('a normalisation that runs out of time is finished by the next round, and only then does the job complete', async () => {
    mockApi.trades.set('BTCUSDT', makeFills('BTCUSDT', 3, T0));
    jest.mocked(countUnnormalisedRawEventsForUser).mockResolvedValueOnce(3);
    const budgetsGiven: unknown[] = [];
    jest
      .mocked(normalizeForUser)
      .mockImplementationOnce(async (_userId, onProgress, roundBudget) => {
        budgetsGiven.push(roundBudget);
        await onProgress?.(2, 2);
        return { processed: 2, inserted: 2, skipped: 0, failed: 0, failures: [], stoppedAtDeadline: true };
      })
      .mockImplementationOnce(async (_userId, onProgress, roundBudget) => {
        budgetsGiven.push(roundBudget);
        await onProgress?.(1, 1);
        return { processed: 1, inserted: 1, skipped: 0, failed: 0, failures: [], stoppedAtDeadline: false };
      });

    await runRound(71);

    // The normaliser got the round's budget, and the job is not completed yet.
    expect(budgetsGiven).toEqual([expect.objectContaining({ deadline: DEADLINE })]);
    expect(mockJobs.completed).toEqual([]);
    expect(mockJobs.handOffs).toHaveLength(1);
    expect(mockJobs.handOffs[0]).toMatchObject({
      eventsIngested: 3 + 2,
      state: { round: 2, phase: CRYPTO_SYNC_PHASE.NORMALIZE, normalize: { total: 3, processed: 2, inserted: 2 } },
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const tradeCalls = mockApi.tradeCalls.length;
    const accountCalls = mockApi.accountCalls;

    await runRound(71, claimedNextRound(71));

    expect(mockJobs.completed).toEqual([71]);
    // What one uninterrupted run gives: raw events plus every normalised one.
    expect(mockJobs.eventsIngested.get(71)).toBe(3 + 3);
    expect(mockJobs.progress.get(71)?.normalize).toMatchObject({ fetched: 3, totalWindows: 3, completedWindows: 3 });
    // The normalising round asked Binance for nothing.
    expect(mockApi.tradeCalls).toHaveLength(tradeCalls);
    expect(mockApi.accountCalls).toBe(accountCalls);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('fails the job with its own code instead of handing off past the round limit', async () => {
    clock.now = DEADLINE;

    await runRound(61, { state: SyncResumeStateSchema.parse({ round: CRYPTO_SYNC_MAX_ROUNDS }), progress: {} });

    expect(mockJobs.failed).toEqual([
      { jobId: 61, code: API_ERROR.CRYPTO.SYNC_ROUND_LIMIT, message: expect.stringContaining('fetch tasks') },
    ]);
    expect(mockJobs.handOffs).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('starts no next round when the job was cancelled while the round finished its tasks', async () => {
    mockJobs.handOffAccepted = false;
    clock.now = DEADLINE;

    await runRound(62);

    expect(mockJobs.handOffs).toHaveLength(1);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockJobs.failed).toEqual([]);
    expect(mockJobs.failedUnclaimed).toEqual([]);
  });

  it('sends nothing and fails the job when no trusted origin is configured', async () => {
    delete process.env.NEXTAUTH_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    clock.now = DEADLINE;
    try {
      await runRound(63);
    } finally {
      process.env.NEXTAUTH_URL = APP_ORIGIN;
    }

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockJobs.failedUnclaimed).toEqual([
      expect.objectContaining({ jobId: 63, round: 2, code: API_ERROR.CRYPTO.SYNC_ORIGIN_NOT_CONFIGURED }),
    ]);
  });

  /** Where the round's cutoff falls on the injected clock. */
  const CUTOFF = DEADLINE + CRYPTO_SYNC_CUTOFF_GRACE_MS;
  const RATE_LIMITED = mockSdkError(-1003, 'Too many requests.');

  it('abandons a task still waiting on Binance at the cutoff: it stores nothing, stays open, and the next round runs it again', async () => {
    // A pair whose history takes a walk of several pages from the first fill.
    const seed = () => {
      mockApi.trades.set('BTCUSDT', makeFills('BTCUSDT', 2_500, T0));
      mockApi.flexRewards = [FLEX_REWARD];
    };
    seed();
    await runRound(53);
    const uninterrupted = outcomeOf(53);
    expect(uninterrupted.completed).toBe(1);

    resetWorld();
    clock.now = 0;
    seed();
    // The walk's second page is rate-limited 20 s before the cutoff, and the
    // retry would wait 30 s.
    mockApi.onTradePage = (symbol, fromId) => {
      if (symbol !== 'BTCUSDT' || fromId == null || fromId === 0) return;
      clock.now = CUTOFF - 20_000;
      throw RATE_LIMITED;
    };
    await runRound(54);

    // Nothing of the walk was kept or held against the pair, and it is still to do.
    expect(rowsOf(CRYPTO_EVENT_TYPE.SPOT_TRADE)).toEqual([]);
    const saved = SyncResumeStateSchema.parse(mockJobs.handOffs[0]?.state);
    expect(saved.completedTaskKeys).not.toContain(`${CRYPTO_EVENT_TYPE.SPOT_TRADE}:BTCUSDT`);
    expect(saved.taskFailures).toEqual([]);
    expect(mockJobs.failed).toEqual([]);

    mockApi.onTradePage = null;
    clock.now = 0;
    await runRound(54, claimedNextRound(54));

    expect(outcomeOf(54)).toEqual(uninterrupted);
  });

  it('a -2015 confirmation cut off at the cutoff is asked again by the next round, not taken as a revoked key', async () => {
    mockApi.depositError = MOCK_KEY_REFUSED;
    await runRound(56);
    const uninterrupted = outcomeOf(56);
    expect(uninterrupted.warning).toMatchObject({ code: CRYPTO_SYNC_COMPLETED_WITH_GAPS });

    resetWorld();
    clock.now = 0;
    mockApi.depositError = MOCK_KEY_REFUSED;
    // Discovery asks for the account first; the second call is the
    // confirmation, rate-limited 20 s before the cutoff.
    mockApi.onAccountCall = (call) => {
      if (call !== 2) return;
      clock.now = CUTOFF - 20_000;
      throw RATE_LIMITED;
    };
    await runRound(57);

    expect(mockJobs.completed).toEqual([]);
    expect(mockJobs.failed).toEqual([]);
    expect(mockJobs.handOffs).toHaveLength(1);

    mockApi.onAccountCall = null;
    clock.now = 0;
    await runRound(57, claimedNextRound(57));

    expect(outcomeOf(57)).toEqual(uninterrupted);
  });

  it("a pair round 1 discovered but did not reach is fetched even when the next round's discovery comes back short", async () => {
    // Only getBalances lists XYZ: not a top-40 asset, never seen in stored events.
    mockApi.balances = [{ coin: 'XYZ', free: '5' }];
    mockApi.trades.set('XYZEUR', makeFills('XYZEUR', 3, T0));
    // The deadline passes while the first of XYZ's pairs is fetched.
    mockApi.onTradePage = (symbol) => {
      if (symbol === 'XYZUSDT') clock.now = DEADLINE;
    };
    await runRound(58);
    expect(rowsOf(CRYPTO_EVENT_TYPE.SPOT_TRADE)).toEqual([]);

    // The next round's getBalances fails, and a failed source counts as empty.
    mockApi.onTradePage = null;
    mockApi.balancesError = mockSdkError(-1000, 'An unknown error occurred while processing the request.');
    clock.now = 0;
    await runRound(58, claimedNextRound(58));

    expect(rowsOf(CRYPTO_EVENT_TYPE.SPOT_TRADE)).toHaveLength(3);
    expect(mockJobs.completed).toEqual([58]);
  });

  it('does not run a job that is no longer queued when its first round starts', async () => {
    mockJobs.runningAccepted = false;
    mockApi.trades.set('BTCUSDT', makeFills('BTCUSDT', 3, T0));

    await runRound(59);

    expect(mockApi.accountCalls).toBe(0);
    expect(mockApi.tradeCalls).toEqual([]);
    expect(mockJobs.progress.has(59)).toBe(false);
    expect(mockJobs.completed).toEqual([]);
    expect(mockJobs.failed).toEqual([]);
    expect(mockJobs.handOffs).toEqual([]);
  });

  /** What each discovery source, and the newest-fill lookup, have been asked so far. */
  function discoveryLookups() {
    return {
      balances: mockApi.balancesCalls,
      account: mockApi.accountCalls,
      interactedAssets: mockDb.interactedAssetLookups,
      lastTradeIds: mockDb.lastTradeIdLookups,
    };
  }

  it('a later round takes the spot pairs discovery listed instead of discovering again', async () => {
    mockApi.flexRewards = [FLEX_REWARD, LATER_FLEX_REWARD];
    mockApi.trades.set('BTCUSDT', makeFills('BTCUSDT', 3, T0));
    // Every spot walk runs before the reward windows: none is left for round 2.
    deadlinePassesDuringFirstFlexWindow();
    await runRound(65);
    const afterRoundOne = discoveryLookups();
    expect(afterRoundOne).toMatchObject({ balances: 1, interactedAssets: 1, lastTradeIds: 1 });
    expect(SyncResumeStateSchema.parse(mockJobs.handOffs[0]?.state).spotCandidates).toContain('BTCUSDT');

    mockApi.onCall = null;
    clock.now = 0;
    await runRound(65, claimedNextRound(65));

    // Neither Binance nor the database was asked for the pairs again, and with
    // no walk left the newest stored fills were not read either.
    expect(discoveryLookups()).toEqual(afterRoundOne);
    expect(mockJobs.completed).toEqual([65]);
    expect(rowsOf(CRYPTO_EVENT_TYPE.SPOT_TRADE)).toHaveLength(3);
  });

  it('a later round with a spot walk still to run reads the newest stored fills, and only those', async () => {
    mockApi.trades.set('BTCUSDT', makeFills('BTCUSDT', 3, T0));
    // The deadline passes during BTCUSDT's walk: the pairs after it stay open.
    mockApi.onTradePage = (symbol) => {
      if (symbol === 'BTCUSDT') clock.now = DEADLINE;
    };
    await runRound(66);
    const afterRoundOne = discoveryLookups();

    mockApi.onTradePage = null;
    clock.now = 0;
    await runRound(66, claimedNextRound(66));

    expect(discoveryLookups()).toEqual({ ...afterRoundOne, lastTradeIds: afterRoundOne.lastTradeIds + 1 });
    expect(mockJobs.completed).toEqual([66]);
  });

  it('a discovery call cut off at the cutoff hands off and is asked again, instead of dropping its pairs', async () => {
    // Only getBalances lists XYZ: not a top-40 asset, never seen in stored events.
    mockApi.balances = [{ coin: 'XYZ', free: '5' }];
    mockApi.trades.set('XYZEUR', makeFills('XYZEUR', 3, T0));
    // getBalances is rate-limited 20 s before the cutoff, and its retry would wait 30 s.
    mockApi.balancesError = RATE_LIMITED;
    clock.now = CUTOFF - 20_000;
    await runRound(67);

    expect(mockJobs.failed).toEqual([]);
    expect(mockJobs.handOffs).toHaveLength(1);
    // No pair list was saved: the next round discovers.
    expect(SyncResumeStateSchema.parse(mockJobs.handOffs[0]?.state).spotCandidates).toEqual([]);

    mockApi.balancesError = null;
    clock.now = 0;
    await runRound(67, claimedNextRound(67));

    expect(rowsOf(CRYPTO_EVENT_TYPE.SPOT_TRADE)).toHaveLength(3);
    expect(mockJobs.completed).toEqual([67]);
  });

  it('a hand-off whose write throws fails the job only while the announced round is unclaimed', async () => {
    // The write may have been saved before the connection dropped.
    jest.mocked(handOffSyncRound).mockRejectedValueOnce(new Error('Connection terminated unexpectedly'));
    clock.now = DEADLINE;

    await expect(runRound(68)).rejects.toThrow('Connection terminated unexpectedly');

    expect(mockJobs.failed).toEqual([]);
    expect(mockJobs.failedUnclaimed).toEqual([
      { jobId: 68, round: 2, code: API_ERROR.CRYPTO.SYNC_HANDOFF_FAILED, message: 'Round 2 could not be started.' },
    ]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('round 2'), expect.any(Error));
  });

  it('never fails a job whose next round a timed-out call may have started, when the hand-off throws after it', async () => {
    // Both calls go unanswered, so either may have reached the route; then
    // recording the failed hand-off throws, and the retry of that record finds
    // the round claimed.
    mockFetch.mockRejectedValue(new Error('socket hang up'));
    jest
      .mocked(failUnclaimedSyncRound)
      .mockRejectedValueOnce(new Error('Connection terminated unexpectedly'))
      .mockResolvedValueOnce(false);
    clock.now = DEADLINE;

    await expect(runRound(69)).rejects.toThrow('Connection terminated unexpectedly');

    expect(mockJobs.failed).toEqual([]);
    expect(jest.mocked(failUnclaimedSyncRound)).toHaveBeenLastCalledWith(
      69,
      2,
      API_ERROR.CRYPTO.SYNC_HANDOFF_FAILED,
      'Round 2 could not be started.',
    );
  });

  describe("a job of the cron's queue", () => {
    const NEXT_QUEUED = { jobId: 90, userId: 8, exchange: CRYPTO_EXCHANGE.BINANCE };

    /** The first round of a job the cron queued, as the continue route hands it over once claimed. */
    function queuedFirstRound(): SyncResumePoint {
      return { state: SyncResumeStateSchema.parse({ round: 1, claimed: true, inCronQueue: true }), progress: {} };
    }

    function continueCalls(): Array<{ url: string; round: unknown }> {
      return mockFetch.mock.calls.map(([url, init]) => ({
        url: String(url),
        round: (JSON.parse(String((init as RequestInit).body)) as { round: unknown }).round,
      }));
    }

    beforeEach(() => {
      mockJobs.queue = [{ ...NEXT_QUEUED }];
      jest.mocked(findNextQueuedSyncJob).mockClear();
    });

    it('the round that completes it starts the next job waiting', async () => {
      mockApi.trades.set('BTCUSDT', makeFills('BTCUSDT', 3, T0));

      await runRound(81, queuedFirstRound());

      expect(mockJobs.completed).toEqual([81]);
      expect(continueCalls()).toEqual([{ url: `${APP_ORIGIN}/api/crypto/sync/90/continue`, round: 1 }]);
    });

    it('a failed one still starts the next', async () => {
      mockApi.depositError = mockSdkError(-1000, 'An unknown error occurred while processing the request.');

      await runRound(82, queuedFirstRound());

      expect(mockJobs.failed.map((failure) => failure.jobId)).toEqual([82]);
      expect(continueCalls()).toEqual([{ url: `${APP_ORIGIN}/api/crypto/sync/90/continue`, round: 1 }]);
    });

    it('one whose next round could not be started ends failed and starts the next', async () => {
      clock.now = DEADLINE;
      mockFetch.mockResolvedValueOnce({ status: 500 }).mockResolvedValueOnce({ status: 500 });

      await runRound(84, queuedFirstRound());

      expect(mockJobs.failedUnclaimed.map((failure) => failure.jobId)).toEqual([84]);
      expect(continueCalls()).toEqual([
        { url: `${APP_ORIGIN}/api/crypto/sync/84/continue`, round: 2 },
        { url: `${APP_ORIGIN}/api/crypto/sync/84/continue`, round: 2 },
        { url: `${APP_ORIGIN}/api/crypto/sync/90/continue`, round: 1 },
      ]);
    });

    it('a round that hands its job on leaves the queue to the round that ends the job', async () => {
      clock.now = DEADLINE;

      await runRound(85, queuedFirstRound());

      expect(continueCalls()).toEqual([{ url: `${APP_ORIGIN}/api/crypto/sync/85/continue`, round: 2 }]);
      expect(SyncResumeStateSchema.parse(mockJobs.handOffs[0]?.state).inCronQueue).toBe(true);
      expect(findNextQueuedSyncJob).not.toHaveBeenCalled();
    });

    it('a manual sync is not chained into the queue', async () => {
      mockApi.trades.set('BTCUSDT', makeFills('BTCUSDT', 3, T0));

      await runRound(86);

      expect(mockJobs.completed).toEqual([86]);
      expect(findNextQueuedSyncJob).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});

// ============================================================
// The worst case of a round's end, on the real constants
// ============================================================

describe('a round whose Binance call and hand-off call never answer', () => {
  const APP_ORIGIN = 'https://budgetguard.test';
  const savedEnv = { ...process.env };
  const savedFetch = global.fetch;
  const spies: jest.SpyInstance[] = [];

  /** Moves fake time a second at a time until `done`, at most `maxMs`. */
  async function advanceUntil(done: () => boolean, maxMs: number): Promise<void> {
    const STEP_MS = 1_000;
    await Array.from({ length: maxMs / STEP_MS }).reduce<Promise<void>>(async (previous) => {
      await previous;
      if (!done()) await jest.advanceTimersByTimeAsync(STEP_MS);
    }, Promise.resolve());
  }

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    process.env.CRON_SECRET = 'test-cron-secret';
    process.env.NEXTAUTH_URL = APP_ORIGIN;
    global.fetch = mockFetch as unknown as typeof fetch;
    mockLimiter.sequential = true;
    spies.push(
      jest.spyOn(console, 'log').mockImplementation(() => undefined),
      jest.spyOn(console, 'error').mockImplementation(() => undefined),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = { ...savedEnv };
    global.fetch = savedFetch;
    mockLimiter.sequential = false;
    spies.splice(0).forEach((spy) => {
      spy.mockRestore();
    });
  });

  it('still saves its state and settles the hand-off before the invocation ends', async () => {
    const invocationStart = Date.now();
    const roundBudget = startSyncBudget();
    // The worst case: the call goes out a second before the deadline and never
    // answers, and neither does the continue route.
    jest.setSystemTime(invocationStart + CRYPTO_SYNC_ROUND_BUDGET_MS - 1_000);
    mockApi.hangCall = (method, startTime) => method === MOCK_METHOD.FLEX && startTime === T0;
    mockFetch.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('This operation was aborted')));
        }),
    );
    const settled: { at: number | null } = { at: null };
    runSync({
      userId: USER_ID,
      jobId: 55,
      exchange: CRYPTO_EXCHANGE.BINANCE,
      mode: CRYPTO_SYNC_MODE.FULL,
      scopeFrom: new Date(T0),
      scopeTo: new Date(T0 + 60 * DAY_MS),
      budget: roundBudget,
    }).then(() => {
      settled.at = Date.now();
    });

    await advanceUntil(() => settled.at !== null, CRYPTO_SYNC_INVOCATION_LIMIT_MS);

    // Done at the cutoff (270 s) plus one hand-off call of 15 s: 285 s, inside
    // the 5 s the hand-off keeps free before the limit.
    expect(settled.at).not.toBeNull();
    const elapsed = (settled.at ?? Number.POSITIVE_INFINITY) - invocationStart;
    expect(elapsed).toBe(CRYPTO_SYNC_ROUND_BUDGET_MS + CRYPTO_SYNC_CUTOFF_GRACE_MS + CRYPTO_SYNC_HANDOFF_TIMEOUT_MS);
    expect(elapsed).toBeLessThanOrEqual(CRYPTO_SYNC_INVOCATION_LIMIT_MS - CRYPTO_SYNC_HANDOFF_RESERVE_MS);
    // The state was saved with the abandoned task open, one call was tried,
    // and the job was failed at once instead of waiting for failStuckJobs.
    const saved = SyncResumeStateSchema.parse(mockJobs.handOffs[0]?.state);
    expect(saved).toMatchObject({ round: 2, claimed: false });
    expect(saved.completedTaskKeys).not.toContain(`${CRYPTO_EVENT_TYPE.EARN_FLEX}:${new Date(T0).toISOString()}`);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockJobs.failedUnclaimed).toEqual([
      expect.objectContaining({ jobId: 55, round: 2, code: API_ERROR.CRYPTO.SYNC_HANDOFF_FAILED }),
    ]);
  });
});
