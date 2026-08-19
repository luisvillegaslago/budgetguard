/**
 * Integration Tests: the IVA deduction share travelling through the fiscal models
 *
 * The companion of `deduction-split-golden-master.test.ts`. That file pins what must NOT move; this
 * one pins what the split is for — a row whose IVA share is set to 0 must lose its input VAT in
 * Modelo 303 and Modelo 390 and keep every cent of its IRPF deduction in Modelo 130, Modelo 100 and
 * the provision.
 *
 * The case is the live one (docs/FISCAL_DOMAIN.md, § Known gaps 2). Internet, Luz and Calefacción
 * are supplies of a home affected to the activity at 25 % of 102 m² per the modelo 036 filed on
 * 18-ago-2026, so:
 *   - **IRPF**: 30 % of the affected proportion is deductible — 30 % × 25 % = 7,5 %
 *     (art. 30.2.5.ª b LIRPF).
 *   - **IVA**: art. 95 LIVA demands exclusive affectation for anything that is not a bien de
 *     inversión, and AEAT holds that none of that input VAT is deductible (consulta V2554-23,
 *     TEAC 6654/2022) — 0 %.
 *
 * Each test runs the same year twice: once with the VAT share inherited from the IRPF one (what
 * every stored row does today) and once with it set explicitly to zero, and asserts the difference.
 * Comparing two runs rather than restating absolute casillas is deliberate — it isolates the effect
 * of the share alone, so the test cannot drift with the rest of the fixture.
 */

import {
  PROFESSIONAL_INCOME_CATEGORY,
  TRANSACTION_TYPE,
  VAT_DEDUCTION_INHERITS_IRPF,
  VAT_DEDUCTION_PERCENT,
  VAT_RATE,
} from '@/constants/finance';

// ── Fixtures ──

interface AccrualRow {
  FiscalYear: number;
  FiscalQuarter: number;
  Type: string;
  TransactionID: number;
  CategoryID: number;
  CategoryName: string;
  ParentCategoryName: string;
  TransactionDate: Date;
  VendorName: string | null;
  InvoiceNumber: string | null;
  Description: string | null;
  FullAmountCents: number;
  VatPercent: number;
  DeductionPercent: number;
  /** Never NULL out of the view: "vw_FiscalQuarterly" has already COALESCEd it onto the IRPF share */
  VatDeductionPercent: number;
  RetentionCents: number;
  Modelo100CasillaCode: string | null;
}

const quarterDate = (fiscalQuarter: number): Date => new Date(Date.UTC(2026, (fiscalQuarter - 1) * 3 + 1, 15));

/** 30 % (art. 30.2.5.ª b LIRPF) of the 25 % affectation declared in the modelo 036. */
const SUPPLIES_IRPF_SHARE = 7.5;

/** Professional income with Spanish output VAT, so casilla 29 has something to be deducted from. */
const INCOME: AccrualRow = {
  FiscalYear: 2026,
  FiscalQuarter: 1,
  Type: TRANSACTION_TYPE.INCOME,
  TransactionID: 0,
  CategoryID: 0,
  CategoryName: PROFESSIONAL_INCOME_CATEGORY,
  ParentCategoryName: PROFESSIONAL_INCOME_CATEGORY,
  TransactionDate: quarterDate(1),
  VendorName: 'Cliente',
  InvoiceNumber: 'DW-01',
  Description: 'Servicios profesionales',
  FullAmountCents: 1_210_000,
  VatPercent: VAT_RATE.STANDARD,
  DeductionPercent: 0,
  VatDeductionPercent: 0,
  RetentionCents: 0,
  Modelo100CasillaCode: null,
};

function supply(quarter: number, transactionId: number, name: string, fullAmountCents: number): AccrualRow {
  return {
    FiscalYear: 2026,
    FiscalQuarter: quarter,
    Type: TRANSACTION_TYPE.EXPENSE,
    TransactionID: transactionId,
    CategoryID: 30,
    CategoryName: name,
    ParentCategoryName: 'Gastos deducibles',
    TransactionDate: quarterDate(quarter),
    VendorName: 'Suministradora',
    InvoiceNumber: `F-${transactionId}`,
    Description: name,
    FullAmountCents: fullAmountCents,
    VatPercent: VAT_RATE.STANDARD,
    DeductionPercent: SUPPLIES_IRPF_SHARE,
    // Inherited: what every row in the live database resolves to while the column is unset
    VatDeductionPercent: SUPPLIES_IRPF_SHARE,
    RetentionCents: 0,
    Modelo100CasillaCode: null,
  };
}

