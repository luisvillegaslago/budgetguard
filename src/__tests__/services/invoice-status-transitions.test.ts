/**
 * Integration Tests: the invoice status machine, including the revert to draft
 *
 * A finalized invoice can be pulled back to draft so it can be corrected before it ever
 * reaches the client. The revert keeps "InvoiceNumber" on the row, and assignInvoiceNumber()
 * is idempotent, so re-issuing the invoice reuses the very same number: the series stays
 * correlative and gapless as RD 1619/2012 demands. Reverting only undoes what finalizing
 * archived — the FiscalDocument row and its PDF blob — never the number itself.
 *
 * That is why a draft is no longer uniformly deletable, and why the machine now branches on
 * the number rather than on the status alone:
 *   - A NUMBERED draft (reverted from finalized, or left behind by a finalization that died
 *     after the number was assigned) may be CANCELLED. Cancelling is the only way to retire a
 *     number while keeping it on record, and deleteInvoice() refuses numbered invoices.
 *   - An UN-NUMBERED draft may NOT be cancelled: it never touched the series, so there is
 *     nothing to preserve and deleting it is the correct disposal.
 *
 * There is no way back to draft from paid (the money is in, an income transaction exists)
 * and cancelled stays terminal: it keeps its number on record.
 *
 * The revert has one further limit: once the AEAT filing that covers the invoice's period has
 * been submitted, the invoice may no longer leave "finalized". Reverting drops it out of
 * "vw_FiscalAccrual" and deletes the archived PDF, so every regenerated report for that quarter
 * would stop matching what was actually declared. Cancelling such an invoice stays allowed —
 * that is the legally correct remedy — and only the finalized → draft revert is refused.
 */

import {
  API_ERROR,
  FISCAL_DOCUMENT_TYPE,
  FISCAL_QUARTER,
  FISCAL_STATUS,
  type FiscalDocumentType,
  type FiscalQuarter,
  type FiscalStatus,
  INVOICE_STATUS,
} from '@/constants/finance';
import type { InvoiceStatus } from '@/types/finance';
import { ValidationError } from '@/utils/apiErrors';

/** The number a finalization already burned on the series. */
const ASSIGNED_NUMBER = 'DW-09';

/**
 * Mid-Q3 2026, and read in UTC by both the finalization and the guard — far enough from any
 * quarter boundary that no timezone can shift it into a neighbouring period.
 */
const INVOICE_DATE = new Date('2026-07-09');
const INVOICE_YEAR = 2026;
const INVOICE_QUARTER = FISCAL_QUARTER.Q3;

/** A "FiscalDocuments" row, reduced to the columns the filed-period lookup predicates on. */
type FiscalModelo = {
  documentType: FiscalDocumentType;
  status: FiscalStatus;
  fiscalYear: number;
  /** NULL on the annual modelos (390, 100), which cover the whole year — CK_FiscalDoc_Quarter. */
  fiscalQuarter: FiscalQuarter | null;
};

/** The AEAT filing that covers the invoice: quarterly modelo, submitted. */
const FILED_SAME_QUARTER: FiscalModelo = {
  documentType: FISCAL_DOCUMENT_TYPE.MODELO,
  status: FISCAL_STATUS.FILED,
  fiscalYear: INVOICE_YEAR,
  fiscalQuarter: INVOICE_QUARTER,
};

/** An annual modelo (390/100): no quarter, yet it declares the invoice's period all the same. */
const FILED_ANNUAL: FiscalModelo = { ...FILED_SAME_QUARTER, fiscalQuarter: null };

/** Submitted, but for a period the invoice does not belong to. */
const FILED_OTHER_QUARTER: FiscalModelo = { ...FILED_SAME_QUARTER, fiscalQuarter: FISCAL_QUARTER.Q1 };
const FILED_OTHER_YEAR: FiscalModelo = { ...FILED_SAME_QUARTER, fiscalYear: INVOICE_YEAR - 1 };

/** The right period, but the modelo has not been submitted yet, so nothing is committed to. */
const PENDING_SAME_QUARTER: FiscalModelo = { ...FILED_SAME_QUARTER, status: FISCAL_STATUS.PENDING };

let currentStatus: string = INVOICE_STATUS.DRAFT;
let currentNumber: string | null = null;
/** The "FiscalDocuments" rows the user has, as seen by the filed-period lookup. */
let fiscalModelos: FiscalModelo[] = [];

