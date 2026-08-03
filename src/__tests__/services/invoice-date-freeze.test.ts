/**
 * Integration Tests: the "InvoiceDate" of a NUMBERED draft is frozen
 *
 * A finalized invoice can be pulled back to draft to be corrected, and it keeps its
 * "InvoiceNumber" while it is back there. That number is already fixed in the series, so its
 * date can no longer move: re-dating DW-05 after DW-06 would leave the numbers correlative but
 * the dates out of order, which RD 1619/2012 requires just as much, and the income would
 * silently jump to another quarter of "vw_FiscalAccrual".
 *
 * Everything else about the draft — line items, notes, tax rates — stays editable, which is the
 * entire point of the revert. And a plain draft that never took a number is still free to be
 * re-dated: nothing is committed to yet.
 *
 * The comparison is the delicate part. The stored date and the incoming one do not share a
 * representation: the row arrives from the driver as a `Date` (or, when DATE columns are left
 * unparsed, as a raw 'YYYY-MM-DD' string) while the request body is coerced into a `Date` by
 * `UpdateInvoiceSchema`. A comparison that mistook those for different days would freeze
 * numbered drafts completely — they could never be saved again — so the same-day cases below
 * matter more than the rejection itself.
 */

import { API_ERROR, INVOICE_STATUS, IRPF_RETENTION_RATE, VAT_RATE } from '@/constants/finance';
import { type UpdateInvoiceInput, UpdateInvoiceSchema } from '@/schemas/invoice';
import type { Invoice } from '@/types/finance';
import { ValidationError } from '@/utils/apiErrors';

/** The number the invoice kept when it was reverted from finalized. */
const ASSIGNED_NUMBER = 'DW-05';

/** The day the invoice is dated, as an ISO date — the shape the request body carries. */
const STORED_DAY = '2026-07-09';
/** A different day, well inside the same quarter so only the date itself is at stake. */
const OTHER_DAY = '2026-07-23';

/**
 * The stored date, in the representations the row really arrives in: node-postgres turns a
 * DATE column into a `Date` at midnight local time, while a driver left to hand DATE back
 * untouched yields the plain 'YYYY-MM-DD' string. Both denote the same day.
 */
const STORED_AS_DATE = new Date(`${STORED_DAY}T00:00:00`);
const STORED_AS_STRING = STORED_DAY;

let storedDate: Date | string = STORED_AS_DATE;
let storedNumber: string | null = null;

function invoiceRow() {
  return {
    InvoiceID: 1,
    PrefixID: 1,
    InvoiceNumber: storedNumber,
    InvoiceDate: storedDate,
    CompanyID: 2,
    TransactionID: null,
    BaseCents: 100000,
    VatPercent: VAT_RATE.STANDARD,
    VatCents: 21000,
    RetentionPercent: IRPF_RETENTION_RATE.NONE,
    RetentionCents: 0,
    TotalCents: 121000,
    Currency: 'EUR',
    Status: INVOICE_STATUS.DRAFT,
    BillerName: 'Luis',
    BillerNif: '00000000X',
    BillerPaymentMethod: 'bank_transfer',
    ClientName: 'Acme',
    Notes: null,
    InvoiceLanguage: 'es',
    CreatedAt: new Date('2026-07-09T00:00:00'),
    UpdatedAt: new Date('2026-07-09T00:00:00'),
  };
}

const client = {
  query: jest.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes('FROM "Invoices"') && sql.includes('FOR UPDATE')) return { rows: [invoiceRow()] };
    return { rows: [] };
  }),
  release: jest.fn(),
};

jest.mock('@/services/database/connection', () => ({
  getPool: () => ({ connect: async () => client }),
  query: jest.fn(async () => []),
}));

jest.mock('@/libs/auth', () => ({ getUserIdOrThrow: jest.fn(async () => 7) }));
jest.mock('@vercel/blob', () => ({ del: jest.fn() }));

import { updateInvoice } from '@/services/database/InvoiceRepository';

