/**
 * Golden Master: every fiscal model, with the IRPF and the IVA deduction shares still equal
 *
 * `computeFiscalFields()` is the single function every fiscal figure in this app flows through —
 * Modelo 303, 130, 390, 100, the IRPF provision, the amortization wiring and the fiscal expense
 * table all derive their cents from it. Splitting its one `DeductionPercent` into two legally
 * different percentages (art. 30.2.5.ª b LIRPF for the IRPF base, art. 95 LIVA for the input VAT —
 * see docs/FISCAL_DOMAIN.md, § Known gaps 2) is therefore the highest-risk edit in the codebase:
 * a silent slip moves numbers on modelos that have already been filed.
 *
 * This file is the net under that edit. Every row below carries a VAT share EQUAL to its IRPF
 * share, which is exactly what "vw_FiscalQuarterly" emits for every row in the live database —
 * `COALESCE("VatDeductionPercent", "DeductionPercent", 0)`, with the new column unset everywhere.
 * So the figures asserted here are the figures the app produced before the split existed, and they
 * must be produced unchanged after it.
 *
 * It was written and run green BEFORE the implementation changed. If a run ever forces one of
 * these expectations to be edited, the change is wrong — the whole point of the null fallback is
 * that not one cent moves until somebody sets a VAT share explicitly.
 *
 * The fixture is shaped like the live case that forced the split:
 *   - home-office supplies (Internet, Luz, Calefacción) coded at 7,5 % — 30 % of the 25 %
 *     affectation declared in the modelo 036 — whose input VAT AEAT would disallow entirely;
 *   - a purchase that became inmovilizado, which the IRPF models skip and the IVA models keep;
 *   - income with and without Spanish output VAT, so casillas 07/09 and 120 are both exercised;
 *   - a quarter that comes out "a compensar", so the pool and casillas 97/662 are exercised too.
 */

import {
  DEFAULT_IRPF_REGION,
  MODELO_100_CASILLA,
  MODELO_100_DEFAULT_CASILLA,
  PROFESSIONAL_INCOME_CATEGORY,
  TRANSACTION_TYPE,
  VAT_RATE,
} from '@/constants/finance';

// ── Fixtures: the rows "vw_FiscalAccrual" returns for 2026 ──

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
  /**
   * The IVA share as the view resolves it today: never NULL, and equal to the IRPF share on every
   * row, because no transaction in the database sets "VatDeductionPercent" yet.
   */
  VatDeductionPercent: number;
  RetentionCents: number;
  Modelo100CasillaCode: string | null;
}

/** Mid-quarter day, UTC like every date the views return. */
const quarterDate = (fiscalQuarter: number): Date => new Date(Date.UTC(2026, (fiscalQuarter - 1) * 3 + 1, 15));

/** The affectation of the modelo 036: 30 % (art. 30.2.5.ª b LIRPF) of a 25 % share of the home. */
const SUPPLIES_DEDUCTION_PERCENT = 7.5;

const FULL_DEDUCTION_PERCENT = 100;

interface RowOptions {
  quarter: number;
  transactionId: number;
  fullAmountCents: number;
  vatPercent?: number;
  deductionPercent?: number;
  retentionCents?: number;
  categoryName?: string;
  casilla?: string | null;
}

function income({
  quarter,
  fullAmountCents,
  vatPercent = VAT_RATE.EXEMPT,
  retentionCents = 0,
}: RowOptions): AccrualRow {
  return {
    FiscalYear: 2026,
    FiscalQuarter: quarter,
    Type: TRANSACTION_TYPE.INCOME,
    TransactionID: 0,
    CategoryID: 0,
    CategoryName: PROFESSIONAL_INCOME_CATEGORY,
    ParentCategoryName: PROFESSIONAL_INCOME_CATEGORY,
    TransactionDate: quarterDate(quarter),
    VendorName: 'Cliente',
    InvoiceNumber: `DW-0${quarter}`,
    Description: 'Servicios profesionales',
    FullAmountCents: fullAmountCents,
    VatPercent: vatPercent,
    DeductionPercent: 0,
    VatDeductionPercent: 0,
    RetentionCents: retentionCents,
    Modelo100CasillaCode: null,
  };
}

