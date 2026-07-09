/**
 * Integration Tests: Fiscal models are computed on an accrual basis
 *
 * An invoice must be imputed to the quarter of its InvoiceDate, never to the quarter
 * in which it was collected. Reproduces the real T1-2026 case: invoice CREST-01 issued
 * on 15-mar (Q1) but marked paid on 26-apr (Q2), which used to drop 600,00 € from the
 * Modelo 130 of Q1 and add them to Q2.
 *
 * The `query` fake below mirrors just enough Postgres semantics to make the two rules
 * observable: (1) the view drops invoice-linked payment transactions, (2) issued
 * invoices are re-added under their invoice date.
 */

import { INVOICE_STATUS, PROFESSIONAL_INCOME_CATEGORY, TRANSACTION_TYPE } from '@/constants/finance';

// ── Fixtures: the real T1/T2 2026 data, trimmed ──

interface TxRow {
  TransactionID: number;
  FiscalQuarter: number;
  Type: string;
  FullAmountCents: number;
  ParentCategoryName: string;
  VatPercent: number;
  DeductionPercent: number;
}

interface InvoiceRow {
  InvoiceID: number;
  FiscalQuarter: number;
  TotalCents: number;
  Status: string;
  TransactionID: number | null;
}

// Income transactions created when each invoice was collected (payment date).
const PAYMENT_TX: TxRow[] = [
  // DW-06: issued 25-jan, collected 25-jan -> same quarter
  txIncome(3453, 1, 832800),
  // DW-07: issued 15-mar, collected 20-mar -> same quarter
  txIncome(3713, 1, 276000),
  // CREST-01: issued 15-mar (Q1) but collected 26-apr (Q2) -> the bug
  txIncome(3815, 2, 60000),
];

// Standalone professional income with no invoice behind it (imported history).
const STANDALONE_TX: TxRow = txIncome(4017, 1, 100000);

// Deductible expenses: 1.389,54 € documented, matching the filed Modelo 130.
const EXPENSE_TX: TxRow = {
  TransactionID: 900,
  FiscalQuarter: 1,
  Type: TRANSACTION_TYPE.EXPENSE,
  FullAmountCents: 138954,
  ParentCategoryName: 'Gastos deducibles',
  VatPercent: 0,
  DeductionPercent: 100,
};

// An issued-but-uncollected invoice: it must be declared even though no money arrived.
const FINALIZED_INVOICE: InvoiceRow = {
  InvoiceID: 11,
  FiscalQuarter: 1,
  TotalCents: 20000,
  Status: INVOICE_STATUS.FINALIZED,
  TransactionID: null,
};

const INVOICES: InvoiceRow[] = [
  { InvoiceID: 6, FiscalQuarter: 1, TotalCents: 832800, Status: INVOICE_STATUS.PAID, TransactionID: 3453 },
  { InvoiceID: 7, FiscalQuarter: 1, TotalCents: 276000, Status: INVOICE_STATUS.PAID, TransactionID: 3713 },
  { InvoiceID: 9, FiscalQuarter: 1, TotalCents: 60000, Status: INVOICE_STATUS.PAID, TransactionID: 3815 },
  { InvoiceID: 10, FiscalQuarter: 1, TotalCents: 84000, Status: INVOICE_STATUS.DRAFT, TransactionID: null },
];

function txIncome(transactionId: number, fiscalQuarter: number, fullAmountCents: number): TxRow {
  return {
    TransactionID: transactionId,
    FiscalQuarter: fiscalQuarter,
    Type: TRANSACTION_TYPE.INCOME,
    FullAmountCents: fullAmountCents,
    ParentCategoryName: PROFESSIONAL_INCOME_CATEGORY,
    VatPercent: 0,
    DeductionPercent: 0,
  };
}

// A cancelled invoice that still points at a live income transaction. Unreachable through
// the status machine (paid -> cancelled deletes the transaction), but a bulk import or a
// manual DB edit can produce it, and the money is really in Transactions.
const CANCELLED_INVOICE: InvoiceRow = {
  InvoiceID: 12,
  FiscalQuarter: 1,
  TotalCents: 50000,
  Status: INVOICE_STATUS.CANCELLED,
  TransactionID: 3900,
};
const CANCELLED_INVOICE_TX = txIncome(3900, 1, 50000);

// Toggled by the test that reproduces the exact figures filed with the AEAT.
let includeStandaloneIncome = true;
// Toggled by the test covering an issued-but-uncollected invoice.
let includeFinalizedInvoice = false;
// Toggled by the test covering a non-issued invoice that kept its transaction.
let includeCancelledInvoice = false;

function transactionRows(): TxRow[] {
  return [
    ...PAYMENT_TX,
    ...(includeStandaloneIncome ? [STANDALONE_TX] : []),
    ...(includeCancelledInvoice ? [CANCELLED_INVOICE_TX] : []),
    EXPENSE_TX,
  ];
}

function invoiceRows(): InvoiceRow[] {
  return [
    ...INVOICES,
    ...(includeFinalizedInvoice ? [FINALIZED_INVOICE] : []),
    ...(includeCancelledInvoice ? [CANCELLED_INVOICE] : []),
  ];
}

// ── Fake Postgres ──

/**
 * Transaction ids the anti-join drops. With no status filter in the subquery it matches any
 * invoice; with one, only invoices whose status the SQL lists — the same rows Postgres sees.
 */
function linkedTransactionIds(sql: string): Set<number> {
  const filtersByStatus = sql.includes('inv."Status" IN');

  return new Set(
    invoiceRows()
      .filter((inv) => !filtersByStatus || sql.includes(`'${inv.Status}'`))
      .map((inv) => inv.TransactionID)
      .filter((id): id is number => id !== null),
  );
}