function invoiceRow() {
  return {
    InvoiceID: 1,
    PrefixID: 1,
    InvoiceNumber: currentNumber,
    InvoiceDate: INVOICE_DATE,
    CompanyID: 2,
    TransactionID: null,
    BaseCents: 100000,
    VatPercent: 0,
    VatCents: 0,
    RetentionPercent: 0,
    RetentionCents: 0,
    TotalCents: 100000,
    Currency: 'EUR',
    Status: currentStatus,
    BillerName: 'Luis',
    BillerNif: '00000000X',
    BillerPaymentMethod: 'bank_transfer',
    ClientName: 'Acme',
    Notes: null,
    InvoiceLanguage: 'es',
    CreatedAt: new Date('2026-07-09'),
    UpdatedAt: new Date('2026-07-09'),
  };
}

/**
 * Answer the filed-period lookup with the modelos that its own predicates actually select.
 *
 * The row is matched against the bound parameters rather than against a hardcoded position,
 * so the assertion survives a reordering of the WHERE clause but still fails if the lookup
 * stops binding the document type, the filing status or the fiscal year. The NULL-quarter
 * branch has no parameter to match on, so it is read off the statement itself: an annual
 * modelo counts only when the SQL really spells out `"FiscalQuarter" IS NULL`.
 */
function selectsModelo(sql: string, params: readonly unknown[], modelo: FiscalModelo): boolean {
  if (!params.includes(modelo.documentType)) return false;
  if (!params.includes(modelo.status)) return false;
  if (!params.includes(modelo.fiscalYear)) return false;
  if (modelo.fiscalQuarter === null) return sql.includes('"FiscalQuarter" IS NULL');
  return params.includes(modelo.fiscalQuarter);
}

const client = {
  query: jest.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('FROM "Invoices"') && sql.includes('FOR UPDATE')) return { rows: [invoiceRow()] };
    if (sql.includes('FROM "InvoiceLineItems"')) return { rows: [] };
    // Order matters: the DELETE also reads `FROM "FiscalDocuments"`.
    if (sql.includes('DELETE FROM "FiscalDocuments"')) return { rows: [] };
    if (sql.includes('FROM "FiscalDocuments"')) {
      const selected = fiscalModelos.filter((modelo) => selectsModelo(sql, params ?? [], modelo));
      return { rows: selected.map(() => ({ exists: true })) };
    }
    return { rows: [] };
  }),
  release: jest.fn(),
};

jest.mock('@/services/database/connection', () => ({
  getPool: () => ({ connect: async () => client }),
  query: jest.fn(async () => []),
}));

// Deliberately outside 1..4: the filed-period lookup binds the user id alongside the fiscal
// quarter, and `selectsModelo` matches parameters by value, so an id that could be mistaken
// for a quarter would make a modelo of that quarter match every time.
jest.mock('@/libs/auth', () => ({ getUserIdOrThrow: jest.fn(async () => 7) }));
jest.mock('@vercel/blob', () => ({ del: jest.fn() }));

import { updateInvoiceStatus } from '@/services/database/InvoiceRepository';

/** The i18n key an error carries: `errorKey` for typed API errors, the message otherwise. */
function errorKeyOf(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const { errorKey } = error as Error & { errorKey?: string };
  return errorKey ?? error.message;
}

/**
 * Options shared by both drivers. `numbered` overrides whether the row carries an
 * InvoiceNumber, which is independent of the status: a draft is un-numbered unless it was
 * reverted from finalized. `filed` seeds the "FiscalDocuments" rows the user already has.
 */
type TransitionOptions = { numbered?: boolean; filed?: FiscalModelo[] };

/** Drive one transition and report the error it threw, if any. */
async function run(from: InvoiceStatus, to: InvoiceStatus, options: TransitionOptions): Promise<{ thrown?: unknown }> {
  currentStatus = from;
  currentNumber = (options.numbered ?? from !== INVOICE_STATUS.DRAFT) ? ASSIGNED_NUMBER : null;
  fiscalModelos = options.filed ?? [];
  try {
    await updateInvoiceStatus(1, to, { categoryId: 5 });
    return {};
  } catch (thrown) {
    return { thrown };
  }
}

