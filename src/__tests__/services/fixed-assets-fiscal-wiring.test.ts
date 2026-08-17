/**
 * Integration Tests: the dotación of the inmovilizado inside the fiscal models
 *
 * Deductible expense has a source that is not a transaction. No money moves when an asset
 * amortizes — it left the account the day it was bought — so no row of "vw_FiscalAccrual" can
 * carry the dotación, and every model has to fold "FixedAssets" separately.
 *
 * These tests pin the three joints where that fold meets the models:
 *   Modelo 100 — the dotación must appear as its own casilla (0208 material, 0227 intangible),
 *     and casilla 0218 must still equal the sum of its own breakdown.
 *   Modelo 130 — the dotación is cumulative from 1 January, and casilla 02 must equal
 *     documentados + amortización + difícil justificación.
 *   IRPF projection — the dotación is a calendar, not a run rate: it is the one figure that must
 *     never be extrapolated from what has elapsed.
 *
 * The fixture is the real asset: Lenovo Yoga Slim 7 Gen 9 (tx 3489), base 718,18 €, in service
 * 28-nov-2025, grupo 5 at 26% doubled to 52% by the ERD acceleration of art. 103 LIS.
 */

import {
  MODELO_100_CASILLA,
  MODELO_100_DEFAULT_CASILLA,
  PROFESSIONAL_INCOME_CATEGORY,
  TRANSACTION_TYPE,
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
  FullAmountCents: number;
  VatPercent: number;
  DeductionPercent: number;
  RetentionCents: number;
  Modelo100CasillaCode: string | null;
}

const quarterDate = (fiscalQuarter: number): Date => new Date(Date.UTC(2026, (fiscalQuarter - 1) * 3 + 1, 15));

/** 10.000,00 € of professional income in Q1, VAT excluded, so the base is the full amount */
const INCOME_Q1: AccrualRow = {
  FiscalYear: 2026,
  FiscalQuarter: 1,
  Type: TRANSACTION_TYPE.INCOME,
  TransactionID: 0,
  CategoryID: 0,
  CategoryName: PROFESSIONAL_INCOME_CATEGORY,
  ParentCategoryName: PROFESSIONAL_INCOME_CATEGORY,
  TransactionDate: quarterDate(1),
  FullAmountCents: 1_000_000,
  VatPercent: 0,
  DeductionPercent: 0,
  RetentionCents: 0,
  Modelo100CasillaCode: null,
};

/** 1.000,00 € of documented expense in Q1, mapped to a casilla of its own */
const EXPENSE_Q1: AccrualRow = {
  FiscalYear: 2026,
  FiscalQuarter: 1,
  Type: TRANSACTION_TYPE.EXPENSE,
  TransactionID: 500,
  CategoryID: 30,
  CategoryName: 'Software',
  ParentCategoryName: 'Gastos deducibles',
  TransactionDate: quarterDate(1),
  FullAmountCents: 100_000,
  VatPercent: 0,
  DeductionPercent: 100,
  RetentionCents: 0,
  Modelo100CasillaCode: MODELO_100_CASILLA.C0202,
};

/**
 * The purchase the asset was created from: 869,00 € with 21% VAT, fully deductible.
 * Its base is 718,18 € and its input VAT 150,82 €, which the tests below pull apart.
 */
const ASSET_PURCHASE_Q1: AccrualRow = {
  FiscalYear: 2026,
  FiscalQuarter: 1,
  Type: TRANSACTION_TYPE.EXPENSE,
  TransactionID: 3489,
  CategoryID: 40,
  CategoryName: 'Equipos informáticos',
  ParentCategoryName: 'Gastos deducibles',
  TransactionDate: quarterDate(1),
  FullAmountCents: 86_900,
  VatPercent: 21,
  DeductionPercent: 100,
  RetentionCents: 0,
  Modelo100CasillaCode: MODELO_100_CASILLA.C0202,
};

/** Base of ASSET_PURCHASE_Q1: 86.900 / 1,21 */
const PURCHASE_BASE_CENTS = 71818;
/** Input VAT of ASSET_PURCHASE_Q1: the full amount minus its base */
const PURCHASE_VAT_CENTS = 15082;

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

