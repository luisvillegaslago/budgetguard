/**
 * Integration Tests: an invoice's tax breakdown reaches the right columns
 *
 * createInvoice binds 28 positional parameters. computeInvoiceAmounts is well unit-tested,
 * but nothing checked its wiring into SQL: swapping RetentionCents with VatCents in that
 * list would persist the withholding as output VAT and mis-declare both Modelo 303 and
 * Modelo 130, with every other test still green.
 *
 * These tests capture the real INSERT and assert each new column receives its own value.
 */

import { IRPF_RETENTION_RATE, VAT_RATE } from '@/constants/finance';

interface CapturedQuery {
  sql: string;
  params: unknown[];
}

const executed: CapturedQuery[] = [];

const INVOICE_ROW = {
  InvoiceID: 1,
  PrefixID: 1,
  InvoiceNumber: null,
  InvoiceDate: new Date('2026-07-09'),
  CompanyID: 2,
  TransactionID: null,
  BaseCents: 0,
  VatPercent: 0,
  VatCents: 0,
  RetentionPercent: 0,
  RetentionCents: 0,
  TotalCents: 0,
  Currency: 'EUR',
  Status: 'draft',
  BillerName: 'Luis',
  BillerNif: '00000000X',
  BillerPaymentMethod: 'bank_transfer',
  ClientName: 'Acme S.L.',
  Notes: null,
  InvoiceLanguage: 'es',
  CreatedAt: new Date('2026-07-09'),
  UpdatedAt: new Date('2026-07-09'),
};

function fakeClient() {
  return {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      executed.push({ sql, params: params ?? [] });

      if (sql.includes('FROM "InvoicePrefixes"')) return { rows: [{ PrefixID: 1, Prefix: 'DW' }] };
      if (sql.includes('FROM "UserBillingProfiles"')) {
        return { rows: [{ FullName: 'Luis', Nif: '00000000X', PaymentMethod: 'bank_transfer' }] };
      }
      if (sql.includes('FROM "Companies"')) return { rows: [{ Name: 'Acme S.L.', Country: 'España' }] };
      if (sql.includes('INSERT INTO "Invoices"')) return { rows: [INVOICE_ROW] };
      if (sql.includes('INSERT INTO "InvoiceLineItems"')) {
        return { rows: [{ LineItemID: 1, InvoiceID: 1, SortOrder: 0, AmountCents: 1000000, SubItems: [] }] };
      }
      return { rows: [] };
    }),
    release: jest.fn(),
  };
}

let client = fakeClient();

jest.mock('@/services/database/connection', () => ({
  getPool: () => ({ connect: async () => client }),
  query: jest.fn(async () => []),
}));

jest.mock('@/libs/auth', () => ({ getUserIdOrThrow: jest.fn(async () => 2) }));

// InvoiceRepository imports it for blob cleanup on cancel; it pulls in undici, which needs
// a fetch-capable environment jsdom does not provide.
jest.mock('@vercel/blob', () => ({ del: jest.fn() }));

import { createInvoice } from '@/services/database/InvoiceRepository';

/** The INSERT's parameter list, in the order the column list declares. */
function invoiceInsertParams(): unknown[] {
  const insert = executed.find((q) => q.sql.includes('INSERT INTO "Invoices"'));
  if (!insert) throw new Error('No INSERT INTO "Invoices" was executed');
  return insert.params;
}

/** Reads a bound parameter by the column name it sits under in the INSERT column list. */
function boundValue(column: string): unknown {
  const insert = executed.find((q) => q.sql.includes('INSERT INTO "Invoices"'));
  if (!insert) throw new Error('No INSERT INTO "Invoices" was executed');

  const columnList = insert.sql.slice(insert.sql.indexOf('(') + 1, insert.sql.indexOf(') VALUES'));
  const columns = columnList.split(',').map((name) => name.trim().replace(/"/g, ''));
  const index = columns.indexOf(column);
  if (index === -1) throw new Error(`Column ${column} is not in the INSERT`);

  return insert.params[index];
}

const baseInput = {
  prefixId: 1,
  invoiceDate: new Date('2026-07-09'),
  companyId: 2,
  notes: null,
  lineItems: [
    { amountCents: 1000000, title: null, subItems: [], description: null, hours: null, hourlyRateCents: null },
  ],
};

describe('createInvoice persists the tax breakdown', () => {
  beforeEach(() => {
    executed.length = 0;
    client = fakeClient();
  });

  it('writes each amount to its own column for a Spanish client', async () => {
    // 10.000,00 € base, 21% VAT, 15% withheld → client pays 10.600,00 €
    await createInvoice({
      ...baseInput,
      vatPercent: VAT_RATE.STANDARD,
      retentionPercent: IRPF_RETENTION_RATE.GENERAL,
    });

    expect(boundValue('BaseCents')).toBe(1000000);
    expect(boundValue('VatPercent')).toBe(21);
    expect(boundValue('VatCents')).toBe(210000);
    expect(boundValue('RetentionPercent')).toBe(15);
    expect(boundValue('RetentionCents')).toBe(150000);
    expect(boundValue('TotalCents')).toBe(1060000);
  });

  it('keeps the persisted breakdown internally consistent', async () => {
    await createInvoice({
      ...baseInput,
      vatPercent: VAT_RATE.REDUCED,
      retentionPercent: IRPF_RETENTION_RATE.REDUCED,
    });

    const base = boundValue('BaseCents') as number;
    const vat = boundValue('VatCents') as number;
    const retention = boundValue('RetentionCents') as number;

    // The same invariant the CK_Invoices_TotalIsBreakdown constraint enforces
    expect(boundValue('TotalCents')).toBe(base + vat - retention);
  });

  it('defaults to no VAT and no withholding for a foreign client', async () => {
    await createInvoice(baseInput);

    expect(boundValue('VatPercent')).toBe(0);
    expect(boundValue('VatCents')).toBe(0);
    expect(boundValue('RetentionCents')).toBe(0);
    expect(boundValue('TotalCents')).toBe(1000000);
    expect(boundValue('BaseCents')).toBe(1000000);
  });

  it('binds one parameter per placeholder', async () => {
    await createInvoice({ ...baseInput, vatPercent: VAT_RATE.STANDARD, retentionPercent: 0 });

    const insert = executed.find((q) => q.sql.includes('INSERT INTO "Invoices"'));
    const placeholders = new Set(insert?.sql.match(/\$\d+/g) ?? []);

    expect(placeholders.size).toBe(invoiceInsertParams().length);
  });
});