/** Drive one transition, reading any refusal by the state machine itself as a rejection. */
async function attempt(
  from: InvoiceStatus,
  to: InvoiceStatus,
  options: TransitionOptions = {},
): Promise<'allowed' | 'rejected'> {
  const { thrown } = await run(from, to, options);
  if (!thrown) return 'allowed';
  if (errorKeyOf(thrown) === API_ERROR.INVOICE.INVALID_STATUS_TRANSITION) return 'rejected';
  throw thrown;
}

/** Every SQL statement the transaction ran, concatenated for substring assertions. */
function executedSql(): string {
  return client.query.mock.calls.map(([sql]) => sql).join('\n');
}

/**
 * Fails unless the invoice row was updated without any write to "InvoiceNumber".
 *
 * Asserting on the SQL *values* would be worthless — the repository binds every value as a
 * parameter, so a regression that nulled the number would emit `"InvoiceNumber" = $2` and no
 * literal NULL. The column name is the tell: a statement that never names the column cannot
 * write to it, whatever its parameters are.
 */
function expectNumberUntouched(): void {
  const updates = client.query.mock.calls.filter(([sql]) => sql.includes('UPDATE "Invoices"'));

  expect(updates.length).toBeGreaterThan(0);
  updates.forEach(([sql]) => {
    expect(sql).not.toContain('InvoiceNumber');
  });
}

/**
 * Fails unless the rejected transition left the database exactly as it found it.
 *
 * A refusal that still ran its writes would be worse than no guard at all: the FiscalDocument
 * and its PDF would already be gone by the time the error surfaced.
 */
function expectNothingWritten(): void {
  const sql = executedSql();

  expect(sql).not.toContain('DELETE FROM "FiscalDocuments"');
  expect(sql).not.toContain('UPDATE "Invoices"');
}

describe('invoice status transitions', () => {
  beforeEach(() => {
    client.query.mockClear();
    fiscalModelos = [];
  });

  it.each([
    [INVOICE_STATUS.DRAFT, INVOICE_STATUS.FINALIZED],
    [INVOICE_STATUS.FINALIZED, INVOICE_STATUS.DRAFT],
    [INVOICE_STATUS.FINALIZED, INVOICE_STATUS.PAID],
    [INVOICE_STATUS.FINALIZED, INVOICE_STATUS.CANCELLED],
    [INVOICE_STATUS.PAID, INVOICE_STATUS.CANCELLED],
  ])('allows %s → %s', async (from, to) => {
    expect(await attempt(from, to)).toBe('allowed');
  });

  it('never clears the invoice number when reverting to draft', async () => {
    await attempt(INVOICE_STATUS.FINALIZED, INVOICE_STATUS.DRAFT);

    // DW-09 stays on the row, so re-issuing reuses it instead of burning the next one.
    expectNumberUntouched();
  });

  it('deletes the archived fiscal document when reverting to draft', async () => {
    await attempt(INVOICE_STATUS.FINALIZED, INVOICE_STATUS.DRAFT);

    // Otherwise re-issuing would archive a second FiscalDocument for the same number.
    expect(executedSql()).toContain('DELETE FROM "FiscalDocuments"');
  });

  it('refuses to un-pay an invoice, whose income transaction already exists', async () => {
    expect(await attempt(INVOICE_STATUS.PAID, INVOICE_STATUS.DRAFT)).toBe('rejected');
    expect(await attempt(INVOICE_STATUS.PAID, INVOICE_STATUS.FINALIZED)).toBe('rejected');
  });

  it('refuses to resurrect a cancelled invoice', async () => {
    expect(await attempt(INVOICE_STATUS.CANCELLED, INVOICE_STATUS.DRAFT)).toBe('rejected');
    expect(await attempt(INVOICE_STATUS.CANCELLED, INVOICE_STATUS.PAID)).toBe('rejected');
    expect(await attempt(INVOICE_STATUS.CANCELLED, INVOICE_STATUS.FINALIZED)).toBe('rejected');
  });

  it('refuses to pay a draft, numbered or not, since it was never issued', async () => {
    expect(await attempt(INVOICE_STATUS.DRAFT, INVOICE_STATUS.PAID, { numbered: false })).toBe('rejected');
    expect(await attempt(INVOICE_STATUS.DRAFT, INVOICE_STATUS.PAID, { numbered: true })).toBe('rejected');
  });

  it('allows cancelling a numbered draft, the only way to retire the number on record', async () => {
    // A reverted draft still owns DW-09 and deleteInvoice() refuses it, so cancelling is the
    // only disposal that leaves the series correlative.
    expect(await attempt(INVOICE_STATUS.DRAFT, INVOICE_STATUS.CANCELLED, { numbered: true })).toBe('allowed');
  });

  it('refuses to cancel an un-numbered draft, which has nothing to keep on record', async () => {
    // It never consumed a number: deleteInvoice() is the right disposal, not a cancelled row.
    expect(await attempt(INVOICE_STATUS.DRAFT, INVOICE_STATUS.CANCELLED, { numbered: false })).toBe('rejected');
  });

  it('never clears the invoice number when cancelling', async () => {
    await attempt(INVOICE_STATUS.FINALIZED, INVOICE_STATUS.CANCELLED);

    // The number stays; only the fiscal document and its PDF are cleaned up.
    expectNumberUntouched();
    expect(executedSql()).toContain('DELETE FROM "FiscalDocuments"');
  });

  it('keeps the number when cancelling a numbered draft', async () => {
    await attempt(INVOICE_STATUS.DRAFT, INVOICE_STATUS.CANCELLED, { numbered: true });

    expectNumberUntouched();
  });
});