/** The i18n key an error carries: `errorKey` for typed API errors, the message otherwise. */
function errorKeyOf(thrown: unknown): string | null {
  if (!(thrown instanceof Error)) return null;
  const { errorKey } = thrown as Error & { errorKey?: string };
  return errorKey ?? thrown.message;
}

/**
 * Build the edit exactly as the API route does — through the schema — so `invoiceDate` is the
 * `Date` that `z.coerce.date()` produces from an ISO day, not a hand-rolled instant that might
 * happen to match the stored one for the wrong reason.
 */
function editDatedOn(day: string): UpdateInvoiceInput {
  return UpdateInvoiceSchema.parse({
    invoiceDate: day,
    lineItems: [{ title: 'Consultoría', amountCents: 100000 }],
    notes: null,
    vatPercent: VAT_RATE.STANDARD,
    retentionPercent: IRPF_RETENTION_RATE.NONE,
  });
}

/** Run the edit against a draft in the given shape and report what came back. */
async function attemptEdit(options: {
  number: string | null;
  stored: Date | string;
  day: string;
}): Promise<{ invoice?: Invoice; thrown?: unknown }> {
  storedNumber = options.number;
  storedDate = options.stored;
  try {
    return { invoice: await updateInvoice(1, editDatedOn(options.day)) };
  } catch (thrown) {
    return { thrown };
  }
}

/** The statements that wrote to the invoice row, if any. */
function invoiceUpdates(): string[] {
  return client.query.mock.calls.map(([sql]) => sql).filter((sql) => sql.includes('UPDATE "Invoices"'));
}

describe('the invoice date of a numbered draft is frozen', () => {
  beforeEach(() => {
    client.query.mockClear();
    storedNumber = null;
    storedDate = STORED_AS_DATE;
  });

  it('refuses to re-date a draft that already carries a number', async () => {
    const { invoice, thrown } = await attemptEdit({
      number: ASSIGNED_NUMBER,
      stored: STORED_AS_DATE,
      day: OTHER_DAY,
    });

    expect(invoice).toBeUndefined();
    // A caller fault, not a 500: withApiHandler needs the typed error to answer 400 with the
    // i18n key, which the invoice detail page renders next to the date field.
    expect(thrown).toBeInstanceOf(ValidationError);
    expect(errorKeyOf(thrown)).toBe(API_ERROR.INVOICE.DATE_FROZEN_ON_NUMBERED);
  });

  it('writes nothing when it refuses to re-date', async () => {
    await attemptEdit({ number: ASSIGNED_NUMBER, stored: STORED_AS_DATE, day: OTHER_DAY });

    expect(invoiceUpdates()).toHaveLength(0);
  });

  const storedShapes: Array<[string, Date | string]> = [
    ['a Date, as the driver parses a DATE column', STORED_AS_DATE],
    ['a raw string, as an unparsed DATE column arrives', STORED_AS_STRING],
  ];

  it.each(storedShapes)('saves a numbered draft whose date did not move, stored as %s', async (_shape, stored) => {
    // The edit resubmits the same day in the request's own representation. Reading that as a
    // change would make every numbered draft unsavable — line items and all.
    const { invoice, thrown } = await attemptEdit({ number: ASSIGNED_NUMBER, stored, day: STORED_DAY });

    expect(thrown).toBeUndefined();
    expect(invoice?.invoiceDate).toBe(STORED_DAY);
    expect(invoiceUpdates()).not.toHaveLength(0);
  });

  it('re-dates a draft that never consumed a number', async () => {
    // Nothing is committed to the series yet, so the date is still the user's to choose.
    const { invoice, thrown } = await attemptEdit({ number: null, stored: STORED_AS_DATE, day: OTHER_DAY });

    expect(thrown).toBeUndefined();
    expect(invoice?.invoiceDate).toBe(OTHER_DAY);
    expect(invoiceUpdates()).not.toHaveLength(0);
  });
});
