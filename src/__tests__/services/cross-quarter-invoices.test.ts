/**
 * Integration Tests: the invoices whose devengo and whose cobro tell different stories
 *
 * Nothing here tests a calculation. "vw_FiscalAccrual" books an invoice on its "InvoiceDate" and
 * every modelo reads it, which is correct and is not what these tests are about. What they pin is
 * the warning that sits next to that correct figure, because the human filing the quarter reasons
 * from the bank statement ("I got paid in April, so it goes in 2T") while the law reasons from the
 * invoice date. When those two disagree, the person is the failure mode, not the app.
 *
 * The fixtures are the two real invoices it already happened with:
 *   CREST-01 (id 9) — 600,00 € issued 14-mar-2026 (1T), collected 26-abr-2026 (2T). The 2T 303 was
 *     filed with 26.475,00 € in casilla 120 instead of 25.875,00 €, exactly 600,00 € too much, and
 *     needed a rectificativa. The app's accrual view produced the corrected figure all along.
 *   DW-09 (id 10) — 1.200,00 € issued 3-ago-2026 (3T), 'finalized', never collected. It is declared
 *     in the 3T models due 20-oct-2026 with no money behind it. Owed on issue, so not an error, but
 *     a cash surprise the quarter should say out loud.
 *
 * The assertion that earns its keep is the negative one: an invoice issued and collected inside the
 * same quarter must never be reported. Without it the warning fires on every invoice of the year
 * and the two above stop being visible.
 */

import { CROSS_QUARTER_CASE, INVOICE_STATUS, ISSUED_INVOICE_STATUSES } from '@/constants/finance';
import type { InvoiceStatus } from '@/types/finance';

// ── Fixtures ──

interface InvoiceFixture {
  InvoiceID: number;
  InvoiceNumber: string | null;
  ClientName: string;
  TotalCents: number;
  InvoiceDate: Date;
  Status: InvoiceStatus;
  /** "TransactionDate" of the linked payment transaction; null when "TransactionID" is NULL */
  CollectionDate: Date | null;
}

/**
 * node-postgres hands a DATE column back as a `Date` at midnight LOCAL time, and `toDateString()`
 * reads it back with getFullYear/getMonth/getDate. Building the fixtures the same way is what
 * keeps '2026-03-14' from drifting a day depending on where the suite runs.
 */
const day = (isoDay: string): Date => new Date(`${isoDay}T00:00:00`);

/** The one that forced the rectificativa: declared in 1T, money in 2T */
const CREST_01: InvoiceFixture = {
  InvoiceID: 9,
  InvoiceNumber: 'CREST-01',
  ClientName: 'Crest Studios',
  TotalCents: 60_000,
  InvoiceDate: day('2026-03-14'),
  Status: INVOICE_STATUS.PAID,
  CollectionDate: day('2026-04-26'),
};

/** Issued in 3T and still unpaid: the IVA is owed on 20-oct-2026 regardless */
const DW_09: InvoiceFixture = {
  InvoiceID: 10,
  InvoiceNumber: 'DW-09',
  ClientName: 'Deep Work SL',
  TotalCents: 120_000,
  InvoiceDate: day('2026-08-03'),
  Status: INVOICE_STATUS.FINALIZED,
  CollectionDate: null,
};

/** The ordinary case, and the vast majority: issued and collected inside 2T */
const DW_07_SAME_QUARTER: InvoiceFixture = {
  InvoiceID: 7,
  InvoiceNumber: 'DW-07',
  ClientName: 'Deep Work SL',
  TotalCents: 250_000,
  InvoiceDate: day('2026-05-04'),
  Status: INVOICE_STATUS.PAID,
  CollectionDate: day('2026-06-10'),
};

/** December → January: the two periods are two different Rentas, not two filings of one */
const DW_08_YEAR_CROSSING: InvoiceFixture = {
  InvoiceID: 8,
  InvoiceNumber: 'DW-08',
  ClientName: 'Deep Work SL',
  TotalCents: 90_000,
  InvoiceDate: day('2025-12-22'),
  Status: INVOICE_STATUS.PAID,
  CollectionDate: day('2026-01-15'),
};

