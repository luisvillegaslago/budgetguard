/**
 * Integration tests for fiscal deadlines API routes.
 * Tests GET deadlines (server-computed) and GET/PUT settings.
 */

import { CROSS_QUARTER_CASE, FILING_STATUS, MODELO_TYPE } from '@/constants/finance';
import type { CrossQuarterInvoice, FiscalDeadline, FiscalDeadlineSettings } from '@/types/finance';

// ============================================================
// Mock Data
// ============================================================

const mockSettings: FiscalDeadlineSettings = {
  reminderDaysBefore: 7,
  postponementReminder: true,
  isActive: true,
};

const mockFiledSet = new Set(['303-2025-1', '130-2025-1']);

let capturedSettings: FiscalDeadlineSettings | null = null;

// ============================================================
// Mocks
// ============================================================

jest.mock('@/services/database/FiscalDocumentRepository', () => ({
  getDeadlineSettings: jest.fn(async () => mockSettings),
  getFiledModelos: jest.fn(async () => mockFiledSet),
  upsertDeadlineSettings: jest.fn(async (input: FiscalDeadlineSettings) => {
    capturedSettings = input;
    return input;
  }),
}));

// The route reads cross-quarter findings to qualify the 303/130 it is about to show. Mocked here
// for two reasons: this suite is about the deadline calendar, and InvoiceRepository pulls in
// @vercel/blob (undici) at module scope, which jsdom cannot load.
const mockGetCrossQuarterInvoices = jest.fn(
  async (_year: number, _quarter: number): Promise<CrossQuarterInvoice[]> => [],
);

jest.mock('@/services/database/InvoiceRepository', () => ({
  getCrossQuarterInvoices: (...args: [number, number]) => mockGetCrossQuarterInvoices(...args),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

// ============================================================
// Import routes AFTER mocks
// ============================================================

import { GET as GET_DEADLINES } from '@/app/api/fiscal/deadlines/route';
import { GET as GET_SETTINGS, PUT as PUT_SETTINGS } from '@/app/api/fiscal/deadlines/settings/route';

// ============================================================
// Helpers
// ============================================================

function createMockRequest(
  url: string,
  body?: Record<string, unknown>,
): {
  url: string;
  json: () => Promise<Record<string, unknown>>;
} {
  return { url, json: async () => body ?? {} };
}

/** One uncollected invoice of `totalCents`, enough to make a quarter worth a note */
function crossQuarterInvoice(totalCents: number, invoiceDate: string): CrossQuarterInvoice {
  return {
    invoiceId: 1,
    invoiceNumber: 'DW-09',
    clientName: 'Acme',
    totalCents,
    invoiceDate,
    invoiceYear: Number(invoiceDate.slice(0, 4)),
    invoiceQuarter: Math.ceil(Number(invoiceDate.slice(5, 7)) / 3),
    collectionDate: null,
    collectionYear: null,
    collectionQuarter: null,
    crossQuarterCase: CROSS_QUARTER_CASE.ISSUED_NOT_COLLECTED,
    crossesFiscalYear: false,
  };
}

function findDeadline(deadlines: FiscalDeadline[], modeloType: string, year: number, quarter: number | null) {
  return deadlines.find((d) => d.modeloType === modeloType && d.fiscalYear === year && d.fiscalQuarter === quarter);
}

async function getDeadlines(url: string): Promise<FiscalDeadline[]> {
  const response = await GET_DEADLINES(createMockRequest(url) as never);
  const data = await response.json();
  return data.data as FiscalDeadline[];
}

// ============================================================
// Tests
// ============================================================

describe('GET /api/fiscal/deadlines', () => {
  it('should return all deadlines for a year', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/deadlines?year=2025');
    const response = await GET_DEADLINES(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(10); // 4×303 + 4×130 + 390 + 100
  });

  it('should mark filed modelos as FILED', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/deadlines?year=2025');
    const response = await GET_DEADLINES(request as never);
    const data = await response.json();

    const q1_303 = data.data.find(
      (d: { modeloType: string; fiscalQuarter: number }) => d.modeloType === '303' && d.fiscalQuarter === 1,
    );
    const q1_130 = data.data.find(
      (d: { modeloType: string; fiscalQuarter: number }) => d.modeloType === '130' && d.fiscalQuarter === 1,
    );

    expect(q1_303.status).toBe(FILING_STATUS.FILED);
    expect(q1_303.isFiled).toBe(true);
    expect(q1_130.status).toBe(FILING_STATUS.FILED);
  });

  it('should return only active deadlines when active=true', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/deadlines?year=2025&active=true');
    const response = await GET_DEADLINES(request as never);
    const data = await response.json();

    // All active deadlines should be upcoming, due, or overdue
    expect(
      data.data.every(
        (d: { status: string }) =>
          d.status === FILING_STATUS.UPCOMING || d.status === FILING_STATUS.DUE || d.status === FILING_STATUS.OVERDUE,
      ),
    ).toBe(true);
  });

  it('should include meta with year and reminderDaysBefore', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/deadlines?year=2025');
    const response = await GET_DEADLINES(request as never);
    const data = await response.json();

    expect(data.meta.year).toBe(2025);
    expect(data.meta.reminderDaysBefore).toBe(7);
  });

  it('should default to current year if not provided', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/deadlines');
    const response = await GET_DEADLINES(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.meta.year).toBe(new Date().getFullYear());
  });
});

