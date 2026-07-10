/**
 * Integration Tests: Fiscal models over the accrual view
 *
 * Spanish IRPF/IVA are settled on the fecha de devengo, so an invoice belongs to the
 * quarter it was issued in, not the one it was collected in. That rule now lives in
 * "vw_FiscalAccrual" (database/schema.sql), which drops the payment transactions and
 * books each issued invoice under its own date.
 *
 * These tests cover what remains in TypeScript: the cumulative Modelo 130 loop, the 5%
 * "gastos de difícil justificación" and its annual cap, the 303/100 classification, and
 * the guarantee that no model reads the cash-basis view. The fixtures are the rows the
 * accrual view returns; the view's own SQL is verified against the database.
 */

import { MODELO_100_DEFAULT_CASILLA, PROFESSIONAL_INCOME_CATEGORY, TRANSACTION_TYPE } from '@/constants/finance';

// ── Fixtures: what "vw_FiscalAccrual" returns for 2026 ──

interface AccrualRow {
  FiscalYear: number;
  FiscalQuarter: number;
  Type: string;
  TransactionID: number;
  CategoryID: number;
  CategoryName: string;
  ParentCategoryName: string;
  FullAmountCents: number;
  VatPercent: number;
  DeductionPercent: number;
  RetentionCents: number;
  Modelo100CasillaCode?: string | null;
}

function income(fiscalQuarter: number, fullAmountCents: number, vatPercent = 0, retentionCents = 0): AccrualRow {
  return {
    FiscalYear: 2026,
    FiscalQuarter: fiscalQuarter,
    Type: TRANSACTION_TYPE.INCOME,
    TransactionID: 0,
    CategoryID: 0,
    CategoryName: PROFESSIONAL_INCOME_CATEGORY,
    ParentCategoryName: PROFESSIONAL_INCOME_CATEGORY,
    FullAmountCents: fullAmountCents,
    VatPercent: vatPercent,
    DeductionPercent: 0,
    RetentionCents: retentionCents,
  };
}

function expense(fiscalQuarter: number, fullAmountCents: number, vatPercent = 0): AccrualRow {
  return {
    FiscalYear: 2026,
    FiscalQuarter: fiscalQuarter,
    Type: TRANSACTION_TYPE.EXPENSE,
    TransactionID: 500 + fiscalQuarter,
    CategoryID: 30,
    CategoryName: 'Software',
    ParentCategoryName: 'Gastos deducibles',
    FullAmountCents: fullAmountCents,
    VatPercent: vatPercent,
    DeductionPercent: 100,
    RetentionCents: 0,
    Modelo100CasillaCode: null,
  };
}

// The real T1/T2 2026 figures. CREST-01 (600,00 €) was issued 15-mar and collected
// 26-apr: the view already books it in Q1, so it appears here as a Q1 row.
const ISSUED_INVOICES: AccrualRow[] = [
  income(1, 832800), // DW-06
  income(1, 276000), // DW-07
  income(1, 60000), // CREST-01
  income(2, 2587500), // Q2 invoices
];

const EXPENSES: AccrualRow[] = [expense(1, 138954), expense(2, 179082)];

// Professional income with no invoice behind it (an imported historical summary).
const STANDALONE_INCOME = income(1, 100000);

let includeStandaloneIncome = false;
let extraRows: AccrualRow[] = [];

function accrualRows(): AccrualRow[] {
  return [...ISSUED_INVOICES, ...EXPENSES, ...(includeStandaloneIncome ? [STANDALONE_INCOME] : []), ...extraRows];
}

// ── Fake Postgres ──

const executedSql: string[] = [];

const mockQuery = jest.fn(async (sql: string, params: unknown[]) => {
  executedSql.push(sql);
  if (!sql.includes('vw_FiscalAccrual')) return [];

  // Every fiscal query binds [year, userId, quarter?] in that order.
  const [year, , quarter] = params as [number, number, number | undefined];
  const cumulative = sql.includes('"FiscalQuarter" <=');

  return accrualRows()
    .filter((row) => row.FiscalYear === year)
    .filter((row) => quarter == null || (cumulative ? row.FiscalQuarter <= quarter : row.FiscalQuarter === quarter))
    .map((row) => ({ ...row, Modelo100CasillaCode: row.Modelo100CasillaCode ?? null }));
});

jest.mock('@/services/database/connection', () => ({
  query: (...args: [string, unknown[]]) => mockQuery(...args),
}));

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 2),
}));

import {
  getModelo100Summary,
  getModelo130Summary,
  getModelo303Summary,
  getModelo390Summary,
} from '@/services/database/FiscalRepository';

// ── Tests ──

describe('Fiscal models read the accrual view', () => {
  beforeEach(() => {
    mockQuery.mockClear();
    executedSql.length = 0;
    includeStandaloneIncome = false;
    extraRows = [];
  });

  it.each([
    ['Modelo 303', () => getModelo303Summary(2026, 1)],
    ['Modelo 130', () => getModelo130Summary(2026, 1)],
    ['Modelo 390', () => getModelo390Summary(2026)],
    ['Modelo 100', () => getModelo100Summary(2026)],
  ])('%s reads vw_FiscalAccrual and never the cash-basis view', async (_name, run) => {
    await run();

    expect(executedSql).not.toHaveLength(0);
    executedSql.forEach((sql) => {
      expect(sql).toContain('vw_FiscalAccrual');
      expect(sql).not.toContain('vw_FiscalQuarterly');
    });
  });

  it('joins categories with a LEFT JOIN so invoice rows survive in Modelo 100', async () => {
    await getModelo100Summary(2026);

    // Invoice rows carry CategoryID 0 and match no category: an INNER JOIN would drop them.
    expect(executedSql[0]).toContain('LEFT JOIN "Categories"');
    expect(executedSql[0]).not.toContain('INNER JOIN "Categories"');
  });
});

