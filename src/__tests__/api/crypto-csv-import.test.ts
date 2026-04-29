/**
 * Integration tests: POST /api/crypto/import/csv
 *
 * Critical contract:
 *  - missing or oversized file → 400 (no DB writes, no job created)
 *  - malformed CSV → 400
 *  - valid CSV → 202 with jobId, raws inserted, normalize scheduled in
 *    background (so the response stays under Vercel's function timeout)
 *  - re-importing the same content yields 0 new inserts (UNIQUE-based
 *    idempotency)
 */

// ============================================================
// Mocks
// ============================================================

let createdJobs = 0;
let runningCalls = 0;
let _progressCalls = 0;
let completedCalls = 0;
let failedCalls = 0;
let normalizeCalls = 0;
let bulkInsertCalls = 0;
let lastBulkInsertCount = 0;

// We toggle this between tests to simulate a fully-deduplicated re-import.
let bulkInsertReturnsZero = false;

jest.mock('@/services/database/CryptoSyncJobsRepository', () => ({
  createSyncJob: jest.fn(async () => {
    createdJobs += 1;
    return {
      jobId: 100 + createdJobs,
      exchange: 'binance',
      mode: 'full',
      status: 'pending',
      scopeFrom: '2025-01-01',
      scopeTo: '2025-01-02',
      progress: {},
      errorCode: null,
      errorMessage: null,
      eventsIngested: 0,
      startedAt: null,
      finishedAt: null,
      createdAt: '2026-04-28T10:00:00Z',
      updatedAt: '2026-04-28T10:00:00Z',
    };
  }),
  markJobRunning: jest.fn(async () => {
    runningCalls += 1;
  }),
  updateJobProgress: jest.fn(async () => {
    _progressCalls += 1;
  }),
  markJobCompleted: jest.fn(async () => {
    completedCalls += 1;
  }),
  markJobFailed: jest.fn(async () => {
    failedCalls += 1;
  }),
}));

jest.mock('@/services/database/BinanceRawEventsRepository', () => ({
  bulkInsertRawEventsForUser: jest.fn(async (_userId: number, events: unknown[]) => {
    bulkInsertCalls += 1;
    lastBulkInsertCount = events.length;
    return bulkInsertReturnsZero ? 0 : events.length;
  }),
}));

jest.mock('@/services/exchanges/binance/NormalizationService', () => ({
  normalizeForUser: jest.fn(async () => {
    normalizeCalls += 1;
    return { processed: 0, inserted: 0, skipped: 0, failed: 0, failures: [] };
  }),
}));

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 42),
  AuthError: class AuthError extends Error {},
}));

// `after()` runs the background callback in tests too, but we don't await
// it — make it run synchronously so the test can assert on the side-effects
// (normalize call, completion) deterministically.
jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
  after: (fn: () => Promise<void>) => fn(),
}));

import { POST } from '@/app/api/crypto/import/csv/route';

// ============================================================
// Helpers
// ============================================================

const VALID_CSV = [
  'User_ID,UTC_Time,Account,Operation,Coin,Change,Remark',
  '1,2025-01-15 10:00:00,Spot,Deposit,BTC,0.5,',
  '2,2025-02-10 12:00:00,Spot,Withdraw,ETH,-1,',
].join('\n');

// Minimal File-like shim. jsdom's Blob lacks `.text()` on this Node
// version, and the route only uses `.text()`, `.size` and `.name` — so a
// hand-rolled object is enough.
function makeFile(content: string, name: string): { name: string; size: number; text: () => Promise<string> } {
  return { name, size: content.length, text: async () => content };
}

function buildFormData(file: { content: string; name: string } | null): {
  get: (key: string) => unknown;
} {
  const formFile = file ? makeFile(file.content, file.name) : null;
  return {
    get: (key: string) => (key === 'file' ? formFile : null),
  };
}

function createMockRequest(formData: { get: (key: string) => unknown }) {
  return {
    url: 'http://localhost:3000/api/crypto/import/csv',
    formData: async () => formData,
  };
}

beforeEach(() => {
  createdJobs = 0;
  runningCalls = 0;
  _progressCalls = 0;
  completedCalls = 0;
  failedCalls = 0;
  normalizeCalls = 0;
  bulkInsertCalls = 0;
  lastBulkInsertCount = 0;
  bulkInsertReturnsZero = false;
});

// ============================================================
// Tests
// ============================================================

describe('POST /api/crypto/import/csv', () => {
  it('returns 400 when no file is provided (no job created)', async () => {
    const fd = buildFormData(null);
    const res = await POST(createMockRequest(fd) as never);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(createdJobs).toBe(0);
    expect(bulkInsertCalls).toBe(0);
  });

  it('returns 400 for a malformed CSV (no Time column) without persisting', async () => {
    const garbage = 'foo,bar,baz\n1,2,3';
    const res = await POST(createMockRequest(buildFormData({ content: garbage, name: 'bad.csv' })) as never);

    expect(res.status).toBe(400);
    expect(createdJobs).toBe(0);
    expect(bulkInsertCalls).toBe(0);
  });

  it('returns 202 with jobId, inserts raws and schedules normalize for a valid CSV', async () => {
    const res = await POST(
      createMockRequest(buildFormData({ content: VALID_CSV, name: 'export-(UTC+0).csv' })) as never,
    );
    const data = await res.json();

    expect(res.status).toBe(202);
    expect(data.success).toBe(true);
    expect(data.data.jobId).toBe(101);
    expect(data.data.rowsRead).toBe(2);
    expect(data.data.eventsInserted).toBe(2);
    expect(data.data.normalizing).toBe(true);

    // Job lifecycle: created → marked running → progress stamped before
    // returning, then normalize ran in `after()` and completed the job.
    expect(createdJobs).toBe(1);
    expect(runningCalls).toBe(1);
    expect(bulkInsertCalls).toBe(1);
    expect(lastBulkInsertCount).toBe(2);
    expect(normalizeCalls).toBe(1);
    expect(completedCalls).toBe(1);
    expect(failedCalls).toBe(0);
  });

  it('reports 0 newly-inserted events when the same CSV is re-imported (idempotent)', async () => {
    bulkInsertReturnsZero = true;
    const res = await POST(
      createMockRequest(buildFormData({ content: VALID_CSV, name: 'export-(UTC+0).csv' })) as never,
    );
    const data = await res.json();

    expect(res.status).toBe(202);
    expect(data.data.eventsInserted).toBe(0);
    // Both rows were known dupes → reported under eventsDuplicate.
    expect(data.data.eventsDuplicate).toBe(2);
  });
});