/** Internet 48,40 € (base 4.000, IVA 840), Luz 96,80 € (8.000 / 1.680), Calefacción 242,00 € (20.000 / 4.200) */
const SUPPLIES: AccrualRow[] = [
  supply(1, 601, 'Internet', 4_840),
  supply(2, 602, 'Luz', 9_680),
  supply(3, 603, 'Calefacción', 24_200),
];

/** 840 × 7,5 % + 1.680 × 7,5 % + 4.200 × 7,5 % — the 63 + 126 + 315 the app deducts today. */
const INHERITED_SUPPLY_VAT_CENTS = 504;

/** The IRPF side, untouched by any of this: 300 + 600 + 1.500. */
const SUPPLY_BASE_DEDUCIBLE_CENTS = 2_400;

/** Two readings of the same year: the shares inherited, and the IVA share cut to 0 (art. 95 LIVA). */
function rowsWithVatShare(vatShare: number | null): AccrualRow[] {
  return [
    INCOME,
    ...SUPPLIES.map((row) => ({
      ...row,
      // NULL never leaves the view; the fallback it stands for is resolved there
      VatDeductionPercent: vatShare ?? row.DeductionPercent,
    })),
  ];
}

const INHERITED_ROWS = rowsWithVatShare(VAT_DEDUCTION_INHERITS_IRPF);
const NO_VAT_DEDUCTION_ROWS = rowsWithVatShare(VAT_DEDUCTION_PERCENT.NONE);

// ── Fake Postgres ──

let accrualRows: AccrualRow[] = [];

const mockQuery = jest.fn(async (sql: string, params: unknown[]) => {
  if (sql.includes('"FixedAssets"')) return [];
  if (sql.includes('FiscalDocuments')) return [];
  if (sql.includes('FiscalProfiles')) {
    return [{ FiscalYear: 2026, PensionIndividualCents: 0, PensionEmploymentCents: 0, VatPoolOpeningCents: 0 }];
  }
  if (!sql.includes('vw_FiscalAccrual')) return [];

  const [year, , quarter] = params as [number, number, number | undefined];
  const cumulative = sql.includes('"FiscalQuarter" <=');

  return accrualRows
    .filter((row) => row.FiscalYear === year)
    .filter((row) => quarter == null || (cumulative ? row.FiscalQuarter <= quarter : row.FiscalQuarter === quarter));
});

jest.mock('@/services/database/connection', () => ({
  query: (...args: [string, unknown[]]) => mockQuery(...args),
}));

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 2),
}));

import {
  getIrpfProjection,
  getModelo100Summary,
  getModelo130Summary,
  getModelo303Summary,
  getModelo390Summary,
} from '@/services/database/FiscalRepository';

/** Runs `read` once over each set of rows and hands back both results. */
async function bothReadings<T>(read: () => Promise<T>): Promise<{ inherited: T; noVatDeduction: T }> {
  accrualRows = INHERITED_ROWS;
  const inherited = await read();
  accrualRows = NO_VAT_DEDUCTION_ROWS;
  const noVatDeduction = await read();

  return { inherited, noVatDeduction };
}

const YEAR_END = new Date('2026-12-31T12:00:00Z');

beforeEach(() => {
  mockQuery.mockClear();
  accrualRows = INHERITED_ROWS;
});

// ── The IVA side moves ──

describe('Modelo 303', () => {
  it('should stop deducting the input VAT of the supplies in casilla 29', async () => {
    const { inherited, noVatDeduction } = await bothReadings(() => getModelo303Summary(2026, 1));

    // Internet: 840 × 7,5 % = 63, and nothing at all once art. 95 LIVA is applied
    expect(inherited.casilla29Cents).toBe(63);
    expect(noVatDeduction.casilla29Cents).toBe(0);
    expect(noVatDeduction.casilla45Cents).toBe(0);
  });

  it('should drop casilla 28 with casilla 29: they are the base and the cuota of one line', async () => {
    const { inherited, noVatDeduction } = await bothReadings(() => getModelo303Summary(2026, 1));

    // This assertion used to demand the opposite, on the reading that casilla 28 is "the base of
    // the deduction" and therefore the IRPF one. It is not: 28 and 29 are the base and the cuota
    // of the SAME line of the 303, so a base whose VAT is not being deducted is an inconsistency
    // visible inside the declaration. No cuota deducted, no base declared.
    expect(inherited.casilla28Cents).toBe(300);
    expect(noVatDeduction.casilla28Cents).toBe(0);
    expect(noVatDeduction.casilla29Cents).toBe(0);
  });

  it('should raise the quarter result by exactly the VAT no longer deducted', async () => {
    const { inherited, noVatDeduction } = await bothReadings(() => getModelo303Summary(2026, 1));

    expect(noVatDeduction.resultCents - inherited.resultCents).toBe(63);
  });

  it('should leave the output VAT of the quarter untouched', async () => {
    const { inherited, noVatDeduction } = await bothReadings(() => getModelo303Summary(2026, 1));

    expect(noVatDeduction.casilla07Cents).toBe(inherited.casilla07Cents);
    expect(noVatDeduction.casilla09Cents).toBe(inherited.casilla09Cents);
    expect(noVatDeduction.casilla27Cents).toBe(inherited.casilla27Cents);
  });
});