const LENOVO: FixedAssetRow = {
  AssetID: 1,
  Description: 'Lenovo Yoga Slim 7 Gen 9',
  InServiceDate: '2025-11-28',
  BaseCents: 71818,
  CoefficientPercent: '52.00',
  AmortizationGroup: 5,
  Modelo100CasillaCode: MODELO_100_CASILLA.C0208,
  TransactionID: 3489,
  Notes: null,
  CreatedAt: '2026-08-15T00:00:00.000Z',
  UpdatedAt: '2026-08-15T00:00:00.000Z',
};

/** 1.200,00 € of software licence, in service 1-jan-2026 at 33% — lands in the intangible box */
const LICENCE: FixedAssetRow = {
  ...LENOVO,
  AssetID: 2,
  Description: 'Licencia de software',
  InServiceDate: '2026-01-01',
  BaseCents: 120_000,
  CoefficientPercent: '33.00',
  AmortizationGroup: null,
  Modelo100CasillaCode: MODELO_100_CASILLA.C0227,
  TransactionID: null,
};

/** The Lenovo's 2026 dotación: 71.818 × 0,52 over the calendar, i.e. accrued 399 days − the 34 of 2025 */
const LENOVO_2026_CENTS = 37345;
/** Same asset from 1 January to 31 March 2026: 124 accrued days − the 34 already taken in 2025 */
const LENOVO_2026_Q1_CENTS = 9208;
/** The licence entered service on 1 January, so a full year at 33% of 1.200,00 € */
const LICENCE_2026_CENTS = 39600;

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
} from '@/services/database/FiscalRepository';

// ── Tests ──

beforeEach(() => {
  mockQuery.mockClear();
  assetRows = [LENOVO];
  accrualRows = [INCOME_Q1, EXPENSE_Q1];
});

describe('Modelo 100 — the dotación reaches casilla 0208', () => {
  it('should book the amortization of the year under its own casilla', async () => {
    const summary = await getModelo100Summary(2026);

    expect(summary.gastosPorCasilla).toContainEqual({
      casilla: MODELO_100_CASILLA.C0208,
      cents: LENOVO_2026_CENTS,
    });
  });

  it('should send an intangible asset to casilla 0227 and leave 0208 to the material one', async () => {
    assetRows = [LENOVO, LICENCE];

    const summary = await getModelo100Summary(2026);

    expect(summary.gastosPorCasilla).toContainEqual({
      casilla: MODELO_100_CASILLA.C0208,
      cents: LENOVO_2026_CENTS,
    });
    expect(summary.gastosPorCasilla).toContainEqual({
      casilla: MODELO_100_CASILLA.C0227,
      cents: LICENCE_2026_CENTS,
    });
  });

  it.each([
    ['only documented expenses', () => [] as FixedAssetRow[]],
    ['one material asset', () => [LENOVO]],
    ['a material and an intangible asset', () => [LENOVO, LICENCE]],
  ])('should keep casilla 0218 equal to the sum of its parts with %s', async (_case, assets) => {
    assetRows = assets();

    const summary = await getModelo100Summary(2026);
    const breakdown = summary.gastosPorCasilla.reduce((sum, entry) => sum + entry.cents, 0);

    expect(summary.casilla0218Cents).toBe(breakdown);
  });

  it('should carry the dotación down the chain 0218 → 0221 → 0223 → 0224', async () => {
    const withAsset = await getModelo100Summary(2026);
    assetRows = [];
    const withoutAsset = await getModelo100Summary(2026);

    expect(withAsset.casilla0218Cents - withoutAsset.casilla0218Cents).toBe(LENOVO_2026_CENTS);
    // A bigger deductible expense means a smaller rendimiento, so 0221 and 0224 drop by it
    expect(withoutAsset.casilla0221Cents - withAsset.casilla0221Cents).toBe(LENOVO_2026_CENTS);
    expect(withAsset.casilla0223Cents).toBe(withAsset.casilla0218Cents + withAsset.casilla0222Cents);
    expect(withAsset.casilla0224Cents).toBe(withAsset.casilla0180Cents - withAsset.casilla0223Cents);
  });

  it('should not count the dotación as unmapped: an asset always declares its casilla', async () => {
    const mapped = await getModelo100Summary(2026);

    accrualRows = [INCOME_Q1, { ...EXPENSE_Q1, Modelo100CasillaCode: null }];
    const unmapped = await getModelo100Summary(2026);

    expect(mapped.unmappedCents).toBe(0);
    // Only the expense row falls back; the asset never does, whatever the rows around it do
    expect(unmapped.unmappedCents).toBe(100_000);
    expect(unmapped.gastosPorCasilla).toContainEqual({
      casilla: MODELO_100_DEFAULT_CASILLA,
      cents: 100_000,
    });
  });

  it('should ignore an asset whose base is already exhausted', async () => {
    // The Lenovo runs out during 2027, so 2028 has nothing left to deduct
    const summary = await getModelo100Summary(2028);

    expect(summary.gastosPorCasilla).toEqual([]);
    expect(summary.casilla0218Cents).toBe(0);
  });
});

