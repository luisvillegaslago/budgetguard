/**
 * Integration Tests: IRPF provision projection (FiscalRepository.getIrpfProjection)
 *
 * The provision measures what Modelo 130 leaves unpaid: it withholds a flat 20% of the
 * accumulated net income while the Renta applies a progressive scale, so the difference
 * lands in one payment the following June.
 *
 * Fixtures are the rows "vw_FiscalAccrual" returns (the view's own SQL is verified
 * against the database elsewhere). A closed year is used so the run-rate projection
 * equals the actuals and the assertions stay stable whenever the suite runs.
 */

import { IRPF_REGION, PROFESSIONAL_INCOME_CATEGORY, TRANSACTION_TYPE } from '@/constants/finance';

// ── Fixtures ──

/**
 * A fully closed year: elapsed, and with the four Modelo 130 deadlines already past
 * (Q4 is filed in January of the following year, hence two years back).
 */
const YEAR = new Date().getUTCFullYear() - 2;

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
}

/** VAT-free professional income, so the fiscal base equals the full amount. */
function income(fiscalQuarter: number, fullAmountCents: number, retentionCents = 0): AccrualRow {
  return {
    FiscalYear: YEAR,
    FiscalQuarter: fiscalQuarter,
    Type: TRANSACTION_TYPE.INCOME,
    TransactionID: 100 + fiscalQuarter,
    CategoryID: 0,
    CategoryName: PROFESSIONAL_INCOME_CATEGORY,
    ParentCategoryName: PROFESSIONAL_INCOME_CATEGORY,
    FullAmountCents: fullAmountCents,
    VatPercent: 0,
    DeductionPercent: 0,
    RetentionCents: retentionCents,
  };
}

function expense(fiscalQuarter: number, fullAmountCents: number): AccrualRow {
  return {
    FiscalYear: YEAR,
    FiscalQuarter: fiscalQuarter,
    Type: TRANSACTION_TYPE.EXPENSE,
    TransactionID: 500 + fiscalQuarter,
    CategoryID: 30,
    CategoryName: 'Software',
    ParentCategoryName: 'Gastos deducibles',
    FullAmountCents: fullAmountCents,
    VatPercent: 0,
    DeductionPercent: 100,
    RetentionCents: 0,
  };
}

/**
 * The acceptance scenario: 77.237,00 € billed and 6.048,00 € of deductible expenses,
 * spread over the four quarters.
 */
const ACCEPTANCE_ROWS: AccrualRow[] = [
  income(1, 1_931_000),
  income(2, 1_931_000),
  income(3, 1_931_000),
  income(4, 1_930_700),
  expense(1, 151_200),
  expense(2, 151_200),
  expense(3, 151_200),
  expense(4, 151_200),
];

let rows: AccrualRow[] = [];

// ── Fake Postgres ──

const executedSql: string[] = [];

const mockQuery = jest.fn(async (sql: string, params: unknown[]) => {
  executedSql.push(sql);
  if (!sql.includes('vw_FiscalAccrual')) return [];

  const [year] = params as [number, number];
  return rows.filter((row) => row.FiscalYear === year);
});

jest.mock('@/services/database/connection', () => ({
  query: (...args: [string, unknown[]]) => mockQuery(...args),
}));

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 2),
}));

import { getIrpfProjection } from '@/services/database/FiscalRepository';

// ── Tests ──