describe('Modelo 390', () => {
  it('should drop the whole year of supply VAT from casillas 49 and 606', async () => {
    const { inherited, noVatDeduction } = await bothReadings(() => getModelo390Summary(2026));

    expect(inherited.casilla49Cents).toBe(INHERITED_SUPPLY_VAT_CENTS);
    expect(noVatDeduction.casilla49Cents).toBe(0);
    expect(noVatDeduction.casilla606Cents).toBe(0);
    expect(noVatDeduction.casilla64Cents).toBe(0);
  });

  it('should drop casillas 48 and 605 with the cuota they are the base of', async () => {
    const { inherited, noVatDeduction } = await bothReadings(() => getModelo390Summary(2026));

    // Same rule as casilla 28 of the 303, of which 48 is the annual sum: a base declared without
    // its cuota contradicts casillas 49/606 inside the 390 itself.
    expect(inherited.casilla48Cents).toBe(SUPPLY_BASE_DEDUCIBLE_CENTS);
    expect(noVatDeduction.casilla48Cents).toBe(0);
    expect(noVatDeduction.casilla605Cents).toBe(0);
    expect(noVatDeduction.casilla49Cents).toBe(0);
  });

  it('should raise the annual result by exactly the VAT no longer deducted', async () => {
    const { inherited, noVatDeduction } = await bothReadings(() => getModelo390Summary(2026));

    expect(noVatDeduction.casilla65Cents - inherited.casilla65Cents).toBe(INHERITED_SUPPLY_VAT_CENTS);
  });
});

// ── The IRPF side does not ──

describe('Modelo 130', () => {
  it.each([1, 2, 3, 4])('should be identical in Q%i whatever the IVA share says', async (quarter) => {
    const { inherited, noVatDeduction } = await bothReadings(() => getModelo130Summary(2026, quarter));

    expect(noVatDeduction).toEqual(inherited);
  });

  it('should still deduct the supplies at 7,5 % of their base', async () => {
    accrualRows = NO_VAT_DEDUCTION_ROWS;

    const summary = await getModelo130Summary(2026, 4);

    expect(summary.gastosDocumentadosCents).toBe(SUPPLY_BASE_DEDUCIBLE_CENTS);
  });
});

describe('Modelo 100', () => {
  it('should be identical whatever the IVA share says', async () => {
    const { inherited, noVatDeduction } = await bothReadings(() => getModelo100Summary(2026));

    expect(noVatDeduction).toEqual(inherited);
    expect(noVatDeduction.casilla0218Cents).toBe(SUPPLY_BASE_DEDUCIBLE_CENTS);
  });
});

describe('the IRPF provision', () => {
  it('should be identical whatever the IVA share says', async () => {
    const { inherited, noVatDeduction } = await bothReadings(() => getIrpfProjection(2026, { now: YEAR_END }));

    expect(noVatDeduction).toEqual(inherited);
    expect(noVatDeduction.ytdExpensesCents).toBe(SUPPLY_BASE_DEDUCIBLE_CENTS);
  });
});

// ── The fallback, seen from the models ──

describe('an unset VAT share', () => {
  it('should deduct exactly what a single percentage deducted', async () => {
    accrualRows = INHERITED_ROWS;

    const annual = await getModelo390Summary(2026);

    // 63 + 126 + 315: the figures of the single-column app, reproduced by the COALESCE alone
    expect(annual.casilla49Cents).toBe(INHERITED_SUPPLY_VAT_CENTS);
  });

  it('should never be read as a zero share', async () => {
    accrualRows = INHERITED_ROWS;

    const annual = await getModelo390Summary(2026);

    // The failure mode this whole design avoids: a NULL taken for 0 erases an already filed
    // casilla 29 — 150,82 € of it on the real 4T 2025 (docs/FISCAL_DOMAIN.md, § Amortización)
    expect(annual.casilla49Cents).toBeGreaterThan(0);
  });
});