describe('reverting an invoice whose fiscal period is already filed', () => {
  beforeEach(() => {
    client.query.mockClear();
    fiscalModelos = [];
  });

  it('refuses the revert once the quarter it belongs to has been filed', async () => {
    const { thrown } = await run(INVOICE_STATUS.FINALIZED, INVOICE_STATUS.DRAFT, { filed: [FILED_SAME_QUARTER] });

    // A caller fault, not a 500: withApiHandler needs the typed error to answer 400 with the
    // i18n key, which the invoice detail page renders inside the revert modal.
    expect(thrown).toBeInstanceOf(ValidationError);
    expect(errorKeyOf(thrown)).toBe(API_ERROR.INVOICE.PERIOD_ALREADY_FILED);
  });

  it('refuses the revert when the year was filed through an annual modelo with no quarter', async () => {
    // The 390 and the 100 store a NULL quarter (CK_FiscalDoc_Quarter) and declare the whole
    // year, so a lookup that only compares "FiscalQuarter" = 3 would wave this invoice through
    // and silently break a report that has already been submitted.
    const { thrown } = await run(INVOICE_STATUS.FINALIZED, INVOICE_STATUS.DRAFT, { filed: [FILED_ANNUAL] });

    expect(thrown).toBeInstanceOf(ValidationError);
    expect(errorKeyOf(thrown)).toBe(API_ERROR.INVOICE.PERIOD_ALREADY_FILED);
  });

  it('writes nothing when it refuses the revert', async () => {
    await run(INVOICE_STATUS.FINALIZED, INVOICE_STATUS.DRAFT, { filed: [FILED_SAME_QUARTER] });

    // The archived PDF and its FiscalDocument row are the evidence backing what was declared:
    // the guard has to fire before the cleanup, not after it.
    expectNothingWritten();
  });

  it('still allows the revert when the filing does not cover the invoice', async () => {
    // Q1 of the same year, and Q3 of the previous one: neither declared this invoice.
    expect(
      await attempt(INVOICE_STATUS.FINALIZED, INVOICE_STATUS.DRAFT, { filed: [FILED_OTHER_QUARTER, FILED_OTHER_YEAR] }),
    ).toBe('allowed');
  });

  it('still allows the revert while the modelo of its own quarter is only pending', async () => {
    // Nothing has been submitted to the AEAT yet, so nothing can stop matching.
    expect(await attempt(INVOICE_STATUS.FINALIZED, INVOICE_STATUS.DRAFT, { filed: [PENDING_SAME_QUARTER] })).toBe(
      'allowed',
    );
  });

  it('still allows cancelling an invoice of a filed period, which is the lawful remedy', async () => {
    // Cancelling keeps the number on record and is how a filed invoice is corrected; only the
    // revert, which would erase the invoice from the declared quarter, is refused.
    expect(await attempt(INVOICE_STATUS.FINALIZED, INVOICE_STATUS.CANCELLED, { filed: [FILED_SAME_QUARTER] })).toBe(
      'allowed',
    );
  });
});