/** Not issued: it carries no number, enters no modelo, and owes no IVA */
const DRAFT_1T: InvoiceFixture = {
  InvoiceID: 11,
  InvoiceNumber: null,
  ClientName: 'Crest Studios',
  TotalCents: 45_000,
  InvoiceDate: day('2026-03-20'),
  Status: INVOICE_STATUS.DRAFT,
  CollectionDate: null,
};

/** Marked 'paid' but with a NULL "TransactionID": the app cannot know WHEN the money arrived */
const PAID_WITHOUT_LINK: InvoiceFixture = {
  InvoiceID: 12,
  InvoiceNumber: 'CREST-00',
  ClientName: 'Crest Studios',
  TotalCents: 30_000,
  InvoiceDate: day('2026-03-05'),
  Status: INVOICE_STATUS.PAID,
  CollectionDate: null,
};

const ALL_INVOICES = [CREST_01, DW_09, DW_07_SAME_QUARTER, DW_08_YEAR_CROSSING, DRAFT_1T, PAID_WITHOUT_LINK];

// ── Fake Postgres ──

/** EXTRACT(YEAR …) / EXTRACT(QUARTER …) over the same two dates the accrual view uses */
const yearOf = (date: Date): number => date.getFullYear();
const quarterOf = (date: Date): number => Math.floor(date.getMonth() / 3) + 1;

const inPeriod = (date: Date | null, year: number, quarter: number): boolean =>
  date !== null && yearOf(date) === year && quarterOf(date) === quarter;

let invoiceRows: InvoiceFixture[] = [];

/**
 * Stands in for the LEFT JOIN onto the payment transaction and for the WHERE that keeps only
 * issued invoices touching the viewed period. The classification itself is left entirely to the
 * repository — this hands back rows, never a verdict.
 */
const mockQuery = jest.fn(async (sql: string, params: unknown[]) => {
  if (!sql.includes('"InvoiceQuarter"')) return [];

  const [, statuses, year, quarter] = params as [number, string[], number, number];

  return invoiceRows
    .filter((row) => statuses.includes(row.Status))
    .filter((row) => inPeriod(row.InvoiceDate, year, quarter) || inPeriod(row.CollectionDate, year, quarter))
    .sort((a, b) => a.InvoiceDate.getTime() - b.InvoiceDate.getTime() || a.InvoiceID - b.InvoiceID)
    .map((row) => ({
      InvoiceID: row.InvoiceID,
      InvoiceNumber: row.InvoiceNumber,
      ClientName: row.ClientName,
      TotalCents: row.TotalCents,
      // Projected because the classification needs it: without "Status" a paid invoice that lost
      // its movement is indistinguishable from one nobody has paid
      Status: row.Status,
      InvoiceDate: row.InvoiceDate,
      InvoiceYear: yearOf(row.InvoiceDate),
      InvoiceQuarter: quarterOf(row.InvoiceDate),
      CollectionDate: row.CollectionDate,
      CollectionYear: row.CollectionDate === null ? null : yearOf(row.CollectionDate),
      CollectionQuarter: row.CollectionDate === null ? null : quarterOf(row.CollectionDate),
    }));
});

jest.mock('@/services/database/connection', () => ({
  query: (...args: [string, unknown[]]) => mockQuery(...args),
  getPool: jest.fn(),
}));

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 2),
}));

// The repository pulls in @vercel/blob for the finalize/cancel paths; loading the real package
// under the node test environment blows up on undici's ReadableStream and nothing here uses it.
jest.mock('@vercel/blob', () => ({ del: jest.fn() }));

import { getCrossQuarterInvoices } from '@/services/database/InvoiceRepository';

const idsOf = async (year: number, quarter: number): Promise<number[]> =>
  (await getCrossQuarterInvoices(year, quarter)).map((invoice) => invoice.invoiceId);

// ── Tests ──

beforeEach(() => {
  mockQuery.mockClear();
  invoiceRows = ALL_INVOICES;
});

