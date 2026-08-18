/**
 * Integration Tests: the art. 80.Cuatro LIVA clock over uncollected invoices
 *
 * An invoice that will not be paid lets the output VAT already declared on it be recovered, by
 * issuing a factura rectificativa within a window and telling the AEAT within a month. The window
 * is a plazo de caducidad: missing it loses the right for good. These tests pin the two halves of
 * the module — the gate that decides whether the article reaches an invoice at all, and the dates.
 *
 * The gate matters more than the query, and it is FAIL-CLOSED. The live portfolio is services to
 * businesses established outside the TAI, no sujetas por reglas de localización (art. 69.Uno.1.º
 * LIVA), declared in casilla 120 with no cuota repercutida. Not one of those invoices enters the
 * clock, and the correct behaviour of this module on the real database is to be empty:
 *
 *   DW-09 (id 10) — 1.200,00 €, 'finalized' 3-ago-2026, never collected, RMCI Alerts Pty Ltd
 *     (Australia), "VatPercent" = 0. Out on TWO independent grounds: there is no cuota to recover
 *     (art. 80.Cuatro reduces the base «de las cuotas repercutidas por las operaciones gravadas»),
 *     and the destinatario is not established in the TAI, Canarias, Ceuta o Melilla
 *     (art. 80.Cinco.2.ª — and art. 24.2.a).2.º RIVA makes filing the 952 an express declaration
 *     that it is not such an operation, so doing it would be declaring something false).
 *   CREST-01 (id 9) — 600,00 € issued 15-mar-2026, collected 27-abr-2026. Collected, so there is
 *     no impagado at all; it never even reaches the gate.
 *
 * Everything prefixed ES- below is HYPOTHETICAL, not live data: the user has no invoice with
 * Spanish output VAT to a Spanish client, and without one the clock could not be tested at all.
 * They are the only fixtures here that are not real.
 *
 * Nothing in this module issues a rectificativa, files a 952 or changes an invoice's status — the
 * last test in the file is what keeps it that way.
 */

import {
  BAD_DEBT_EXCLUSION,
  BAD_DEBT_STAGE,
  BAD_DEBT_WAITING_TERM,
  INVOICE_STATUS,
  ISSUED_INVOICE_STATUSES,
} from '@/constants/finance';
import type { BadDebtInvoice, BadDebtWaitingTerm, BadDebtWindow, InvoiceStatus } from '@/types/finance';

// ── Fixtures ──

interface InvoiceFixture {
  InvoiceID: number;
  InvoiceNumber: string | null;
  ClientName: string;
  ClientCountry: string | null;
  InvoiceDate: Date;
  BaseCents: number;
  VatPercent: number;
  VatCents: number;
  TotalCents: number;
  Status: InvoiceStatus;
  TransactionID: number | null;
}

/** Built the way node-postgres hands a DATE back — midnight LOCAL — so no fixture drifts a day */
const day = (isoDay: string): Date => new Date(`${isoDay}T00:00:00`);

/** LIVE. Uncollected, and out of the article on two independent grounds */
const DW_09: InvoiceFixture = {
  InvoiceID: 10,
  InvoiceNumber: 'DW-09',
  ClientName: 'RMCI Alerts Pty Ltd',
  ClientCountry: 'Australia',
  InvoiceDate: day('2026-08-03'),
  BaseCents: 120_000,
  VatPercent: 0,
  VatCents: 0,
  TotalCents: 120_000,
  Status: INVOICE_STATUS.FINALIZED,
  TransactionID: null,
};

/** LIVE. Collected on 27-abr-2026: no impagado, and the query never even hands it to the gate */
const CREST_01: InvoiceFixture = {
  InvoiceID: 9,
  InvoiceNumber: 'CREST-01',
  ClientName: 'Crest Advisors',
  ClientCountry: 'Australia',
  InvoiceDate: day('2026-03-15'),
  BaseCents: 60_000,
  VatPercent: 0,
  VatCents: 0,
  TotalCents: 60_000,
  Status: INVOICE_STATUS.PAID,
  TransactionID: 3815,
};

