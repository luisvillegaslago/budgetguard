/**
 * Integration Tests: deleteInvoice() never destroys an assigned invoice number
 *
 * Since a finalized invoice can be reverted to draft for correction, "draft" alone is no
 * longer proof that no number was consumed: a reverted draft keeps its "InvoiceNumber" so
 * that re-issuing reuses it. Deleting such an invoice would leave a permanent hole in the
 * series, which RD 1619/2012 forbids — so the guard is the number, not the status.
 *
 * A pristine draft (InvoiceNumber IS NULL) never touched the series and is still deletable.
 *
 * The SELECT that reads the status is only an early exit: between it and the DELETE the
 * invoice may be finalized by a concurrent request, so the DELETE carries the whole guard in
 * its own predicate ("Status" = draft AND "InvoiceNumber" IS NULL) and the outcome is decided
 * by whether it actually matched a row — never by what the SELECT saw.
 */

import { API_ERROR, INVOICE_STATUS } from '@/constants/finance';
import { ValidationError } from '@/utils/apiErrors';

type InvoiceCheckRow = { Status: string; InvoiceNumber: string | null };
type DeletedRow = { InvoiceID: number };

/** The row as the guard's SELECT sees it. */
let selectedInvoice: InvoiceCheckRow | null = null;
/** The row as it really stands when the DELETE runs — a concurrent writer may have moved it. */
let invoiceAtDeleteTime: InvoiceCheckRow | null = null;

const query = jest.fn(async (sql: string, _params?: unknown[]): Promise<InvoiceCheckRow[] | DeletedRow[]> => {
  // The DELETE must be distinguished from the status/number check on the same table.
  if (sql.includes('DELETE FROM "Invoices"')) {
    if (!invoiceAtDeleteTime) return [];
    // Apply exactly the predicates the statement carries: an unguarded DELETE would still hit
    // the row by id in PostgreSQL, however the invoice moved on in the meantime.
    const numberGuarded = sql.includes('"InvoiceNumber" IS NULL');
    const statusGuarded = sql.includes('"Status" =');
    const matches =
      (!numberGuarded || invoiceAtDeleteTime.InvoiceNumber === null) &&
      (!statusGuarded || invoiceAtDeleteTime.Status === INVOICE_STATUS.DRAFT);
    return matches ? [{ InvoiceID: 1 }] : [];
  }
  if (sql.includes('FROM "Invoices"') && selectedInvoice) return [selectedInvoice];
  return [];
});

jest.mock('@/services/database/connection', () => ({
  getPool: () => ({ connect: async () => ({ query: jest.fn(), release: jest.fn() }) }),
  query: (sql: string, params?: unknown[]) => query(sql, params),
}));

jest.mock('@/libs/auth', () => ({ getUserIdOrThrow: jest.fn(async () => 2) }));
jest.mock('@vercel/blob', () => ({ del: jest.fn() }));

import { deleteInvoice } from '@/services/database/InvoiceRepository';

/** Put the same row behind both the SELECT and the DELETE (no concurrent change). */
function givenInvoice(row: InvoiceCheckRow): void {
  selectedInvoice = row;
  invoiceAtDeleteTime = row;
}

/** Runs the delete and reports what came back: the returned flag, or the thrown error. */
async function attemptDelete(): Promise<{ returned?: boolean; thrown?: unknown }> {
  try {
    return { returned: await deleteInvoice(1) };
  } catch (thrown) {
    return { thrown };
  }
}

/** The i18n key an error carries: `errorKey` for typed API errors, the message otherwise. */
function errorKeyOf(thrown: unknown): string | null {
  if (!(thrown instanceof Error)) return null;
  const { errorKey } = thrown as Error & { errorKey?: string };
  return errorKey ?? thrown.message;
}

/** The DELETE statement the repository issued, if any. */
function executedDelete(): string | null {
  const call = query.mock.calls.find(([sql]) => sql.includes('DELETE FROM "Invoices"'));
  return call ? call[0] : null;
}

describe('deleteInvoice number guard', () => {
  beforeEach(() => {
    query.mockClear();
    selectedInvoice = null;
    invoiceAtDeleteTime = null;
  });

  it('refuses to delete a draft that already carries a number', async () => {
    // A finalized invoice reverted to draft: DW-09 is already spent in the series.
    givenInvoice({ Status: INVOICE_STATUS.DRAFT, InvoiceNumber: 'DW-09' });

    const { returned, thrown } = await attemptDelete();

    expect(returned).toBeUndefined();
    // A caller fault, not a 500: the guard raises a typed error carrying the i18n key.
    expect(thrown).toBeInstanceOf(ValidationError);
    expect(errorKeyOf(thrown)).toBe(API_ERROR.INVOICE.NUMBERED_NOT_DELETABLE);
    expect(executedDelete()).toBeNull();
  });

  it('deletes a draft that never consumed a number', async () => {
    givenInvoice({ Status: INVOICE_STATUS.DRAFT, InvoiceNumber: null });

    const { returned } = await attemptDelete();

    expect(returned).toBe(true);
    expect(executedDelete()).not.toBeNull();
  });

  it('refuses to delete an issued invoice', async () => {
    givenInvoice({ Status: INVOICE_STATUS.FINALIZED, InvoiceNumber: 'DW-09' });

    const { returned, thrown } = await attemptDelete();

    expect(returned).toBeUndefined();
    // This path predates the number guard, so only the i18n key is asserted, not the class.
    expect(errorKeyOf(thrown)).toBe(API_ERROR.INVOICE.ONLY_DRAFT_DELETABLE);
    expect(executedDelete()).toBeNull();
  });

  it('reports no success when the invoice is finalized between the check and the delete', async () => {
    // The SELECT sees a pristine draft, but by the time the DELETE runs a concurrent
    // finalization has assigned DW-09, so the statement matches no row.
    selectedInvoice = { Status: INVOICE_STATUS.DRAFT, InvoiceNumber: null };
    invoiceAtDeleteTime = { Status: INVOICE_STATUS.FINALIZED, InvoiceNumber: 'DW-09' };

    const { returned } = await attemptDelete();

    // Whether it returns false or throws, it must never claim the invoice was deleted.
    expect(returned).not.toBe(true);
    // The verdict comes from the DELETE's own predicate, not from the stale SELECT.
    expect(executedDelete()).toContain('"InvoiceNumber" IS NULL');
  });
});
