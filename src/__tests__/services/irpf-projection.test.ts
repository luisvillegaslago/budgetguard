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
/** Params of every FiscalProfiles read, so the year the projection asks for can be asserted. */
const profileQueryParams: unknown[][] = [];

/** Amounts of the modelos 130 already filed, keyed by quarter (empty unless a test sets them). */
let filedAmounts: Array<{ FiscalQuarter: number; TaxAmountCents: number }> = [];

/** Annual fiscal profile rows (empty unless a test declares a pension contribution). */
let fiscalProfiles: Array<{
  FiscalYear: number;
  PensionIndividualCents: number;
  PensionEmploymentCents: number;
}> = [];

const mockQuery = jest.fn(async (sql: string, params: unknown[]) => {
  executedSql.push(sql);
  if (sql.includes('FiscalDocuments')) return filedAmounts;
  if (sql.includes('FiscalProfiles')) {
    profileQueryParams.push(params);
    return fiscalProfiles;
  }
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
    profileQueryParams.length = 0;
    rows = [...ACCEPTANCE_ROWS];
    filedAmounts = [];
    fiscalProfiles = [];
  });

  /** The real 2025 contributions: 1.500 € individual + 4.250 € plan de empleo (casilla 0492). */
  function contribute(individualCents: number, employmentCents: number): void {
    fiscalProfiles = [
      {
        FiscalYear: YEAR,
        PensionIndividualCents: individualCents,
        PensionEmploymentCents: employmentCents,
      },
    ];
  }

  it('reads the accrual view and never the cash-basis one', async () => {
    await getIrpfProjection(YEAR);

    // The fiscal rows come from the accrual view; the other query reads the filed modelos.
    expect(executedSql.some((sql) => sql.includes('vw_FiscalAccrual'))).toBe(true);
    executedSql.forEach((sql) => {
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
    // Nothing was filed in the fixture, so the figure is a recomputation and says so
    expect(projection.modelo130PaidIsEstimated).toBe(true);
  });

  // ── What was actually filed beats the recomputation ──

  describe('filed amounts', () => {
    it('reports what the filed quarters actually settled, not the recomputation', async () => {
      // Real 2025 figures: the third quarter was a negative declaration and settled nothing
      filedAmounts = [
        { FiscalQuarter: 1, TaxAmountCents: 357_938 },
        { FiscalQuarter: 2, TaxAmountCents: 208_121 },
        { FiscalQuarter: 3, TaxAmountCents: -23_799 },
        { FiscalQuarter: 4, TaxAmountCents: 122_415 },
      ];

      const projection = await getIrpfProjection(YEAR);

      // 3.579,38 + 2.081,21 + 0 (negative quarter) + 1.224,15
      expect(projection.modelo130PaidCents).toBe(688_474);
      expect(projection.modelo130PaidIsEstimated).toBe(false);
    });

    it('falls back to the recomputation only for the quarters with no filed amount', async () => {
      filedAmounts = [{ FiscalQuarter: 1, TaxAmountCents: 357_938 }];

      const projection = await getIrpfProjection(YEAR);

      expect(projection.modelo130PaidIsEstimated).toBe(true);
      // The filed first quarter replaces its own recomputed casilla 7
      expect(projection.modelo130PaidCents).toBeGreaterThan(0);
    });

    it('never lets a negative filed quarter reduce what was paid', async () => {
      filedAmounts = [{ FiscalQuarter: 1, TaxAmountCents: -50_000 }];

      const projection = await getIrpfProjection(YEAR);

      // "Suma de los importes POSITIVOS de la casilla 07": a negative quarter adds zero
      expect(projection.modelo130PaidCents).toBeGreaterThanOrEqual(0);
    });
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

  // ── Pension contributions (annual fiscal profile) ──

  describe('pension plan contributions', () => {
    it('asks for the profile of the projected year and of nobody else', async () => {
      await getIrpfProjection(YEAR);

      // Without this the fixture answers whatever is asked, and a refactor that reads the wrong
      // year (or another taxpayer) would apply last year's reduction to this year's estimate.
      expect(profileQueryParams).toHaveLength(1);
      expect(profileQueryParams[0]).toEqual([2, YEAR]);
    });

    it('reports nothing contributed when the year has no fiscal profile', async () => {
      const projection = await getIrpfProjection(YEAR);

      expect(projection.pensionIndividualCents).toBe(0);
      expect(projection.pensionEmploymentCents).toBe(0);
      expect(projection.pensionReductionCents).toBe(0);
      // With no reduction the base the scale taxes is the rendimiento neto itself
      expect(projection.baseLiquidableCents).toBe(projection.projectedNetIncomeCents);
    });

    it('reduces the base by the whole 5.750 € the law allows an autónomo', async () => {
      contribute(150_000, 425_000);

      const projection = await getIrpfProjection(YEAR);

      expect(projection.pensionIndividualCents).toBe(150_000);
      expect(projection.pensionEmploymentCents).toBe(425_000);
      expect(projection.pensionReductionCents).toBe(575_000);
      // 69.189,00 − 5.750,00 = 63.439,00 €
      expect(projection.baseLiquidableCents).toBe(6_343_900);
    });

    it('cuts the estimated IRPF by the contribution at the marginal rate', async () => {
      contribute(150_000, 425_000);

      const projection = await getIrpfProjection(YEAR);

      // 20.103,45 € without the reduction → 17.630,95 €: 2.472,50 € less, 5.750 € × 43%
      expect(projection.estimatedIrpfCents).toBe(1_763_095);
      expect(projection.monthlyProvisionCents).toBe(146_925);
    });

    it('leaves the whole Modelo 130 side untouched', async () => {
      const withoutProfile = await getIrpfProjection(YEAR);
      contribute(150_000, 425_000);
      const withProfile = await getIrpfProjection(YEAR);

      // The pagos fraccionados of art. 110 RIRPF ignore the reduction: same rendimiento neto,
      // same 20% quota, same settled and remaining amounts
      expect(withProfile.projectedNetIncomeCents).toBe(withoutProfile.projectedNetIncomeCents);
      expect(withProfile.modelo130TotalCents).toBe(withoutProfile.modelo130TotalCents);
      expect(withProfile.modelo130PaidCents).toBe(withoutProfile.modelo130PaidCents);
      expect(withProfile.modelo130RemainingCents).toBe(withoutProfile.modelo130RemainingCents);
    });

    it('shrinks the gap the Renta will charge by exactly the tax saved', async () => {
      contribute(150_000, 425_000);

      const projection = await getIrpfProjection(YEAR);

      // 17.630,95 − 13.837,80: the 6.265,65 € gap drops to 3.793,15 €
      expect(projection.provisionGapCents).toBe(379_315);
    });

    it('keeps the effective rate measured against what was earned, not against the reduced base', async () => {
      contribute(150_000, 425_000);

      const projection = await getIrpfProjection(YEAR);

      expect(projection.effectiveRate).toBe(Math.round((1_763_095 / 6_918_900) * 10_000) / 10_000);
    });

    it('caps each bucket against its own ceiling', async () => {
      // 5.750 € paid entirely into an individual plan: only the 1.500 € general limit reduces
      contribute(575_000, 0);

      const projection = await getIrpfProjection(YEAR);

      expect(projection.pensionIndividualCents).toBe(575_000);
      expect(projection.pensionReductionCents).toBe(150_000);
      expect(projection.baseLiquidableCents).toBe(6_918_900 - 150_000);
    });

    it('caps the joint reduction at 30% of the rendimiento neto', async () => {
      rows = [];
      contribute(150_000, 425_000);

      // 10.000,00 € billed − 500,00 € (5% difícil justificación) = 9.500,00 € net income
      const projection = await getIrpfProjection(YEAR, { projectedIncomeCents: 1_000_000 });

      expect(projection.projectedNetIncomeCents).toBe(950_000);
      // 30% of 9.500,00 € = 2.850,00 €, far below the 5.750,00 € contributed
      expect(projection.pensionReductionCents).toBe(285_000);
      expect(projection.baseLiquidableCents).toBe(665_000);
      expect(projection.estimatedIrpfCents).toBe(19_800);
      // The Modelo 130 quota still reads the full net income
      expect(projection.modelo130TotalCents).toBe(190_000);
    });

    it('takes the marginal rate from the reduced base', async () => {
      rows = ACCEPTANCE_ROWS.filter((row) => row.Type === TRANSACTION_TYPE.EXPENSE);
      contribute(150_000, 425_000);

      // 69.048,00 − 6.048,00 − 2.000,00 = 61.000,00 € net income, 55.250,00 € after the reduction
      const projection = await getIrpfProjection(YEAR, { projectedIncomeCents: 6_904_800 });

      expect(projection.projectedNetIncomeCents).toBe(6_100_000);
      // The reduction drops the base out of the 22,5% + 20,5% brackets into the 18,5% + 17,4% ones
      expect(projection.marginalRate).toBe(0.359);
    });

    it('moves the Renta leg alone: the same year taxed less, the pago fraccionado untouched', async () => {
      // The single regression this whole feature could hide. Modelo 130 (art. 110 RIRPF) is
      // computed on the rendimiento neto and knows nothing about arts. 51-52, so a contribution
      // must lower the Renta side and leave the quarterly side byte-identical. If the reduction
      // ever leaked into projectedNetIncomeCents, both legs would fall together, the gap would
      // look right, and the quarterly instalments would be silently understated.
      const before = await getIrpfProjection(YEAR);
      contribute(150_000, 425_000);
      const after = await getIrpfProjection(YEAR);

      // The Renta leg falls
      expect(after.estimatedIrpfCents).toBeLessThan(before.estimatedIrpfCents);
      expect(after.provisionGapCents).toBeLessThan(before.provisionGapCents);
      // ...by exactly the tax on the reduction, nothing else
      expect(before.estimatedIrpfCents - after.estimatedIrpfCents).toBe(
        before.provisionGapCents - after.provisionGapCents,
      );

      // The Modelo 130 leg does not move a cent
      expect(after.projectedNetIncomeCents).toBe(before.projectedNetIncomeCents);
      expect(after.modelo130TotalCents).toBe(before.modelo130TotalCents);
      expect(after.modelo130PaidCents).toBe(before.modelo130PaidCents);
      expect(after.modelo130RemainingCents).toBe(before.modelo130RemainingCents);
      expect(after.retencionesCents).toBe(before.retencionesCents);

      // Nor does anything upstream of the rendimiento neto
      expect(after.projectedIncomeCents).toBe(before.projectedIncomeCents);
      expect(after.projectedExpensesCents).toBe(before.projectedExpensesCents);
      expect(after.gastosDificilCents).toBe(before.gastosDificilCents);
    });

    it('charges no IRPF when the reduction drops the base under the mínimo personal', async () => {
      rows = [income(1, 620_000)];
      contribute(150_000, 425_000);

      const projection = await getIrpfProjection(YEAR);

      // 6.200,00 − 310,00 (5%) = 5.890,00 € net income, over the 5.550,00 € mínimo personal
      expect(projection.projectedNetIncomeCents).toBe(589_000);
      // 30% of it = 1.767,00 €, so the base drops to 4.123,00 €: below the mínimo
      expect(projection.pensionReductionCents).toBe(176_700);
      expect(projection.baseLiquidableCents).toBe(412_300);
      // The mínimo is relieved as a quota capped at the base, so the result is 0 and never a refund
      expect(projection.estimatedIrpfCents).toBe(0);
      // Modelo 130 still withholds 20% of the whole rendimiento neto
      expect(projection.modelo130TotalCents).toBe(117_800);
    });

    it('reduces nothing in a loss-making year', async () => {
      rows = [income(1, 500_000), expense(1, 2_000_000)];
      contribute(150_000, 425_000);

      const projection = await getIrpfProjection(YEAR);

      // No positive base to reduce: the excess is carried forward (art. 52.2), not applied here
      expect(projection.pensionReductionCents).toBe(0);
      expect(projection.baseLiquidableCents).toBe(projection.projectedNetIncomeCents);
      expect(projection.estimatedIrpfCents).toBe(0);
    });
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