const mockQuery = jest.fn(async (sql: string, params: unknown[]) => {
  // Checked first: the view query embeds a `FROM "Invoices" inv` subquery of its own.
  if (sql.includes('vw_FiscalQuarterly')) {
    const quarter = params[1] as number;
    const cumulative = sql.includes('"FiscalQuarter" <= ');
    // The NOT EXISTS anti-join drops payment transactions, but only those held by an
    // invoice whose status the subquery accepts — mirrored here by reading the SQL.
    const excluded = sql.includes('NOT EXISTS') ? linkedTransactionIds(sql) : new Set<number>();

    return transactionRows()
      .filter((tx) => (cumulative ? tx.FiscalQuarter <= quarter : tx.FiscalQuarter === quarter))
      .filter((tx) => !excluded.has(tx.TransactionID));
  }

  if (sql.includes('FROM "Invoices" i')) {
    const [, year, quarter] = params as [number, number, number | undefined];

    // Statuses are inlined as literals in the query, so read them back from the SQL:
    // dropping one from ISSUED_INVOICE_STATUSES makes those invoices disappear here too.
    return invoiceRows()
      .filter((inv) => sql.includes(`'${inv.Status}'`))
      .filter((inv) => quarter == null || inv.FiscalQuarter === quarter)
      .map((inv) => ({
        InvoiceDate: new Date(Date.UTC(year, (inv.FiscalQuarter - 1) * 3, 15)),
        TotalCents: inv.TotalCents,
        FiscalQuarter: inv.FiscalQuarter,
      }));
  }

  return [];
});

jest.mock('@/services/database/connection', () => ({
  query: (...args: [string, unknown[]]) => mockQuery(...args),
}));

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 2),
}));

import { getModelo130Summary, getModelo303Summary } from '@/services/database/FiscalRepository';

// ── Tests ──

describe('Fiscal models use the invoice date, not the collection date', () => {
  beforeEach(() => {
    mockQuery.mockClear();
    includeStandaloneIncome = true;
    includeFinalizedInvoice = false;
    includeCancelledInvoice = false;
  });

  it('books an invoice collected in Q2 into the Q1 Modelo 130 that issued it', async () => {
    const summary = await getModelo130Summary(2026, 1);

    // 8.328 + 2.760 + 600 (CREST-01, collected in Q2) + 1.000 standalone = 12.688,00 €
    expect(summary.casilla1Cents).toBe(1268800);
  });

  it('matches the Modelo 130 filed with the AEAT for T1 2026', async () => {
    // Same fixtures minus the standalone income, so the figures equal the real filing:
    // ingresos 11.688,00 / gastos 1.904,46 / beneficio 9.783,54 / cuota 1.956,71
    includeStandaloneIncome = false;

    const summary = await getModelo130Summary(2026, 1);

    expect(summary.casilla1Cents).toBe(1168800);
    expect(summary.gastosDocumentadosCents).toBe(138954);
    expect(summary.gastosDificilCents).toBe(51492);
    expect(summary.casilla2Cents).toBe(190446);
    expect(summary.casilla3Cents).toBe(978354);
    expect(summary.casilla4Cents).toBe(195671);
    expect(summary.casilla7Cents).toBe(195671);
  });

  it('does not count an invoice twice when its payment transaction is in the same quarter', async () => {
    const summary = await getModelo130Summary(2026, 1);

    // DW-06 (8.328) is both an invoice and a Q1 payment transaction. If the view kept
    // the linked transaction, casilla1 would carry it twice.
    expect(summary.casilla1Cents).toBe(1268800);
  });

  it('declares a finalized invoice that has not been collected yet', async () => {
    includeFinalizedInvoice = true;

    const summary = await getModelo130Summary(2026, 1);

    // No payment transaction exists for it, so it can only reach casilla1 as an issued invoice.
    expect(summary.casilla1Cents).toBe(1268800 + FINALIZED_INVOICE.TotalCents);
  });

  it('keeps the income of a non-issued invoice that still points at a live transaction', async () => {
    includeCancelledInvoice = true;

    const summary = await getModelo130Summary(2026, 1);

    // The anti-join must not drop a transaction that no issued invoice will re-add,
    // or the money would vanish from every model.
    expect(summary.casilla1Cents).toBe(1268800 + CANCELLED_INVOICE.TotalCents);
  });

  it('keeps professional income that has no invoice behind it', async () => {
    const summary = await getModelo130Summary(2026, 1);
    const withoutStandalone = 1168800;

    expect(summary.casilla1Cents - withoutStandalone).toBe(STANDALONE_TX.FullAmountCents);
  });

  it('excludes the Q1 invoice from the Q2 Modelo 130 income of that quarter', async () => {
    const q1 = await getModelo130Summary(2026, 1);
    const q2 = await getModelo130Summary(2026, 2);

    // Modelo 130 is cumulative and no invoice was issued in Q2, so Q2 adds nothing.
    expect(q2.casilla1Cents).toBe(q1.casilla1Cents);
  });

  it('reports the issued invoices as non-subject operations in the Q1 Modelo 303', async () => {
    const summary = await getModelo303Summary(2026, 1);

    expect(summary.casilla120Cents).toBe(1268800);
  });

  it('ignores draft invoices', async () => {
    const summary = await getModelo130Summary(2026, 1);

    expect(summary.casilla1Cents).not.toBe(1268800 + 84000);
  });
});