describe('CREST-01 — declared in 1T 2026, collected in 2T 2026', () => {
  it('should report it from 1T as declared here and collected later', async () => {
    const reported = await getCrossQuarterInvoices(2026, 1);
    const crest = reported.find((invoice) => invoice.invoiceId === CREST_01.InvoiceID);

    expect(crest).toEqual({
      invoiceId: 9,
      invoiceNumber: 'CREST-01',
      clientName: 'Crest Studios',
      totalCents: 60_000,
      invoiceDate: '2026-03-14',
      invoiceYear: 2026,
      invoiceQuarter: 1,
      collectionDate: '2026-04-26',
      collectionYear: 2026,
      collectionQuarter: 2,
      crossQuarterCase: CROSS_QUARTER_CASE.COLLECTED_IN_ANOTHER_PERIOD,
      // Both filings belong to the Renta 2026, so this is the milder of the two crossings
      crossesFiscalYear: false,
    });
  });

  it('should report it from 2T as money that landed here and no modelo of 2T counts', async () => {
    const reported = await getCrossQuarterInvoices(2026, 2);
    const crest = reported.find((invoice) => invoice.invoiceId === CREST_01.InvoiceID);

    // This is the one that misled: the April bank statement shows 600,00 € the 2T 303 must not
    // include. Reading the statement instead of the modelo is what put 26.475,00 € in casilla 120.
    expect(crest?.crossQuarterCase).toBe(CROSS_QUARTER_CASE.DECLARED_IN_EARLIER_PERIOD);
    expect(crest?.invoiceQuarter).toBe(1);
    expect(crest?.collectionQuarter).toBe(2);
    expect(crest?.totalCents).toBe(60_000);
  });

  it('should say nothing about it from a quarter it neither belongs to nor was collected in', async () => {
    expect(await idsOf(2026, 3)).not.toContain(CREST_01.InvoiceID);
  });
});

describe('DW-09 — issued in 3T 2026 and never collected', () => {
  it('should report it from 3T as declared here with no collection on record', async () => {
    const reported = await getCrossQuarterInvoices(2026, 3);
    const dw09 = reported.find((invoice) => invoice.invoiceId === DW_09.InvoiceID);

    expect(dw09).toMatchObject({
      invoiceNumber: 'DW-09',
      totalCents: 120_000,
      invoiceDate: '2026-08-03',
      invoiceQuarter: 3,
      crossQuarterCase: CROSS_QUARTER_CASE.ISSUED_NOT_COLLECTED,
      crossesFiscalYear: false,
    });
    // No transaction to date it by, so the collection side stays empty rather than guessing
    expect(dw09?.collectionDate).toBeNull();
    expect(dw09?.collectionYear).toBeNull();
    expect(dw09?.collectionQuarter).toBeNull();
  });

  it('should not report it from the quarter before it was issued', async () => {
    expect(await idsOf(2026, 2)).not.toContain(DW_09.InvoiceID);
  });
});

describe('an invoice issued and collected in the same quarter is never reported', () => {
  it.each([
    ['the quarter it belongs to', 2],
    ['the quarter before', 1],
    ['the quarter after', 3],
  ])('should stay silent about DW-07 seen from %s', async (_case, quarter) => {
    expect(await idsOf(2026, quarter)).not.toContain(DW_07_SAME_QUARTER.InvoiceID);
  });

  it('should report nothing at all for a quarter whose invoices all agree with the bank', async () => {
    invoiceRows = [DW_07_SAME_QUARTER];

    expect(await getCrossQuarterInvoices(2026, 2)).toEqual([]);
  });
});

describe('a crossing of fiscal year is flagged as the worse variant', () => {
  it('should mark DW-08 as year-crossing from the quarter it was declared in', async () => {
    const reported = await getCrossQuarterInvoices(2025, 4);
    const dw08 = reported.find((invoice) => invoice.invoiceId === DW_08_YEAR_CROSSING.InvoiceID);

    expect(dw08).toMatchObject({
      invoiceDate: '2025-12-22',
      invoiceYear: 2025,
      invoiceQuarter: 4,
      collectionDate: '2026-01-15',
      collectionYear: 2026,
      collectionQuarter: 1,
      crossQuarterCase: CROSS_QUARTER_CASE.COLLECTED_IN_ANOTHER_PERIOD,
      // The income is declared in the Renta 2025 while the money is in the 2026 bank year
      crossesFiscalYear: true,
    });
  });

  it('should mark DW-08 as year-crossing from the quarter the money landed in too', async () => {
    const reported = await getCrossQuarterInvoices(2026, 1);
    const dw08 = reported.find((invoice) => invoice.invoiceId === DW_08_YEAR_CROSSING.InvoiceID);

    expect(dw08?.crossQuarterCase).toBe(CROSS_QUARTER_CASE.DECLARED_IN_EARLIER_PERIOD);
    expect(dw08?.crossesFiscalYear).toBe(true);
  });

  it('should not mark an ordinary quarter crossing as a year crossing', async () => {
    const reported = await getCrossQuarterInvoices(2026, 1);
    const crest = reported.find((invoice) => invoice.invoiceId === CREST_01.InvoiceID);

    expect(crest?.crossesFiscalYear).toBe(false);
  });
});