describe('getIrpfProjection', () => {
  beforeEach(() => {
    mockQuery.mockClear();
    executedSql.length = 0;
    rows = [...ACCEPTANCE_ROWS];
  });

  it('reads the accrual view and never the cash-basis one', async () => {
    await getIrpfProjection(YEAR);

    expect(executedSql).not.toHaveLength(0);
    executedSql.forEach((sql) => {
      expect(sql).toContain('vw_FiscalAccrual');
      expect(sql).not.toContain('vw_FiscalQuarterly');
    });
  });

  it('reports the year-to-date actuals on the accrual basis', async () => {
    const projection = await getIrpfProjection(YEAR);

    expect(projection.fiscalYear).toBe(YEAR);
    expect(projection.region).toBe(IRPF_REGION.MADRID);
    expect(projection.ytdIncomeCents).toBe(7_723_700);
    expect(projection.ytdExpensesCents).toBe(604_800);
  });

  it('projects a closed year to its own actuals', async () => {
    const projection = await getIrpfProjection(YEAR);

    expect(projection.projectedIncomeCents).toBe(projection.ytdIncomeCents);
    expect(projection.projectedExpensesCents).toBe(projection.ytdExpensesCents);
  });

  // ── Acceptance case: 77.237 € billed in Madrid, no dependants ──

  it('quantifies the gap Modelo 130 leaves for the Renta', async () => {
    const projection = await getIrpfProjection(YEAR);

    // 77.237,00 − 6.048,00 − 2.000,00 (5% capped) = 69.189,00 € net income
    expect(projection.gastosDificilCents).toBe(200_000);
    expect(projection.projectedNetIncomeCents).toBe(6_918_900);

    // Modelo 130 pays a flat 20%; the progressive scale charges far more
    expect(projection.modelo130TotalCents).toBe(1_383_780);
    expect(projection.estimatedIrpfCents).toBe(2_010_345);
    expect(projection.provisionGapCents).toBe(626_565);

    expect(projection.marginalRate).toBe(0.43);
    expect(projection.monthlyProvisionCents).toBe(Math.round(2_010_345 / 12));
    expect(projection.effectiveRate).toBe(Math.round((2_010_345 / 6_918_900) * 10_000) / 10_000);
  });

  it('counts the four closed quarters as already paid, leaving nothing for the year', async () => {
    const projection = await getIrpfProjection(YEAR);

    // The four quarterly casillas 7 add up to the whole 20% of the year
    expect(projection.modelo130PaidCents).toBe(projection.modelo130TotalCents);
    expect(projection.modelo130RemainingCents).toBe(0);
  });

  it('deducts the IRPF clients withheld from what Modelo 130 actually paid', async () => {
    rows = [...ACCEPTANCE_ROWS, income(1, 0, 150_000)];

    const projection = await getIrpfProjection(YEAR);

    // 1.500,00 € reached the Treasury through the withholding, not through Modelo 130
    expect(projection.modelo130PaidCents).toBe(projection.modelo130TotalCents - 150_000);
    expect(projection.retencionesCents).toBe(150_000);
    // The year is closed: the withholding is settled money, nothing is left to file
    expect(projection.modelo130RemainingCents).toBe(0);
  });

  it('does not shrink the gap by the retenciones', async () => {
    rows = [...ACCEPTANCE_ROWS, income(1, 0, 150_000)];

    const projection = await getIrpfProjection(YEAR);

    // Casilla 07 = 04 - 05 - 06 already nets the withholdings out quarter by quarter, so the
    // casillas 07 plus the retenciones add up to the whole 20% quota. Subtracting them again
    // would count the withheld IRPF twice and understate the June Renta payment.
    expect(projection.provisionGapCents).toBe(626_565);
  });

  it('reports no retenciones when no client withheld anything', async () => {
    const projection = await getIrpfProjection(YEAR);

    expect(projection.retencionesCents).toBe(0);
  });

  it('flags a closed year as a reliable projection', async () => {
    const projection = await getIrpfProjection(YEAR);

    // The whole year has elapsed, so the run-rate is the actuals themselves
    expect(projection.isProjectionReliable).toBe(true);
  });

  // ── Early-year reliability (injected clock) ──

  describe('early in the year', () => {
    /** 5 January: five elapsed days, far below IRPF_PROJECTION.MIN_PROJECTION_DAYS. */
    const EARLY = new Date(Date.UTC(YEAR, 0, 5));
    /** 15 February: past the threshold. */
    const LATE = new Date(Date.UTC(YEAR, 1, 15));

    it('flags the projection as unreliable while too few days have elapsed', async () => {
      const projection = await getIrpfProjection(YEAR, { now: EARLY });

      expect(projection.isProjectionReliable).toBe(false);
    });

    it('stays unreliable even when the billing is overridden, because expenses are still extrapolated', async () => {
      rows = [expense(1, 80_000)]; // one 800 € annual subscription booked on day 3, no income yet

      const projection = await getIrpfProjection(YEAR, { projectedIncomeCents: 6_000_000, now: EARLY });

      // 800 € × 365/5 = 58.400 € of "expenses" against the 60.000 € the user typed
      expect(projection.projectedExpensesCents).toBeGreaterThan(5_000_000);
      expect(projection.isProjectionReliable).toBe(false);
    });

    it('becomes reliable once enough days have elapsed', async () => {
      const projection = await getIrpfProjection(YEAR, { now: LATE });

      expect(projection.isProjectionReliable).toBe(true);
    });

    it('counts no quarter as settled on the first days of the year', async () => {
      const projection = await getIrpfProjection(YEAR, { now: EARLY });

      // The Q4 window of the previous year is open, but no Modelo 130 of THIS year is due yet
      expect(projection.modelo130PaidCents).toBe(0);
    });
  });

  // ── Control cases ──

  it('honours a manual override of the annual billing (50.000 €)', async () => {
    const projection = await getIrpfProjection(YEAR, { projectedIncomeCents: 5_000_000 });

    expect(projection.projectedIncomeCents).toBe(5_000_000);
    // 50.000,00 − 6.048,00 − 2.000,00 = 41.952,00 € net income
    expect(projection.projectedNetIncomeCents).toBe(4_195_200);
    expect(projection.modelo130TotalCents).toBe(839_040);
    expect(projection.estimatedIrpfCents).toBe(958_987);
    expect(projection.provisionGapCents).toBe(119_947);
  });

  it('honours a manual override of the annual billing (100.000 €)', async () => {
    const projection = await getIrpfProjection(YEAR, { projectedIncomeCents: 10_000_000 });

    // 100.000,00 − 6.048,00 − 2.000,00 = 91.952,00 € net income
    expect(projection.projectedNetIncomeCents).toBe(9_195_200);
    expect(projection.modelo130TotalCents).toBe(1_839_040);
    expect(projection.estimatedIrpfCents).toBe(2_989_153);
    expect(projection.provisionGapCents).toBe(1_150_113);
  });

  it('keeps the year-to-date actuals untouched when the billing is overridden', async () => {
    const projection = await getIrpfProjection(YEAR, { projectedIncomeCents: 10_000_000 });

    expect(projection.ytdIncomeCents).toBe(7_723_700);
    expect(projection.ytdExpensesCents).toBe(604_800);
  });

  // ── Edge cases ──

  it('returns zeroed figures for a year with no activity', async () => {
    rows = [];

    const projection = await getIrpfProjection(YEAR);

    expect(projection.ytdIncomeCents).toBe(0);
    expect(projection.projectedNetIncomeCents).toBe(0);
    expect(projection.modelo130TotalCents).toBe(0);
    expect(projection.estimatedIrpfCents).toBe(0);
    expect(projection.provisionGapCents).toBe(0);
    expect(projection.monthlyProvisionCents).toBe(0);
    expect(projection.effectiveRate).toBe(0);
  });

  it('charges no IRPF when the expenses exceed the income', async () => {
    rows = [income(1, 500_000), expense(1, 2_000_000)];

    const projection = await getIrpfProjection(YEAR);

    expect(projection.projectedNetIncomeCents).toBeLessThan(0);
    expect(projection.modelo130TotalCents).toBe(0);
    expect(projection.estimatedIrpfCents).toBe(0);
    expect(projection.provisionGapCents).toBe(0);
  });

  it('shows no gap while the net income stays under the mínimo personal', async () => {
    rows = [income(1, 500_000)];

    const projection = await getIrpfProjection(YEAR);

    // 5.000,00 € − 250,00 € (5%) = 4.750,00 €, below the 5.550,00 € mínimo personal
    expect(projection.estimatedIrpfCents).toBe(0);
    expect(projection.provisionGapCents).toBeLessThan(0);
  });
});