function expense({
  quarter,
  transactionId,
  fullAmountCents,
  vatPercent = VAT_RATE.EXEMPT,
  deductionPercent = FULL_DEDUCTION_PERCENT,
  categoryName = 'Software',
  casilla = MODELO_100_CASILLA.C0202,
}: RowOptions): AccrualRow {
  return {
    FiscalYear: 2026,
    FiscalQuarter: quarter,
    Type: TRANSACTION_TYPE.EXPENSE,
    TransactionID: transactionId,
    CategoryID: 30,
    CategoryName: categoryName,
    ParentCategoryName: 'Gastos deducibles',
    TransactionDate: quarterDate(quarter),
    VendorName: 'Proveedor',
    InvoiceNumber: `F-${transactionId}`,
    Description: categoryName,
    FullAmountCents: fullAmountCents,
    VatPercent: vatPercent,
    DeductionPercent: deductionPercent,
    // Equal to the IRPF share: what the COALESCE in "vw_FiscalQuarterly" resolves to today
    VatDeductionPercent: deductionPercent,
    RetentionCents: 0,
    Modelo100CasillaCode: casilla,
  };
}

/** Export invoice, no Spanish output VAT (art. 69 LIVA): base 10.000,00 € straight into casilla 120. */
const INCOME_EXPORT_Q1 = income({ quarter: 1, transactionId: 0, fullAmountCents: 1_000_000 });
/** Domestic invoice, 21 %: base 100.000 cents, cuota 21.000 cents. */
const INCOME_VAT_Q1 = income({
  quarter: 1,
  transactionId: 0,
  fullAmountCents: 121_000,
  vatPercent: VAT_RATE.STANDARD,
});
/** Internet, 48,40 € — base 4.000, IVA 840, at 7,5 % → 300 of base and 63 of VAT. */
const SUPPLIES_INTERNET_Q1 = expense({
  quarter: 1,
  transactionId: 601,
  fullAmountCents: 4_840,
  vatPercent: VAT_RATE.STANDARD,
  deductionPercent: SUPPLIES_DEDUCTION_PERCENT,
  categoryName: 'Internet',
  casilla: MODELO_100_CASILLA.C0194,
});
/** 121,00 € of software, fully affected: base 10.000, IVA 2.100, both fully deductible. */
const SOFTWARE_Q1 = expense({
  quarter: 1,
  transactionId: 602,
  fullAmountCents: 12_100,
  vatPercent: VAT_RATE.STANDARD,
});
/**
 * The purchase that became inmovilizado: 883,30 € con IVA → base 73.000, input VAT 15.330.
 * The IRPF models skip it (its cost arrives as the dotación); the IVA models keep it whole.
 */
