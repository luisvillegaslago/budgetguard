/**
 * Integration Tests: the invoice status machine is one-way once issued
 *
 * Finalizing consumes a number from its series, and Spanish law requires that numbering to
 * stay correlative without gaps (RD 1619/2012). Going back to draft and then deleting the
 * invoice — deleteInvoice only accepts drafts — would erase that number for good.
 *
 * So an issued invoice can only be paid or cancelled, and a cancelled one is final: it
 * keeps its number on record. Verifactu will demand the same from July 2027.
 */

import { API_ERROR, INVOICE_STATUS } from '@/constants/finance';
import type { InvoiceStatus } from '@/types/finance';

let currentStatus: string = INVOICE_STATUS.DRAFT;

function invoiceRow() {
  return {
    InvoiceID: 1,
    PrefixID: 1,
    InvoiceNumber: currentStatus === INVOICE_STATUS.DRAFT ? null : 'DW-09',
    InvoiceDate: new Date('2026-07-09'),
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

const client = {
  query: jest.fn(async (sql: string) => {
    if (sql.includes('FROM "Invoices"') && sql.includes('FOR UPDATE')) return { rows: [invoiceRow()] };
    if (sql.includes('FROM "InvoiceLineItems"')) return { rows: [] };
    if (sql.includes('DELETE FROM "FiscalDocuments"')) return { rows: [] };
    return { rows: [] };
  }),
  release: jest.fn(),
};

jest.mock('@/services/database/connection', () => ({
  getPool: () => ({ connect: async () => client }),
  query: jest.fn(async () => []),
}));

jest.mock('@/libs/auth', () => ({ getUserIdOrThrow: jest.fn(async () => 2) }));
jest.mock('@vercel/blob', () => ({ del: jest.fn() }));

import { updateInvoiceStatus } from '@/services/database/InvoiceRepository';

async function attempt(from: InvoiceStatus, to: InvoiceStatus): Promise<'allowed' | 'rejected'> {
  currentStatus = from;
  try {
    await updateInvoiceStatus(1, to, { categoryId: 5 });
    return 'allowed';
  } catch (error) {
    if (error instanceof Error && error.message === API_ERROR.INVOICE.INVALID_STATUS_TRANSITION) return 'rejected';
    throw error;
  }
}

describe('invoice status transitions', () => {
  beforeEach(() => {
    client.query.mockClear();
  });

  it.each([
    [INVOICE_STATUS.DRAFT, INVOICE_STATUS.FINALIZED],
    [INVOICE_STATUS.FINALIZED, INVOICE_STATUS.PAID],
    [INVOICE_STATUS.FINALIZED, INVOICE_STATUS.CANCELLED],
    [INVOICE_STATUS.PAID, INVOICE_STATUS.CANCELLED],
  ])('allows %s → %s', async (from, to) => {
    expect(await attempt(from, to)).toBe('allowed');
  });

  it('refuses to un-issue a finalized invoice', async () => {
    // Would strand DW-09: the invoice could then be deleted and the number lost.
    expect(await attempt(INVOICE_STATUS.FINALIZED, INVOICE_STATUS.DRAFT)).toBe('rejected');
  });

  it('refuses to resurrect a cancelled invoice', async () => {
    expect(await attempt(INVOICE_STATUS.CANCELLED, INVOICE_STATUS.DRAFT)).toBe('rejected');
    expect(await attempt(INVOICE_STATUS.CANCELLED, INVOICE_STATUS.PAID)).toBe('rejected');
    expect(await attempt(INVOICE_STATUS.CANCELLED, INVOICE_STATUS.FINALIZED)).toBe('rejected');
  });

  it('refuses to pay a draft, which has no number yet', async () => {
    expect(await attempt(INVOICE_STATUS.DRAFT, INVOICE_STATUS.PAID)).toBe('rejected');
    expect(await attempt(INVOICE_STATUS.DRAFT, INVOICE_STATUS.CANCELLED)).toBe('rejected');
  });

  it('never clears the invoice number when cancelling', async () => {
    await attempt(INVOICE_STATUS.FINALIZED, INVOICE_STATUS.CANCELLED);

    const wrote = client.query.mock.calls.map(([sql]) => sql).join('\n');
    expect(wrote).not.toContain('"InvoiceNumber" = NULL');
    // The number stays; only the fiscal document and its PDF are cleaned up.
    expect(wrote).toContain('DELETE FROM "FiscalDocuments"');
  });
});