/**
 * The cross-quarter finding as it reaches the person about to file.
 *
 * The rules about where a note may appear are pinned in cross-quarter-deadline-notes.test.ts.
 * What is pinned here is the wiring: that the route reads the right quarters, reads them once,
 * reads nothing when nothing is imminent, and hands the note down attached to a deadline that
 * already existed rather than to one it made up.
 */
describe('GET /api/fiscal/deadlines — cross-quarter qualifier', () => {
  beforeEach(() => {
    mockGetCrossQuarterInvoices.mockReset();
    mockGetCrossQuarterInvoices.mockResolvedValue([]);
    // 5 October 2026: the 303 and the 130 of Q3 are inside their window (1-20 October)
    jest.useFakeTimers({ now: new Date(2026, 9, 5) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('attaches the finding to both imminent filings of the quarter, and to nothing else', async () => {
    mockGetCrossQuarterInvoices.mockResolvedValue([crossQuarterInvoice(120000, '2026-08-03')]);

    const deadlines = await getDeadlines('http://localhost:3000/api/fiscal/deadlines?year=2026');

    expect(findDeadline(deadlines, MODELO_TYPE.M303, 2026, 3)?.crossQuarter).toEqual({
      fiscalYear: 2026,
      fiscalQuarter: 3,
      invoiceCount: 1,
      totalCents: 120000,
      dataIntegrityCount: 0,
    });
    expect(findDeadline(deadlines, MODELO_TYPE.M130, 2026, 3)?.crossQuarter).toEqual(
      findDeadline(deadlines, MODELO_TYPE.M303, 2026, 3)?.crossQuarter,
    );

    // Everything else keeps its own identity: the annual modelos span every quarter, and a
    // filing that is not imminent is not the moment to raise this.
    expect(findDeadline(deadlines, MODELO_TYPE.M390, 2026, null)?.crossQuarter).toBeUndefined();
    expect(findDeadline(deadlines, MODELO_TYPE.M303, 2026, 4)?.crossQuarter).toBeUndefined();
    expect(findDeadline(deadlines, MODELO_TYPE.M303, 2026, 1)?.crossQuarter).toBeUndefined();
  });

  it('invents no deadline: the year still has exactly its ten entries', async () => {
    mockGetCrossQuarterInvoices.mockResolvedValue([crossQuarterInvoice(120000, '2026-08-03')]);

    const deadlines = await getDeadlines('http://localhost:3000/api/fiscal/deadlines?year=2026');

    expect(deadlines).toHaveLength(10); // 4×303 + 4×130 + 390 + 100
  });

  it('reads the imminent quarter once, and no other quarter at all', async () => {
    await getDeadlines('http://localhost:3000/api/fiscal/deadlines?year=2026');

    // Both modelos of Q3 are due, and they share the single lookup. Q1 and Q2 are overdue, Q4 is
    // not due yet: none of them costs a round trip.
    expect(mockGetCrossQuarterInvoices).toHaveBeenCalledTimes(1);
    expect(mockGetCrossQuarterInvoices).toHaveBeenCalledWith(2026, 3);
  });

  it('costs nothing on a year with no imminent filing', async () => {
    await getDeadlines('http://localhost:3000/api/fiscal/deadlines?year=2024');

    expect(mockGetCrossQuarterInvoices).not.toHaveBeenCalled();
  });

  it('stays silent when the quarter has nothing to say', async () => {
    const deadlines = await getDeadlines('http://localhost:3000/api/fiscal/deadlines?year=2026');

    expect(deadlines.every((d) => d.crossQuarter === undefined)).toBe(true);
  });

  it('survives the active filter, which is the surface the filer actually reads', async () => {
    mockGetCrossQuarterInvoices.mockResolvedValue([crossQuarterInvoice(120000, '2026-08-03')]);

    const deadlines = await getDeadlines('http://localhost:3000/api/fiscal/deadlines?year=2026&active=true');

    expect(findDeadline(deadlines, MODELO_TYPE.M303, 2026, 3)?.crossQuarter?.invoiceCount).toBe(1);
  });
});

/**
 * The year being filed is not always the year on the calendar.
 *
 * Q4 and the 390 fall due in January, the Renta between April and June — all of them after their
 * fiscal year has closed. Asking only for the current calendar year returns those as NOT_DUE, so
 * the banner went blank on exactly the days something was owed, and any cross-quarter finding of
 * that quarter went with it.
 */
describe('GET /api/fiscal/deadlines — the filing window that outlives its year', () => {
  beforeEach(() => {
    mockGetCrossQuarterInvoices.mockReset();
    mockGetCrossQuarterInvoices.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the Q4 filings that are due in January, and the finding riding them', async () => {
    jest.useFakeTimers({ now: new Date(2027, 0, 10) });
    mockGetCrossQuarterInvoices.mockResolvedValue([crossQuarterInvoice(120000, '2026-12-28')]);

    // No year: the same request the dashboard banner makes
    const deadlines = await getDeadlines('http://localhost:3000/api/fiscal/deadlines?active=true');

    expect(findDeadline(deadlines, MODELO_TYPE.M303, 2026, 4)?.status).toBe(FILING_STATUS.DUE);
    expect(findDeadline(deadlines, MODELO_TYPE.M130, 2026, 4)?.status).toBe(FILING_STATUS.DUE);
    expect(findDeadline(deadlines, MODELO_TYPE.M390, 2026, null)?.status).toBe(FILING_STATUS.DUE);
    expect(findDeadline(deadlines, MODELO_TYPE.M303, 2026, 4)?.crossQuarter?.totalCents).toBe(120000);
  });

  it('carries over only what is still open, never a closed year of overdue filings', async () => {
    jest.useFakeTimers({ now: new Date(2027, 0, 10) });

    const deadlines = await getDeadlines('http://localhost:3000/api/fiscal/deadlines?active=true');

    // Q1-Q3 of 2026 are overdue and unfiled. They are a different conversation, and parking them
    // on the dashboard permanently would bury the one filing that is actually running out.
    expect(findDeadline(deadlines, MODELO_TYPE.M303, 2026, 1)).toBeUndefined();
    expect(findDeadline(deadlines, MODELO_TYPE.M303, 2026, 2)).toBeUndefined();
    expect(findDeadline(deadlines, MODELO_TYPE.M303, 2026, 3)).toBeUndefined();
  });

  it('shows the Renta of the closed year during its campaign', async () => {
    jest.useFakeTimers({ now: new Date(2027, 4, 1) });

    const deadlines = await getDeadlines('http://localhost:3000/api/fiscal/deadlines?active=true');

    expect(findDeadline(deadlines, MODELO_TYPE.M100, 2026, null)?.status).toBe(FILING_STATUS.DUE);
  });

  it('leaves the year view alone: it answers for the year it was asked about', async () => {
    jest.useFakeTimers({ now: new Date(2027, 0, 10) });

    const deadlines = await getDeadlines('http://localhost:3000/api/fiscal/deadlines?year=2027');

    // The selector says 2027; adding 2026 rows here would contradict it and meta.year with it.
    expect(deadlines).toHaveLength(10);
    expect(deadlines.every((d) => d.fiscalYear === 2027)).toBe(true);
  });

  it('costs no extra query on a day with no window still open', async () => {
    jest.useFakeTimers({ now: new Date(2026, 7, 18) });
    const { getFiledModelos } = jest.requireMock('@/services/database/FiscalDocumentRepository');
    (getFiledModelos as jest.Mock).mockClear();

    await getDeadlines('http://localhost:3000/api/fiscal/deadlines?active=true');

    // 18 August: nothing of 2025 is still open, so the previous year is never read.
    expect(getFiledModelos).toHaveBeenCalledTimes(1);
    expect(getFiledModelos).toHaveBeenCalledWith(2026);
  });
});

describe('GET /api/fiscal/deadlines/settings', () => {
  it('should return deadline settings', async () => {
    const response = await GET_SETTINGS();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.reminderDaysBefore).toBe(7);
    expect(data.data.postponementReminder).toBe(true);
    expect(data.data.isActive).toBe(true);
  });
});

describe('PUT /api/fiscal/deadlines/settings', () => {
  beforeEach(() => {
    capturedSettings = null;
  });

  it('should update deadline settings', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/deadlines/settings', {
      reminderDaysBefore: 14,
      postponementReminder: false,
      isActive: true,
    });
    const response = await PUT_SETTINGS(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(capturedSettings?.reminderDaysBefore).toBe(14);
    expect(capturedSettings?.postponementReminder).toBe(false);
  });

  it('should apply defaults for missing fields', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/deadlines/settings', {});
    const response = await PUT_SETTINGS(request as never);

    expect(response.status).toBe(200);
    expect(capturedSettings?.reminderDaysBefore).toBe(7);
    expect(capturedSettings?.postponementReminder).toBe(true);
    expect(capturedSettings?.isActive).toBe(true);
  });

  it('should reject invalid reminderDaysBefore', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/deadlines/settings', {
      reminderDaysBefore: 0,
    });
    const response = await PUT_SETTINGS(request as never);

    expect(response.status).toBe(400);
  });
});