describe('Modelo 130 — the dotación accrues by the calendar, not by the quarter it is filed in', () => {
  it('should report the dotación accumulated from 1 January to the end of the quarter', async () => {
    const q1 = await getModelo130Summary(2026, 1);
    const q4 = await getModelo130Summary(2026, 4);

    expect(q1.amortizacionCents).toBe(LENOVO_2026_Q1_CENTS);
    expect(q4.amortizacionCents).toBe(LENOVO_2026_CENTS);
  });

  it.each([1, 2, 3, 4])('should keep casilla 02 equal to its three parts in Q%i', async (quarter) => {
    const summary = await getModelo130Summary(2026, quarter);

    expect(summary.casilla2Cents).toBe(
      summary.gastosDocumentadosCents + summary.amortizacionCents + summary.gastosDificilCents,
    );
  });

  it('should lower the base the 5% of difícil justificación is computed on', async () => {
    const withAsset = await getModelo130Summary(2026, 1);
    assetRows = [];
    const withoutAsset = await getModelo130Summary(2026, 1);

    // The dotación is a deductible expense of the year like any other, only one that moved no money
    expect(withoutAsset.gastosDificilCents).toBeGreaterThan(withAsset.gastosDificilCents);
    expect(withAsset.casilla2Cents - withoutAsset.casilla2Cents).toBe(
      LENOVO_2026_Q1_CENTS - (withoutAsset.gastosDificilCents - withAsset.gastosDificilCents),
    );
  });

  it('should reduce the amount to pay once an asset is registered', async () => {
    const withAsset = await getModelo130Summary(2026, 1);
    assetRows = [];
    const withoutAsset = await getModelo130Summary(2026, 1);

    expect(withAsset.casilla7Cents).toBeLessThan(withoutAsset.casilla7Cents);
  });

  it('should report no dotación for a year the asset had not entered service yet', async () => {
    accrualRows = accrualRows.map((row) => ({ ...row, FiscalYear: 2024 }));

    const summary = await getModelo130Summary(2024, 4);

    expect(summary.amortizacionCents).toBe(0);
  });
});

describe('IRPF projection — amortization is a calendar, not a run rate', () => {
  it('should take the full-year dotación whatever fraction of the year has elapsed', async () => {
    const january = await getIrpfProjection(2026, { now: new Date('2026-01-20T00:00:00Z') });
    const december = await getIrpfProjection(2026, { now: new Date('2026-12-20T00:00:00Z') });

    // A projected dotación would read roughly thirtyfold in January — expense no asset backs
    expect(january.amortizacionCents).toBe(LENOVO_2026_CENTS);
    expect(december.amortizacionCents).toBe(LENOVO_2026_CENTS);
  });

  it('should keep the dotación out of the run-rated expense pair', async () => {
    const withAsset = await getIrpfProjection(2026, { now: new Date('2026-06-30T00:00:00Z') });
    assetRows = [];
    const withoutAsset = await getIrpfProjection(2026, { now: new Date('2026-06-30T00:00:00Z') });

    // ytd/projected expenses are the run-rate pair; the dotación is neither of them
    expect(withAsset.ytdExpensesCents).toBe(withoutAsset.ytdExpensesCents);
    expect(withAsset.projectedExpensesCents).toBe(withoutAsset.projectedExpensesCents);
  });

  it('should subtract the dotación from the net income all the same', async () => {
    const now = new Date('2026-06-30T00:00:00Z');
    const withAsset = await getIrpfProjection(2026, { now });
    assetRows = [];
    const withoutAsset = await getIrpfProjection(2026, { now });

    expect(withoutAsset.projectedNetIncomeCents).toBeGreaterThan(withAsset.projectedNetIncomeCents);
    expect(withAsset.amortizacionCents).toBe(LENOVO_2026_CENTS);
    expect(withoutAsset.amortizacionCents).toBe(0);
  });

  it('should agree with the Modelo 130 series it carries', async () => {
    const projection = await getIrpfProjection(2026, { now: new Date('2026-12-20T00:00:00Z') });
    const q4 = await getModelo130Summary(2026, 4);

    // Both sides fold the same assets over the same span, so they cannot disagree by a cent
    expect(projection.amortizacionCents).toBe(q4.amortizacionCents);
  });
});