/** Marked 'paid' with its "TransactionID" lost: collected, and the app cannot say when */
const CREST_00_LOST_LINK: InvoiceFixture = {
  InvoiceID: 12,
  InvoiceNumber: 'CREST-00',
  ClientName: 'Crest Advisors',
  ClientCountry: 'Australia',
  InvoiceDate: day('2026-03-05'),
  BaseCents: 30_000,
  VatPercent: 0,
  VatCents: 0,
  TotalCents: 30_000,
  Status: INVOICE_STATUS.PAID,
  TransactionID: null,
};

/** HYPOTHETICAL. The only shape the clock runs on: cuota repercutida, cliente establecido */
const ES_01_SPANISH_VAT: InvoiceFixture = {
  InvoiceID: 101,
  InvoiceNumber: 'ES-01',
  ClientName: 'Talleres Ribera SL',
  ClientCountry: 'España',
  InvoiceDate: day('2026-03-15'),
  BaseCents: 100_000,
  VatPercent: 21,
  VatCents: 21_000,
  TotalCents: 121_000,
  Status: INVOICE_STATUS.FINALIZED,
  TransactionID: null,
};

/** HYPOTHETICAL. Accrued on a 31st, where «de fecha a fecha» has to fall back to the month end */
const ES_02_MONTH_END: InvoiceFixture = {
  ...ES_01_SPANISH_VAT,
  InvoiceID: 102,
  InvoiceNumber: 'ES-02',
  InvoiceDate: day('2026-08-31'),
};

/** HYPOTHETICAL. Spanish client, no cuota: nothing to recover, so no right can lapse */
const ES_03_NO_VAT: InvoiceFixture = {
  ...ES_01_SPANISH_VAT,
  InvoiceID: 103,
  InvoiceNumber: 'ES-03',
  VatPercent: 0,
  VatCents: 0,
  TotalCents: 100_000,
};

/** HYPOTHETICAL. Cuota repercutida to a client outside the TAI: the second ground, on its own */
const ES_04_FOREIGN_CLIENT: InvoiceFixture = {
  ...ES_01_SPANISH_VAT,
  InvoiceID: 104,
  InvoiceNumber: 'ES-04',
  ClientCountry: 'Portugal',
};

/** HYPOTHETICAL. The snapshot does not say where the client is — unknown is not a yes */
const ES_05_COUNTRY_UNKNOWN: InvoiceFixture = {
  ...ES_01_SPANISH_VAT,
  InvoiceID: 105,
  InvoiceNumber: 'ES-05',
  ClientCountry: null,
};

/** The real database, as it stands: nothing the article reaches */
const LIVE_INVOICES = [DW_09, CREST_01, CREST_00_LOST_LINK];

const ALL_INVOICES = [
  ...LIVE_INVOICES,
  ES_01_SPANISH_VAT,
  ES_02_MONTH_END,
  ES_03_NO_VAT,
  ES_04_FOREIGN_CLIENT,
  ES_05_COUNTRY_UNKNOWN,
];

// ── Fake Postgres ──

let invoiceRows: InvoiceFixture[] = [];

/**
 * Stands in for the WHERE only: issued invoices carrying no payment movement. It hands back rows
 * and never a verdict — every exclusion in this file has to come from the gate in the repository.
 */