describe('what never reaches the warning at all', () => {
  it('should never report a draft: it is not issued and enters no modelo', async () => {
    expect(await idsOf(2026, 1)).not.toContain(DRAFT_1T.InvoiceID);
  });

  it('should delegate the exclusion of drafts to the query, not to the classification', async () => {
    await getCrossQuarterInvoices(2026, 1);
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];

    // The status filter is bound as a parameter from ISSUED_INVOICE_STATUSES — the same pair
    // "vw_FiscalAccrual" hardcodes — so the two can never disagree about what "issued" means
    expect(params[1]).toEqual([...ISSUED_INVOICE_STATUSES]);
  });

  it('should not let a paid invoice with no linked transaction masquerade as collected elsewhere', async () => {
    const reported = await getCrossQuarterInvoices(2026, 1);
    const orphan = reported.find((invoice) => invoice.invoiceId === PAID_WITHOUT_LINK.InvoiceID);

    // A missing link is missing knowledge, not evidence of a crossing: with no "TransactionID"
    // there is no date to compare, so it can never be presented as collected in another quarter.
    expect(orphan?.crossQuarterCase).not.toBe(CROSS_QUARTER_CASE.COLLECTED_IN_ANOTHER_PERIOD);
    expect(orphan?.crossesFiscalYear).toBe(false);
    expect(orphan?.collectionDate).toBeNull();
  });
});

describe('CREST-00 — marked paid with the link to its movement lost', () => {
  it('should report it as a lost link and not as an invoice waiting to be paid', async () => {
    const reported = await getCrossQuarterInvoices(2026, 1);
    const orphan = reported.find((invoice) => invoice.invoiceId === PAID_WITHOUT_LINK.InvoiceID);

    // The distinction this case exists for: the money DID arrive — the invoice is 'paid' — and
    // only the pointer to the movement is gone. Reporting it as *sin cobro registrado*, the way
    // DW-09 is reported, would read as *aún no cobrada* and put a fiscal alarm on a broken record.
    expect(orphan?.crossQuarterCase).toBe(CROSS_QUARTER_CASE.PAID_WITHOUT_LINKED_MOVEMENT);
    expect(orphan?.crossQuarterCase).not.toBe(CROSS_QUARTER_CASE.ISSUED_NOT_COLLECTED);
  });

  it('should keep DW-09 on the fiscal case, so the two never share one label', async () => {
    const reported = await getCrossQuarterInvoices(2026, 3);
    const dw09 = reported.find((invoice) => invoice.invoiceId === DW_09.InvoiceID);

    // Same shape in the row — no collection date — and a different verdict, because 'finalized'
    // means nobody has paid and the IVA is owed on issue anyway.
    expect(dw09?.crossQuarterCase).toBe(CROSS_QUARTER_CASE.ISSUED_NOT_COLLECTED);
  });

  it('should never surface it from the quarter money may actually have arrived in', async () => {
    // The cost of the lost link, pinned: with no collection date the WHERE only ever admits the
    // invoice from its own quarter, so case (c) — money landing here for an invoice declared
    // earlier — cannot be computed for it at all. Nothing may imply 2T's list is complete.
    expect(await idsOf(2026, 2)).not.toContain(PAID_WITHOUT_LINK.InvoiceID);
    expect(await idsOf(2026, 3)).not.toContain(PAID_WITHOUT_LINK.InvoiceID);
  });

  it('should read the status from the row rather than infer it from the missing link', async () => {
    await getCrossQuarterInvoices(2026, 1);
    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];

    // If the projection ever drops "Status" the classification silently collapses back into one
    // case, and every test above would still pass on undefined — hence pinning the SELECT itself.
    expect(sql).toContain('i."Status"');
  });
});