const ASSET_PURCHASE_Q1 = expense({
  quarter: 1,
  transactionId: 3489,
  fullAmountCents: 88_330,
  vatPercent: VAT_RATE.STANDARD,
  categoryName: 'Equipos informáticos',
  casilla: MODELO_100_CASILLA.C0208,
});
/** The principal of an aplazamiento: money that moved and that no model may deduct (0 %). */
const TAX_PRINCIPAL_Q1 = expense({
  quarter: 1,
  transactionId: 603,
  fullAmountCents: 78_166,
  deductionPercent: 0,
  categoryName: 'Impuestos',
  casilla: MODELO_100_CASILLA.C0206,
});
/** Domestic invoice with a 15 % withholding: 150,00 € already in the Treasury (casilla 06). */
const INCOME_RETAINED_Q2 = income({
  quarter: 2,
  transactionId: 0,
  fullAmountCents: 121_000,
  vatPercent: VAT_RATE.STANDARD,
  retentionCents: 15_000,
});
/** Luz, 96,80 € — base 8.000, IVA 1.680, at 7,5 % → 600 of base and 126 of VAT. */
const SUPPLIES_LUZ_Q2 = expense({
  quarter: 2,
  transactionId: 604,
  fullAmountCents: 9_680,
  vatPercent: VAT_RATE.STANDARD,
  deductionPercent: SUPPLIES_DEDUCTION_PERCENT,
  categoryName: 'Luz',
  casilla: MODELO_100_CASILLA.C0194,
});
/** Calefacción, 242,00 € — base 20.000, IVA 4.200, at 7,5 % → 1.500 of base and 315 of VAT. */
const SUPPLIES_CALEFACCION_Q3 = expense({
  quarter: 3,
  transactionId: 605,
  fullAmountCents: 24_200,
  vatPercent: VAT_RATE.STANDARD,
  deductionPercent: SUPPLIES_DEDUCTION_PERCENT,
  categoryName: 'Calefacción',
  casilla: MODELO_100_CASILLA.C0194,
});
/** Export invoice of 5.000,00 €, again straight into casilla 120. */
const INCOME_EXPORT_Q4 = income({ quarter: 4, transactionId: 0, fullAmountCents: 500_000 });
/** 60,50 € of software in Q4: the only input VAT of a quarter with no output VAT → a compensar. */
const SOFTWARE_Q4 = expense({
  quarter: 4,
  transactionId: 606,
  fullAmountCents: 6_050,
  vatPercent: VAT_RATE.STANDARD,
});
/** A deductible expense carrying no VAT at all, and no casilla: it feeds `unmappedCents`. */
const UNMAPPED_Q4 = expense({
  quarter: 4,
  transactionId: 607,
  fullAmountCents: 3_000,
  categoryName: 'Cuota de colegiación',
  casilla: null,
});

const ACCRUAL_ROWS: AccrualRow[] = [
  INCOME_EXPORT_Q1,
  INCOME_VAT_Q1,
  SUPPLIES_INTERNET_Q1,
  SOFTWARE_Q1,
  ASSET_PURCHASE_Q1,
  TAX_PRINCIPAL_Q1,
  INCOME_RETAINED_Q2,
  SUPPLIES_LUZ_Q2,
  SUPPLIES_CALEFACCION_Q3,
  INCOME_EXPORT_Q4,
  SOFTWARE_Q4,
  UNMAPPED_Q4,
];

interface FixedAssetRow {
  AssetID: number;
  Description: string;
  InServiceDate: string;
  BaseCents: number;
  /** NUMERIC(5,2) arrives from the driver as a string; the fixture keeps that shape honest */
  CoefficientPercent: string;
  AmortizationGroup: number | null;
  Modelo100CasillaCode: string;
  TransactionID: number | null;
  Notes: string | null;
  CreatedAt: string;
  UpdatedAt: string;
}

/**
 * The asset behind ASSET_PURCHASE_Q1: base 730,00 € at 20 %, in service on 1 January 2026.
 *
 * Deliberately round: 73.000 × 20 / 36.500 is exactly 40 cents a day, so the cumulative dotación
 * of each quarter is an exact integer (90, 181, 273 and 365 days) and no expectation below has to
 * absorb a rounding convention that belongs to `amortizationCentsBetween()`.
 */
const ASSET: FixedAssetRow = {
  AssetID: 1,
  Description: 'Portátil',
  InServiceDate: '2026-01-01',
  BaseCents: 73_000,
  CoefficientPercent: '20.00',
  AmortizationGroup: 5,
  Modelo100CasillaCode: MODELO_100_CASILLA.C0208,
  TransactionID: 3489,
  Notes: null,
  CreatedAt: '2026-01-01T00:00:00.000Z',
  UpdatedAt: '2026-01-01T00:00:00.000Z',
};

/** Cumulative dotación from 1 January: 40 cents × 90 / 181 / 273 / 365 days. */
const AMORTIZATION_CUMULATIVE_CENTS = [3_600, 7_240, 10_920, 14_600] as const;
const AMORTIZATION_YEAR_CENTS = AMORTIZATION_CUMULATIVE_CENTS[3];

// ── Fake Postgres ──

let assetRows: FixedAssetRow[] = [];
let accrualRows: AccrualRow[] = [];