const mockQuery = jest.fn(async (sql: string, params: unknown[]) => {
  if (!sql.includes('"ClientCountry"')) return [];

  const [, statuses] = params as [number, string[]];

  return invoiceRows
    .filter((row) => statuses.includes(row.Status))
    .filter((row) => row.TransactionID === null)
    .sort((a, b) => a.InvoiceDate.getTime() - b.InvoiceDate.getTime() || a.InvoiceID - b.InvoiceID);
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

import { getBadDebtReport } from '@/services/database/InvoiceRepository';

const findInvoice = (invoices: BadDebtInvoice[], fixture: InvoiceFixture): BadDebtInvoice | undefined =>
  invoices.find((invoice) => invoice.invoiceId === fixture.InvoiceID);

const windowOf = (invoice: BadDebtInvoice | undefined, term: BadDebtWaitingTerm): BadDebtWindow | undefined =>
  invoice?.windows.find((candidate) => candidate.term === term);

/** ES-01's six-month window on a given day, the one every boundary test below reads */
const sixMonthWindowOn = async (asOfDate: string): Promise<BadDebtWindow | undefined> => {
  const report = await getBadDebtReport(asOfDate);
  return windowOf(findInvoice(report.tracked, ES_01_SPANISH_VAT), BAD_DEBT_WAITING_TERM.PYME_SIX_MONTHS);
};

// ── Tests ──

beforeEach(() => {
  mockQuery.mockClear();
  invoiceRows = ALL_INVOICES;
});

describe('the gate — which invoices art. 80.Cuatro reaches at all', () => {
  it('should leave the module empty on the live portfolio, and say why for each invoice', async () => {
    invoiceRows = LIVE_INVOICES;

    const report = await getBadDebtReport('2026-08-18');

    // Empty is the CORRECT answer here, not a bug — and an empty list with no explanation reads
    // as one, which is why every invoice the gate stopped is still returned with its reason.
    expect(report.tracked).toEqual([]);
    expect(report.outOfScope.map((invoice) => invoice.invoiceNumber)).toEqual(['CREST-00', 'DW-09']);
  });

  it('should rule DW-09 out because there is no cuota repercutida to recover', async () => {
    const report = await getBadDebtReport('2026-08-18');
    const dw09 = findInvoice(report.outOfScope, DW_09);

    // Its 1.200,00 € carry 0,00 € of IVA: a rectificativa would move the 303 by nothing, so
    // letting the window pass costs the user no right at all.
    expect(dw09?.exclusion).toBe(BAD_DEBT_EXCLUSION.NO_OUTPUT_VAT);
    expect(dw09?.vatCents).toBe(0);
    expect(dw09?.windows).toEqual([]);
    expect(dw09?.needsAttention).toBe(false);
    expect(findInvoice(report.tracked, DW_09)).toBeUndefined();
  });

  it('should rule out a foreign client on its own ground, cuota or no cuota', async () => {
    const report = await getBadDebtReport('2026-08-18');

    // art. 80.Cinco.2.ª is independent of the cuota: ES-04 carries 21 % and is still out. This is
    // the second of the two grounds DW-09 would fail on if it had ever charged VAT.
    expect(findInvoice(report.outOfScope, ES_04_FOREIGN_CLIENT)?.exclusion).toBe(
      BAD_DEBT_EXCLUSION.RECIPIENT_NOT_ESTABLISHED,
    );
    expect(findInvoice(report.outOfScope, ES_04_FOREIGN_CLIENT)?.vatCents).toBe(21_000);
  });

  it('should refuse to guess when the snapshot does not say where the client is', async () => {
    const report = await getBadDebtReport('2026-08-18');

    // Fail-closed: an unknown country never opens the module. Offering the clock here would
    // invite a 952 whose express declaration about the destinatario nobody can stand behind.
    expect(findInvoice(report.outOfScope, ES_05_COUNTRY_UNKNOWN)?.exclusion).toBe(
      BAD_DEBT_EXCLUSION.RECIPIENT_ESTABLISHMENT_UNKNOWN,
    );
    expect(findInvoice(report.tracked, ES_05_COUNTRY_UNKNOWN)).toBeUndefined();
  });

  it('should rule out a Spanish client who was charged no VAT', async () => {
    const report = await getBadDebtReport('2026-08-18');

    expect(findInvoice(report.outOfScope, ES_03_NO_VAT)?.exclusion).toBe(BAD_DEBT_EXCLUSION.NO_OUTPUT_VAT);
  });

  it('should track only the invoice that carries a cuota and a client established in Spain', async () => {
    const report = await getBadDebtReport('2026-08-18');

    expect(report.tracked.map((invoice) => invoice.invoiceNumber)).toEqual(['ES-01', 'ES-02']);
    expect(report.tracked.every((invoice) => invoice.exclusion === null)).toBe(true);
  });
});

describe('a collection whose link was lost is not an impagado', () => {
  it('should rule CREST-00 out as collected, not as an invoice waiting to be paid', async () => {
    const report = await getBadDebtReport('2026-08-18');
    const orphan = findInvoice(report.outOfScope, CREST_00_LOST_LINK);

    // It is 'paid': the money arrived and only the pointer to the movement is gone. Putting a
    // recovery clock on it would chase VAT on income the user already has.
    expect(orphan?.exclusion).toBe(BAD_DEBT_EXCLUSION.COLLECTED);
    expect(orphan?.windows).toEqual([]);
  });

  it('should let the gate decide that, not the WHERE clause', async () => {
    await getBadDebtReport('2026-08-18');
    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];

    // The query selects on the NULL link alone, so CREST-00 is admitted and then excluded by
    // status. Filtering 'paid' out in SQL would have buried the distinction in a predicate.
    expect(sql).toContain('"TransactionID" IS NULL');
    expect(sql).not.toContain(INVOICE_STATUS.PAID);
  });

  it('should never consider an invoice whose payment movement is still linked', async () => {
    const report = await getBadDebtReport('2026-08-18');

    // CREST-01 was collected on 27-abr-2026 and the link proves it: no impagado, nothing to say.
    expect(findInvoice(report.tracked, CREST_01)).toBeUndefined();
    expect(findInvoice(report.outOfScope, CREST_01)).toBeUndefined();
  });

  it('should take the issued statuses from the same constant every fiscal reader uses', async () => {
    await getBadDebtReport('2026-08-18');
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(params[1]).toEqual([...ISSUED_INVOICE_STATUSES]);
  });
});

describe('the window — art. 80.Cuatro.A).1.ª and B), on ES-01 accrued 15-mar-2026', () => {
  it('should offer both terms as labelled alternatives, shortest first', async () => {
    const report = await getBadDebtReport('2026-08-18');
    const es01 = findInvoice(report.tracked, ES_01_SPANISH_VAT);

    // «podrá ser, de seis meses o un año»: the choice is the taxpayer's, nothing in the data model
    // records it, and that a lapsed six-month window leaves the one-year one intact is NOT
    // CONFIRMED by any DGT ruling found. So both are shown and neither is assumed away.
    expect(es01?.windows.map((window) => window.term)).toEqual([
      BAD_DEBT_WAITING_TERM.PYME_SIX_MONTHS,
      BAD_DEBT_WAITING_TERM.GENERAL_ONE_YEAR,
    ]);
    expect(windowOf(es01, BAD_DEBT_WAITING_TERM.PYME_SIX_MONTHS)).toMatchObject({
      waitingMonths: 6,
      windowStartDate: '2026-09-15',
      windowEndDate: '2027-03-15',
    });
    expect(windowOf(es01, BAD_DEBT_WAITING_TERM.GENERAL_ONE_YEAR)).toMatchObject({
      waitingMonths: 12,
      windowStartDate: '2027-03-15',
      windowEndDate: '2027-09-15',
    });
  });

  it('should still be waiting the day before the window opens', async () => {
    expect(await sixMonthWindowOn('2026-09-14')).toMatchObject({
      stage: BAD_DEBT_STAGE.WAITING,
      daysUntilWindowStart: 1,
      daysRemainingInWindow: null,
    });
  });

  it('should be open on the day the waiting term completes', async () => {
    // The term is «un año … sin haber obtenido el cobro»: on the anniversary it HAS elapsed, so
    // the rectificativa may be issued that same day. Opening it a day late would eat a day of a
    // plazo de caducidad.
    expect(await sixMonthWindowOn('2026-09-15')).toMatchObject({
      stage: BAD_DEBT_STAGE.IN_WINDOW,
      daysUntilWindowStart: null,
      daysRemainingInWindow: 181,
    });
  });

  it('should still be open on the last day, with nothing left', async () => {
    // Open and out of time on the same day: the closing date is the last day of the plazo, not
    // the first day after it. Zero days remaining is the loudest the module ever gets.
    expect(await sixMonthWindowOn('2027-03-15')).toMatchObject({
      stage: BAD_DEBT_STAGE.IN_WINDOW,
      daysRemainingInWindow: 0,
    });
  });

  it('should be expired the day after it closes, and report no time left', async () => {
    // Caducidad: the right is gone for this term, and no date is offered that would suggest
    // otherwise. The invoice stays listed so the loss is visible.
    expect(await sixMonthWindowOn('2027-03-16')).toMatchObject({
      stage: BAD_DEBT_STAGE.WINDOW_EXPIRED,
      daysUntilWindowStart: null,
      daysRemainingInWindow: null,
    });
  });

  it('should hand over to the one-year window on the very day the six-month one closes', async () => {
    const report = await getBadDebtReport('2027-03-15');
    const es01 = findInvoice(report.tracked, ES_01_SPANISH_VAT);

    // devengo+12m falls exactly on devengo+6m+6m. Both windows are open that day — which is what
    // the contiguity question is about, and precisely why the app shows the two and decides
    // neither.
    expect(windowOf(es01, BAD_DEBT_WAITING_TERM.GENERAL_ONE_YEAR)).toMatchObject({
      stage: BAD_DEBT_STAGE.IN_WINDOW,
      daysRemainingInWindow: 184,
    });
  });

  it('should keep an invoice whose every window has lapsed, without chasing it', async () => {
    const report = await getBadDebtReport('2027-09-16');
    const es01 = findInvoice(report.tracked, ES_01_SPANISH_VAT);

    expect(es01?.windows.map((window) => window.stage)).toEqual([
      BAD_DEBT_STAGE.WINDOW_EXPIRED,
      BAD_DEBT_STAGE.WINDOW_EXPIRED,
    ]);
    // Nothing left to do: it is on screen as a loss on record, not as a deadline.
    expect(es01?.needsAttention).toBe(false);
  });
});

describe('when the clock starts asking for attention', () => {
  it('should raise it 60 days before a window opens', async () => {
    const report = await getBadDebtReport('2026-07-17');

    expect(findInvoice(report.tracked, ES_01_SPANISH_VAT)?.needsAttention).toBe(true);
  });

  it('should stay quiet a day earlier', async () => {
    const report = await getBadDebtReport('2026-07-16');

    // 61 days out. The lead time is a product decision, not a term of the law — the article gives
    // no warning period — so the boundary is pinned here rather than argued about later.
    expect(findInvoice(report.tracked, ES_01_SPANISH_VAT)?.needsAttention).toBe(false);
  });

  it('should raise it while a window is open', async () => {
    const report = await getBadDebtReport('2026-12-01');

    expect(findInvoice(report.tracked, ES_01_SPANISH_VAT)?.needsAttention).toBe(true);
  });
});

describe('a term that ends on a day its month does not have', () => {
  it('should fall back to the last day of the month rather than overshoot it', async () => {
    const report = await getBadDebtReport('2026-09-01');
    const es02 = findInvoice(report.tracked, ES_02_MONTH_END);

    // 31-ago-2026 + 6 meses «de fecha a fecha» is 28-feb-2027 (art. 5.1 Código Civil), not
    // 3-mar-2027: handing the user a later date than the law gives them is how a caducidad is
    // missed. The one-year term lands on 31-ago-2027, and ITS six months end on 29-feb-2028,
    // a day 2028 does have.
    expect(windowOf(es02, BAD_DEBT_WAITING_TERM.PYME_SIX_MONTHS)).toMatchObject({
      windowStartDate: '2027-02-28',
      windowEndDate: '2027-08-28',
    });
    expect(windowOf(es02, BAD_DEBT_WAITING_TERM.GENERAL_ONE_YEAR)).toMatchObject({
      windowStartDate: '2027-08-31',
      windowEndDate: '2028-02-29',
    });
  });
});

describe('the module is a clock, and only a clock', () => {
  it('should read the database once and write to it never', async () => {
    await getBadDebtReport('2026-08-18');

    // No rectificativa, no 952, no status change: art. 80.Cuatro has formalities this app does
    // not perform, and a module that silently moved an invoice would be claiming it had.
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql.trimStart().startsWith('SELECT')).toBe(true);
  });

  it('should report the day it was computed against, so copy and dates cannot disagree', async () => {
    expect((await getBadDebtReport('2026-08-18')).asOfDate).toBe('2026-08-18');
  });

  it('should leave the invoice status untouched in what it returns', async () => {
    const report = await getBadDebtReport('2027-09-16');

    // ES-01's windows have all lapsed and it is still 'finalized'. Nothing about an impagado
    // changes what the invoice IS.
    expect(findInvoice(report.tracked, ES_01_SPANISH_VAT)?.status).toBe(INVOICE_STATUS.FINALIZED);
  });
});