describe('Modelo 130', () => {
  beforeEach(() => {
    mockQuery.mockClear();
    executedSql.length = 0;
    includeStandaloneIncome = false;
    extraRows = [];
  });

  it('matches the Modelo 130 filed with the AEAT for T1 2026', async () => {
    const summary = await getModelo130Summary(2026, 1);

    // 11.688,00 income − 1.389,54 documented − 514,92 (5%) = 9.783,54 → 1.956,71 at 20%
    expect(summary.casilla1Cents).toBe(1168800);
    expect(summary.gastosDocumentadosCents).toBe(138954);
    expect(summary.gastosDificilCents).toBe(51492);
    expect(summary.casilla2Cents).toBe(190446);
    expect(summary.casilla3Cents).toBe(978354);
    expect(summary.casilla4Cents).toBe(195671);
    expect(summary.casilla5Cents).toBe(0);
    expect(summary.casilla7Cents).toBe(195671);
  });

  it('accumulates T2 and deducts the T1 payment in casilla 05', async () => {
    const summary = await getModelo130Summary(2026, 2);

    expect(summary.casilla1Cents).toBe(3756300);
    expect(summary.gastosDocumentadosCents).toBe(318036);
    expect(summary.casilla4Cents).toBe(653270);
    // The quarter already settled in T1, not a recomputed guess.
    expect(summary.casilla5Cents).toBe(195671);
    expect(summary.casilla7Cents).toBe(457599);
  });

  it('counts standalone professional income that has no invoice behind it', async () => {
    includeStandaloneIncome = true;

    const summary = await getModelo130Summary(2026, 1);

    expect(summary.casilla1Cents).toBe(1168800 + STANDALONE_INCOME.FullAmountCents);
  });

  it('deducts the IRPF clients already withheld (casilla 06)', async () => {
    // A Spanish client invoiced 10.000,00 € base withholds 1.500,00 € and pays it to the AEAT.
    extraRows = [income(1, 1000000, 0, 150000)];

    const summary = await getModelo130Summary(2026, 1);

    // Income 21.688,00 − documented 1.389,54 − 5% (1.014,92) = 19.283,54 → 20% = 3.856,71
    expect(summary.casilla4Cents).toBe(385671);
    expect(summary.casilla5Cents).toBe(0);
    expect(summary.casilla6Cents).toBe(150000);
    // 3.856,71 − 1.500,00 already in the Treasury = 2.356,71 left to pay
    expect(summary.casilla7Cents).toBe(235671);
  });

  it('never asks for a negative payment when the withholdings exceed the quota', async () => {
    extraRows = [income(1, 100000, 0, 500000)];

    const summary = await getModelo130Summary(2026, 1);

    expect(summary.casilla4Cents).toBeGreaterThan(0);
    expect(summary.casilla7Cents).toBe(0);
  });

  it('caps the 5% gastos de difícil justificación at 2.000 € a year', async () => {
    extraRows = [income(1, 5000000)]; // +50.000 €, so 5% would be far above the cap

    const summary = await getModelo130Summary(2026, 1);

    expect(summary.gastosDificilCents).toBe(200000);
  });

  it('never returns a negative amount to pay', async () => {
    extraRows = [expense(1, 9000000)];

    const summary = await getModelo130Summary(2026, 1);

    expect(summary.casilla3Cents).toBeLessThan(0);
    expect(summary.casilla4Cents).toBe(0);
    expect(summary.casilla7Cents).toBe(0);
  });
});

describe('Modelo 303 and 100', () => {
  beforeEach(() => {
    mockQuery.mockClear();
    executedSql.length = 0;
    includeStandaloneIncome = false;
    extraRows = [];
  });

  it('reports VAT-free invoice income as non-subject operations in casilla 120', async () => {
    const summary = await getModelo303Summary(2026, 1);

    expect(summary.casilla120Cents).toBe(1168800);
    expect(summary.casilla09Cents).toBe(0);
  });

  it('splits out output VAT when an invoice carries it', async () => {
    extraRows = [income(1, 121000, 21)]; // 1.000,00 € base + 210,00 € IVA

    const summary = await getModelo303Summary(2026, 1);

    expect(summary.casilla07Cents).toBe(100000);
    expect(summary.casilla09Cents).toBe(21000);
    expect(summary.casilla120Cents).toBe(1168800);
  });

  it('books deductible expenses with no casilla code under the default one', async () => {
    const summary = await getModelo100Summary(2026);

    expect(summary.casilla0171Cents).toBe(3756300);
    expect(summary.gastosPorCasilla).toEqual([{ casilla: MODELO_100_DEFAULT_CASILLA, cents: 318036 }]);
  });

  it('carries the whole year of invoice income into Modelo 390', async () => {
    const summary = await getModelo390Summary(2026);

    expect(summary.casilla110Cents).toBe(3756300);
  });
});