describe('the purchase of an asset is expense for IVA but not for IRPF', () => {
  /**
   * The whole point of the split. An asset reaches the IRPF models through its amortization, so its
   * purchase must not ALSO count as expense there — that would deduct it twice. But the input VAT
   * of an asset is deducted in full in the quarter it was bought and is never amortized, so Modelo
   * 303 must keep it.
   *
   * The obvious shortcut — zeroing the purchase's DeductionPercent — cannot do this: that single
   * column drives the deductible VAT as well (see computeFiscalFields), so it would erase the input
   * VAT too. On the real Lenovo that was 150,82 € of the 158,74 € in casilla 29 of an already filed
   * 4T 2025. Hence the exclusion by FixedAssets.TransactionID, asserted here.
   */
  beforeEach(() => {
    accrualRows = [INCOME_Q1, EXPENSE_Q1, ASSET_PURCHASE_Q1];
    assetRows = [{ ...LENOVO, InServiceDate: '2026-01-01', TransactionID: ASSET_PURCHASE_Q1.TransactionID }];
  });

  it('should keep the purchase out of the documented expenses of Modelo 130', async () => {
    const linked = await getModelo130Summary(2026, 1);
    assetRows = [];
    const unlinked = await getModelo130Summary(2026, 1);

    expect(unlinked.gastosDocumentadosCents - linked.gastosDocumentadosCents).toBe(PURCHASE_BASE_CENTS);
    expect(linked.gastosDocumentadosCents).toBe(EXPENSE_Q1.FullAmountCents);
  });

  it('should keep the purchase out of the deductible expenses of Modelo 100', async () => {
    const linked = await getModelo100Summary(2026);
    assetRows = [];
    const unlinked = await getModelo100Summary(2026);

    // Registered, the asset contributes its dotación and nothing else; unregistered, the purchase
    // lands whole. Asserting the composition rather than the difference, because the difference
    // nets two changes against each other and would still pass if both were wrong.
    expect(linked.casilla0218Cents).toBe(EXPENSE_Q1.FullAmountCents + LENOVO_2026_CENTS);
    expect(unlinked.casilla0218Cents).toBe(EXPENSE_Q1.FullAmountCents + PURCHASE_BASE_CENTS);
  });

  it('should keep the purchase out of the projected expenses', async () => {
    const now = new Date('2026-12-20T00:00:00Z');
    const linked = await getIrpfProjection(2026, { now });
    assetRows = [];
    const unlinked = await getIrpfProjection(2026, { now });

    expect(unlinked.ytdExpensesCents - linked.ytdExpensesCents).toBe(PURCHASE_BASE_CENTS);
  });

  it('should STILL deduct the input VAT of the purchase in Modelo 303', async () => {
    const linked = await getModelo303Summary(2026, 1);
    assetRows = [];
    const unlinked = await getModelo303Summary(2026, 1);

    // Registering the asset must not move a single cent of the IVA side
    expect(linked.casilla29Cents).toBe(unlinked.casilla29Cents);
    expect(linked.casilla29Cents).toBeGreaterThanOrEqual(PURCHASE_VAT_CENTS);
    expect(linked.casilla28Cents).toBe(unlinked.casilla28Cents);
  });
});