const mockQuery = jest.fn(async (sql: string, params: unknown[]) => {
  if (sql.includes('"FixedAssets"')) {
    // loadAssets() binds [userId] or [userId, upToDay] and filters on "InServiceDate" <= $2
    const [, upToDay] = params as [number, string | undefined];
    return assetRows.filter((asset) => upToDay === undefined || asset.InServiceDate <= upToDay);
  }
  if (sql.includes('FiscalDocuments')) return [];
  if (sql.includes('FiscalProfiles')) {
    return [{ FiscalYear: 2026, PensionIndividualCents: 0, PensionEmploymentCents: 0, VatPoolOpeningCents: 0 }];
  }
  if (!sql.includes('vw_FiscalAccrual')) return [];

  // getFiscalExpenses() binds [year, quarter, type, userId]; every other reader [year, userId, ...]
  if (sql.includes('v."Type" = $3')) {
    const [year, quarter, type] = params as [number, number, string];
    return accrualRows.filter((row) => row.FiscalYear === year && row.FiscalQuarter === quarter && row.Type === type);
  }

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
  getFiscalExpenses,
  getIrpfProjection,
  getModelo100Summary,
  getModelo130Summary,
  getModelo303Summary,
  getModelo390Summary,
} from '@/services/database/FiscalRepository';

/** The year is over, so the IRPF projection runs at a run-rate factor of exactly 1. */
const YEAR_END = new Date('2026-12-31T12:00:00Z');

beforeEach(() => {
  mockQuery.mockClear();
  assetRows = [ASSET];
  accrualRows = ACCRUAL_ROWS;
});

// ── The per-row breakdown the fiscal expense table renders ──

describe('the fiscal expense rows', () => {
  it('should split a 7,5 % home-supply the same way on both sides', async () => {
    const expenses = await getFiscalExpenses(2026, 1);
    const internet = expenses.find((row) => row.categoryName === 'Internet');

    expect(internet).toMatchObject({
      fullAmountCents: 4_840,
      baseCents: 4_000,
      ivaCents: 840,
      baseDeducibleCents: 300,
      ivaDeducibleCents: 63,
      deductionPercent: SUPPLIES_DEDUCTION_PERCENT,
    });
  });

  it('should deduct a fully affected expense whole on both sides', async () => {
    const expenses = await getFiscalExpenses(2026, 1);
    const software = expenses.find((row) => row.transactionId === SOFTWARE_Q1.TransactionID);

    expect(software).toMatchObject({
      baseCents: 10_000,
      ivaCents: 2_100,
      baseDeducibleCents: 10_000,
      ivaDeducibleCents: 2_100,
    });
  });

  it('should deduct nothing at all from a 0 % row', async () => {
    const expenses = await getFiscalExpenses(2026, 1);
    const principal = expenses.find((row) => row.transactionId === TAX_PRINCIPAL_Q1.TransactionID);

    expect(principal).toMatchObject({
      baseCents: 78_166,
      ivaCents: 0,
      baseDeducibleCents: 0,
      ivaDeducibleCents: 0,
    });
  });
});

// ── Modelo 303 ──

describe('Modelo 303', () => {
  it('should fill the four quarters of 2026 exactly as it did before the split', async () => {
    const quarters = await Promise.all([1, 2, 3, 4].map((quarter) => getModelo303Summary(2026, quarter)));

    // Q1: 100.000 of domestic base + 1.000.000 exported; deducts Internet (63), software (2.100)
    // and the whole input VAT of the asset purchase (15.330), which amortization never touches.
    expect(quarters[0]).toMatchObject({
      casilla07Cents: 100_000,
      casilla09Cents: 21_000,
      casilla27Cents: 21_000,
      casilla28Cents: 83_300,
      casilla29Cents: 17_493,
      casilla45Cents: 17_493,
      casilla120Cents: 1_000_000,
      resultCents: 3_507,
      vatPoolOpeningCents: 0,
      vatPoolClosingCents: 0,
    });

    // Q2: only Luz on the expense side — 600 of base, 126 of VAT
    expect(quarters[1]).toMatchObject({
      casilla07Cents: 100_000,
      casilla09Cents: 21_000,
      casilla28Cents: 600,
      casilla29Cents: 126,
      casilla120Cents: 0,
      resultCents: 20_874,
      vatPoolOpeningCents: 0,
      vatPoolClosingCents: 0,
    });

    // Q3: no income at all, so Calefacción's 315 goes straight into the pool
    expect(quarters[2]).toMatchObject({
      casilla07Cents: 0,
      casilla09Cents: 0,
      casilla28Cents: 1_500,
      casilla29Cents: 315,
      resultCents: -315,
      vatPoolOpeningCents: 0,
      vatPoolClosingCents: 315,
    });

    // Q4: exported income only, so the software VAT joins the pool the 3T opened
    expect(quarters[3]).toMatchObject({
      casilla07Cents: 0,
      casilla09Cents: 0,
      casilla28Cents: 5_000,
      casilla29Cents: 1_050,
      casilla120Cents: 500_000,
      resultCents: -1_050,
      vatPoolOpeningCents: 315,
      vatPoolClosingCents: 1_365,
    });
  });

  it('should not call the pool stranded while some quarter charged output VAT', async () => {
    const q4 = await getModelo303Summary(2026, 4);

    expect(q4.vatPoolIsStranded).toBe(false);
  });
});

// ── Modelo 130 ──

describe('Modelo 130', () => {
  it('should restate the year to date in every quarter exactly as it did before the split', async () => {
    const quarters = await Promise.all([1, 2, 3, 4].map((quarter) => getModelo130Summary(2026, quarter)));

    // Q1 — ingresos 1.100.000; documentados 300 (Internet) + 10.000 (software); the asset
    // purchase is skipped because its cost arrives as the dotación of 3.600.
    expect(quarters[0]).toMatchObject({
      casilla1Cents: 1_100_000,
      casilla2Cents: 68_205,
      casilla3Cents: 1_031_795,
      casilla4Cents: 206_359,
      casilla5Cents: 0,
      casilla6Cents: 0,
      casilla7Cents: 206_359,
      gastosDocumentadosCents: 10_300,
      amortizacionCents: AMORTIZATION_CUMULATIVE_CENTS[0],
      gastosDificilCents: 54_305,
    });

    // Q2 — casilla 05 carries the whole of Q1, casilla 06 the 150,00 € withheld
    expect(quarters[1]).toMatchObject({
      casilla1Cents: 1_200_000,
      casilla2Cents: 77_233,
      casilla3Cents: 1_122_767,
      casilla4Cents: 224_553,
      casilla5Cents: 206_359,
      casilla6Cents: 15_000,
      casilla7Cents: 3_194,
      gastosDocumentadosCents: 10_900,
      amortizacionCents: AMORTIZATION_CUMULATIVE_CENTS[1],
      gastosDificilCents: 59_093,
    });

    // Q3 — no income, so what was already settled exceeds the quota: casilla 07 floors at zero
    expect(quarters[2]).toMatchObject({
      casilla1Cents: 1_200_000,
      casilla2Cents: 82_154,
      casilla3Cents: 1_117_846,
      casilla4Cents: 223_569,
      casilla5Cents: 209_553,
      casilla6Cents: 15_000,
      casilla7Cents: 0,
      gastosDocumentadosCents: 12_400,
      amortizacionCents: AMORTIZATION_CUMULATIVE_CENTS[2],
      gastosDificilCents: 58_834,
    });

    // Q4 — the whole year: 20.400 documentados, 14.600 of dotación, 83.250 of difícil justificación
    expect(quarters[3]).toMatchObject({
      casilla1Cents: 1_700_000,
      casilla2Cents: 118_250,
      casilla3Cents: 1_581_750,
      casilla4Cents: 316_350,
      casilla5Cents: 209_553,
      casilla6Cents: 15_000,
      casilla7Cents: 91_797,
      gastosDocumentadosCents: 20_400,
      amortizacionCents: AMORTIZATION_YEAR_CENTS,
      gastosDificilCents: 83_250,
    });
  });

  it('should keep casilla 02 equal to its three parts', async () => {
    const quarters = await Promise.all([1, 2, 3, 4].map((quarter) => getModelo130Summary(2026, quarter)));

    quarters.forEach((summary) => {
      expect(summary.casilla2Cents).toBe(
        summary.gastosDocumentadosCents + summary.amortizacionCents + summary.gastosDificilCents,
      );
    });
  });
});

// ── Modelo 390 ──

describe('Modelo 390', () => {
  it('should sum the year exactly as it did before the split', async () => {
    const summary = await getModelo390Summary(2026);

    expect(summary).toEqual({
      fiscalYear: 2026,
      casilla47Cents: 42_000,
      // 300 + 10.000 + 73.000 + 600 + 1.500 + 5.000 — the asset purchase included, unlike the IRPF side
      casilla48Cents: 90_400,
      // 63 + 2.100 + 15.330 + 126 + 315 + 1.050
      casilla49Cents: 18_984,
      casilla605Cents: 90_400,
      casilla606Cents: 18_984,
      casilla64Cents: 18_984,
      casilla65Cents: 23_016,
      casilla84Cents: 23_016,
      casilla86Cents: 23_016,
      // Only the last period's own result belongs in 97; the 3T's 315 goes to 662
      casilla97Cents: 1_050,
      casilla662Cents: 315,
      casilla110Cents: 1_500_000,
      casilla108Cents: 1_500_000,
    });
  });
});

// ── Modelo 100 ──

describe('Modelo 100', () => {
  it('should fill the actividades económicas section exactly as it did before the split', async () => {
    const summary = await getModelo100Summary(2026);

    expect(summary).toEqual({
      fiscalYear: 2026,
      casilla0171Cents: 1_700_000,
      casilla0180Cents: 1_700_000,
      casilla0218Cents: 35_000,
      casilla0221Cents: 1_665_000,
      casilla0222Cents: 83_250,
      casilla0223Cents: 118_250,
      casilla0224Cents: 1_581_750,
      gastosPorCasilla: [
        // Suministros: Internet 300 + Luz 600 + Calefacción 1.500, all at 7,5 %
        { casilla: MODELO_100_CASILLA.C0194, cents: 2_400 },
        // Otros servicios exteriores: software 10.000 + 5.000, plus the 3.000 that fell back here
        { casilla: MODELO_100_DEFAULT_CASILLA, cents: 18_000 },
        // The dotación of the year, which no transaction can carry
        { casilla: MODELO_100_CASILLA.C0208, cents: AMORTIZATION_YEAR_CENTS },
      ],
      unmappedCents: 3_000,
    });
  });

  it('should keep casilla 0218 equal to the sum of its own breakdown', async () => {
    const summary = await getModelo100Summary(2026);
    const breakdown = summary.gastosPorCasilla.reduce((sum, entry) => sum + entry.cents, 0);

    expect(summary.casilla0218Cents).toBe(breakdown);
  });
});

// ── IRPF projection ──

describe('the IRPF provision', () => {
  it('should project the year exactly as it did before the split', async () => {
    const projection = await getIrpfProjection(2026, { now: YEAR_END });

    expect(projection).toEqual({
      fiscalYear: 2026,
      region: DEFAULT_IRPF_REGION,
      ytdIncomeCents: 1_700_000,
      // The asset purchase is out: its cost enters as amortizacionCents below
      ytdExpensesCents: 20_400,
      projectedIncomeCents: 1_700_000,
      projectedExpensesCents: 20_400,
      amortizacionCents: AMORTIZATION_YEAR_CENTS,
      gastosDificilCents: 83_250,
      projectedNetIncomeCents: 1_581_750,
      pensionIndividualCents: 0,
      pensionEmploymentCents: 0,
      pensionReductionCents: 0,
      baseLiquidableCents: 1_581_750,
      // Q1..Q3 are past their filing window; nothing was recorded, so all three are estimated
      modelo130PaidCents: 209_553,
      modelo130PaidIsEstimated: true,
      modelo130RemainingCents: 91_797,
      modelo130TotalCents: 316_350,
      retencionesCents: 15_000,
      // State 158.685 + Madrid 139.850, less the 99.900 the mínimo personal relieves
      estimatedIrpfCents: 198_635,
      provisionGapCents: -117_715,
      marginalRate: 0.227,
      monthlyProvisionCents: 16_553,
      effectiveRate: 0.1256,
      isProjectionReliable: true,
    });
  });
});
