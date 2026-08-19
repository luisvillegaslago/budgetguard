/**
 * Unit Tests: IRPF progressive scale utilities
 *
 * Covers both halves of the scale (state + Madrid), the exact bracket limits, the
 * mínimo personal relief and the linear run-rate projection.
 * Every figure is in cents.
 *
 * Every assertion names the fiscal year it declares: the scale, the mínimo personal and the
 * pension ceilings are fixed per year by the Ley de Presupuestos, and the figures below are
 * 2026's. The lookup and its fallback have a describe block of their own at the end.
 */

import { DEFAULT_IRPF_REGION, IRPF_REGION, IRPF_YEAR_FIGURES, LAST_PUBLISHED_IRPF_YEAR } from '@/constants/finance';
import {
  applyScale,
  computeIrpfCents,
  computeMarginalRate,
  computePensionReductionCents,
  getIrpfFigures,
  getYearProgress,
  isIrpfScaleConfirmed,
  projectAnnualCents,
} from '@/utils/irpf';

/** The year every figure below belongs to. */
const YEAR = 2026;

const FIGURES = getIrpfFigures(YEAR);
const STATE_SCALE = FIGURES.stateScale;
const MADRID_SCALE = FIGURES.regionalScale[IRPF_REGION.MADRID];
const MINIMO_CENTS = FIGURES.minimoPersonalCents;

describe('applyScale', () => {
  it('returns 0 for a base of 0', () => {
    expect(applyScale(0, STATE_SCALE)).toBe(0);
  });

  it('returns 0 for a negative base', () => {
    expect(applyScale(-500_000, STATE_SCALE)).toBe(0);
  });

  it('taxes the first bracket at its own rate', () => {
    // 10.000,00 € at 9,5%
    expect(applyScale(1_000_000, STATE_SCALE)).toBe(95_000);
  });

  it('taxes an exact bracket limit fully at that bracket rate', () => {
    // 12.450,00 € — the whole first state bracket
    expect(applyScale(1_245_000, STATE_SCALE)).toBe(118_275);
  });

  it('spills only the excess into the next bracket', () => {
    // 12.450,00 at 9,5% + 0,01 at 12% = 1.182,75 + 0,0012 → rounds to 118.275
    expect(applyScale(1_245_001, STATE_SCALE)).toBe(118_275);
    // 12.450,00 at 9,5% + 100,00 at 12% = 1.182,75 + 12,00
    expect(applyScale(1_255_000, STATE_SCALE)).toBe(118_275 + 1_200);
  });

  it('covers every state bracket up to the last, unbounded one', () => {
    // 1.182,75 + 930,00 + 2.250,00 + 4.588,00 + 54.000,00 = 62.950,75 € on a 300.000 € base
    expect(applyScale(30_000_000, STATE_SCALE)).toBe(6_295_075);

    // Ten extra euros fall in the 24,5% bracket
    expect(applyScale(30_001_000, STATE_SCALE)).toBe(6_295_075 + 245);
  });

  it('applies the Madrid brackets on its own limits', () => {
    // 13.362,22 € at 8,5%
    expect(applyScale(1_336_222, MADRID_SCALE)).toBe(113_579);
  });
});

describe('computeIrpfCents', () => {
  it('returns 0 for a base of 0', () => {
    expect(computeIrpfCents(YEAR, 0)).toBe(0);
  });

  it('returns 0 for a negative base (a loss pays no IRPF)', () => {
    expect(computeIrpfCents(YEAR, -1_000_000)).toBe(0);
  });

  it('returns 0 exactly at the mínimo personal', () => {
    expect(computeIrpfCents(YEAR, MINIMO_CENTS)).toBe(0);
  });

  it('returns 0 below the mínimo personal, never a refund', () => {
    expect(computeIrpfCents(YEAR, 200_000)).toBe(0);
  });

  it('taxes only the excess over the mínimo personal at the first bracket', () => {
    // 6.550,00 € → 1.000,00 € over the mínimo, taxed at 9,5% + 8,5% = 18%
    expect(computeIrpfCents(YEAR, 655_000)).toBe(18_000);
  });

  it('adds the state and the regional halves', () => {
    const base = 4_000_000; // 40.000,00 €
    const minimoQuota = applyScale(MINIMO_CENTS, STATE_SCALE) + applyScale(MINIMO_CENTS, MADRID_SCALE);

    expect(computeIrpfCents(YEAR, base)).toBe(
      applyScale(base, STATE_SCALE) + applyScale(base, MADRID_SCALE) - minimoQuota,
    );
  });

  it('defaults to the Madrid scale', () => {
    expect(computeIrpfCents(YEAR, 6_918_900)).toBe(computeIrpfCents(YEAR, 6_918_900, DEFAULT_IRPF_REGION));
    expect(DEFAULT_IRPF_REGION).toBe(IRPF_REGION.MADRID);
  });

  it('matches the verified figure for a 69.189,00 € net income (Madrid)', () => {
    // State 11.018,28 + Madrid 10.084,17 − mínimo personal 999,00 = 20.103,45 €
    expect(computeIrpfCents(YEAR, 6_918_900)).toBe(2_010_345);
  });
});

describe('computeMarginalRate', () => {
  it('returns the first-bracket rate at a base of 0', () => {
    expect(computeMarginalRate(YEAR, 0)).toBe(0.18); // 9,5% + 8,5%
  });

  it('jumps to the next bracket exactly at the limit', () => {
    // 12.450,00 € is the last cent of the first state bracket: the next one pays 12%
    expect(computeMarginalRate(YEAR, 1_245_000)).toBe(0.205); // 12% + 8,5%
    expect(computeMarginalRate(YEAR, 1_244_999)).toBe(0.18); // 9,5% + 8,5%
  });

  it('returns 43% for a 69.189,00 € net income (22,5% state + 20,5% Madrid)', () => {
    expect(computeMarginalRate(YEAR, 6_918_900)).toBe(0.43);
  });

  it('returns the top rate above the last limit', () => {
    expect(computeMarginalRate(YEAR, 40_000_000)).toBe(0.45); // 24,5% + 20,5%
  });
});

describe('computePensionReductionCents', () => {
  /** Rendimiento neto high enough (≥ 19.166,67 €) for the 30% cap never to bite. */
  const HIGH_NET_INCOME = 6_918_900;

  it('reduces the whole contribution when every limit is respected', () => {
    // The user's real 2025 figures: 1.500 € individual + 4.250 € plan de empleo (casilla 0492)
    expect(computePensionReductionCents(YEAR, 150_000, 425_000, HIGH_NET_INCOME)).toBe(575_000);
  });

  it('reduces nothing when nothing was contributed', () => {
    expect(computePensionReductionCents(YEAR, 0, 0, HIGH_NET_INCOME)).toBe(0);
  });

  it('never reduces more than what was contributed', () => {
    expect(computePensionReductionCents(YEAR, 100_000, 50_000, HIGH_NET_INCOME)).toBe(150_000);
  });

  it('reduces each bucket in full while it stays below its own ceiling', () => {
    // 900 € individual + 3.000 € plan de empleo, both under their limits
    expect(computePensionReductionCents(YEAR, 90_000, 300_000, HIGH_NET_INCOME)).toBe(390_000);
  });

  it('reduces each bucket in full exactly at its own ceiling', () => {
    // The limits are inclusive: the last euro of each allowance still reduces
    expect(computePensionReductionCents(YEAR, 150_000, 0, HIGH_NET_INCOME)).toBe(150_000);
    expect(computePensionReductionCents(YEAR, 0, 425_000, HIGH_NET_INCOME)).toBe(425_000);
  });

  it('caps the individual plan at the 1.500 € general limit', () => {
    // Art. 52.1.b): a plan individual can never exceed the general limit, whatever was paid in
    expect(computePensionReductionCents(YEAR, 575_000, 0, HIGH_NET_INCOME)).toBe(150_000);
  });

  it('lets an employment plan alone absorb the general limit plus its own increment', () => {
    // Art. 52.1.b): the 1.500 € general limit applies to the total whatever the instrument, and
    // 2.º "incrementa" it by 4.250 € for the self-employed products. So a plan de empleo carries
    // 5.750 € on its own — AEAT's cuadro-resumen for autónomos — and only the excess is lost.
    expect(computePensionReductionCents(YEAR, 0, 575_000, HIGH_NET_INCOME)).toBe(575_000);
    expect(computePensionReductionCents(YEAR, 0, 800_000, HIGH_NET_INCOME)).toBe(575_000);
  });

  it('caps each bucket separately instead of pooling the two ceilings', () => {
    // 5.750 € in total, but split the wrong way round: only 1.500 + 4.250 of each own bucket
    expect(computePensionReductionCents(YEAR, 425_000, 150_000, HIGH_NET_INCOME)).toBe(150_000 + 150_000);
  });

  it('does not treat the same total as interchangeable between the two buckets', () => {
    // The reason the profile stores two amounts instead of one: 5.750 € is fully deductible as
    // 1.500 + 4.250, but a plan individual alone can never carry more than its 1.500 € limit.
    const asIndividualOnly = computePensionReductionCents(YEAR, 575_000, 0, HIGH_NET_INCOME);
    const asBothBuckets = computePensionReductionCents(YEAR, 150_000, 425_000, HIGH_NET_INCOME);

    expect(asBothBuckets).toBe(575_000);
    expect(asIndividualOnly).toBe(150_000);
    expect(asIndividualOnly).not.toBe(asBothBuckets);
  });

  it('caps the sum at 30% of the rendimiento neto', () => {
    // Art. 52.1.a): 30% of 9.500,00 € = 2.850,00 €, below the 5.750,00 € contributed
    expect(computePensionReductionCents(YEAR, 150_000, 425_000, 950_000)).toBe(285_000);
  });

  it('applies the percentage cap to the sum, not to one bucket', () => {
    // 30% of 15.000,00 € = 4.500,00 €: it trims the joint 5.750,00 €, not just the increment
    expect(computePensionReductionCents(YEAR, 150_000, 425_000, 1_500_000)).toBe(450_000);
  });

  it('stops capping once the net income clears the 19.166,67 € threshold', () => {
    // 30% of 19.166,67 € = 5.750,00 €, exactly the whole allowance
    expect(computePensionReductionCents(YEAR, 150_000, 425_000, 1_916_667)).toBe(575_000);
  });

  it('reduces nothing when the year made no profit', () => {
    expect(computePensionReductionCents(YEAR, 150_000, 425_000, 0)).toBe(0);
    expect(computePensionReductionCents(YEAR, 150_000, 425_000, -1_500_000)).toBe(0);
  });

  it('ignores negative contributions instead of adding tax', () => {
    expect(computePensionReductionCents(YEAR, -150_000, 425_000, HIGH_NET_INCOME)).toBe(425_000);
  });

  it("reduces the whole 5.750 € of the user's filed 2025 (casilla 0492)", () => {
    // 37.051,76 € of rendimiento neto: 30% of it is 11.115,53 €, so no cap bites
    expect(computePensionReductionCents(YEAR, 150_000, 425_000, 3_705_176)).toBe(575_000);
  });

  it('reduces the 2.500 € contributed so far in 2026', () => {
    // 1.500 € individual + 1.000 € plan de empleo: both under their ceilings, nothing trimmed
    expect(computePensionReductionCents(YEAR, 150_000, 100_000, 3_705_176)).toBe(250_000);
  });

  it('returns whole cents', () => {
    // 30% of 3.333,33 € = 999,999 € → rounded, never a fraction of a cent
    expect(computePensionReductionCents(YEAR, 150_000, 425_000, 333_333)).toBe(100_000);
  });

  it('trims by exactly what the percentage cap falls short of, not down to a round figure', () => {
    // 30% of 19.000,00 € = 5.700,00 €: 50,00 € of the 5.750,00 € contributed stay out
    expect(computePensionReductionCents(YEAR, 150_000, 425_000, 1_900_000)).toBe(570_000);
  });

  it('lets the percentage cap bite before the absolute ones, never after', () => {
    // 30% of 4.000,00 € = 1.200,00 €, below the 1.500 € general limit alone: the joint ceiling
    // of art. 52.1 is the SMALLEST of the limits, so the percentage one wins on a small year
    expect(computePensionReductionCents(YEAR, 150_000, 425_000, 400_000)).toBe(120_000);
    expect(computePensionReductionCents(YEAR, 150_000, 0, 400_000)).toBe(120_000);
  });

  it('never reduces more than the base it is subtracted from (art. 50.1)', () => {
    // The base can never turn negative because of the reduction: 30% of it is always smaller
    [1, 100_000, 950_000, 1_916_667, 6_918_900].forEach((netIncomeCents) => {
      expect(computePensionReductionCents(YEAR, 575_000, 575_000, netIncomeCents)).toBeLessThan(netIncomeCents);
    });
  });

  it('ignores a negative amount in either bucket', () => {
    expect(computePensionReductionCents(YEAR, 150_000, -425_000, HIGH_NET_INCOME)).toBe(150_000);
    expect(computePensionReductionCents(YEAR, -150_000, -425_000, HIGH_NET_INCOME)).toBe(0);
  });

  it('never reduces less when more is contributed to the same bucket', () => {
    // Monotonicity: the asymmetry between the two buckets is exactly where the ceilings live,
    // so a rule that trims the wrong one shows up as a contribution that lowers the reduction.
    const steps = [0, 100_000, 150_000, 300_000, 425_000, 575_000, 800_000];

    steps.forEach((employment, index) => {
      const previous = steps[index - 1] ?? 0;
      expect(computePensionReductionCents(YEAR, 150_000, employment, HIGH_NET_INCOME)).toBeGreaterThanOrEqual(
        computePensionReductionCents(YEAR, 150_000, previous, HIGH_NET_INCOME),
      );
    });
  });
});

describe('projectAnnualCents', () => {
  it('extrapolates by run-rate', () => {
    // 30.000,00 € in the first half of a 365-day year
    expect(projectAnnualCents(3_000_000, 182, 365)).toBe(Math.round((3_000_000 * 365) / 182));
  });

  it('returns the year-to-date amount once the year is over', () => {
    expect(projectAnnualCents(7_723_700, 365, 365)).toBe(7_723_700);
    expect(projectAnnualCents(7_723_700, 400, 365)).toBe(7_723_700);
  });

  it('returns the year-to-date amount when no day has elapsed', () => {
    expect(projectAnnualCents(0, 0, 365)).toBe(0);
    expect(projectAnnualCents(100_000, 0, 365)).toBe(100_000);
  });

  it('doubles a half-year run rate', () => {
    expect(projectAnnualCents(1_000_000, 183, 366)).toBe(2_000_000);
  });
});

describe('getYearProgress', () => {
  it('reports a past year as fully elapsed', () => {
    expect(getYearProgress(2024, new Date('2026-08-15T00:00:00Z'))).toEqual({ elapsedDays: 366, totalDaysInYear: 366 });
  });

  it('reports a future year as not started', () => {
    expect(getYearProgress(2030, new Date('2026-08-15T00:00:00Z'))).toEqual({ elapsedDays: 0, totalDaysInYear: 365 });
  });

  it('counts the day in progress as elapsed', () => {
    expect(getYearProgress(2026, new Date('2026-01-01T10:00:00Z'))).toEqual({ elapsedDays: 1, totalDaysInYear: 365 });
    expect(getYearProgress(2026, new Date('2026-12-31T23:00:00Z'))).toEqual({ elapsedDays: 365, totalDaysInYear: 365 });
  });

  it('knows leap years', () => {
    expect(getYearProgress(2028, new Date('2028-03-01T00:00:00Z')).totalDaysInYear).toBe(366);
  });
});

// ── The year dimension ──

describe('getIrpfFigures', () => {
  it('returns the figures published for a year that has them', () => {
    expect(getIrpfFigures(LAST_PUBLISHED_IRPF_YEAR)).toBe(IRPF_YEAR_FIGURES[LAST_PUBLISHED_IRPF_YEAR]);
  });

  it('carries the last published figures forward to a year that has none', () => {
    // The Ley de Presupuestos of a future year is not published: projecting it is only possible
    // on the current figures, and the caller is told so through isIrpfScaleConfirmed().
    expect(getIrpfFigures(LAST_PUBLISHED_IRPF_YEAR + 1)).toBe(IRPF_YEAR_FIGURES[LAST_PUBLISHED_IRPF_YEAR]);
    expect(getIrpfFigures(LAST_PUBLISHED_IRPF_YEAR + 10)).toBe(IRPF_YEAR_FIGURES[LAST_PUBLISHED_IRPF_YEAR]);
  });

  it('carries them backwards too, for a year older than the table', () => {
    // Same fallback in both directions, and flagged the same way: the app holds no figures for
    // 2019 either, and inventing them would be worse than saying the projection is provisional.
    expect(getIrpfFigures(2019)).toBe(IRPF_YEAR_FIGURES[LAST_PUBLISHED_IRPF_YEAR]);
  });

  it('holds 2025 and 2026 as the same prorrogadas figures', () => {
    // Ley 31/2022, in force since 01-01-2023 and unmoved by any PGE since
    expect(getIrpfFigures(2026)).toBe(getIrpfFigures(2025));
  });
});

describe('isIrpfScaleConfirmed', () => {
  it('is true for a year with published figures of its own', () => {
    expect(isIrpfScaleConfirmed(2025)).toBe(true);
    expect(isIrpfScaleConfirmed(2026)).toBe(true);
    expect(isIrpfScaleConfirmed(LAST_PUBLISHED_IRPF_YEAR)).toBe(true);
  });

  it('is false past the last published year', () => {
    expect(isIrpfScaleConfirmed(LAST_PUBLISHED_IRPF_YEAR + 1)).toBe(false);
  });

  it('is false for a year older than the table', () => {
    expect(isIrpfScaleConfirmed(2019)).toBe(false);
  });
});

describe('the figures of a year cannot be moved by a later one', () => {
  /**
   * The regression this whole table exists to prevent: before it, the scale was a flat constant,
   * so updating the app for a new Ley de Presupuestos silently rewrote the projection of every
   * year already declared. These are the 2026 figures as they were filed; a new entry added for
   * a later year must never touch them.
   */
  it('pins the 2026 figures', () => {
    const figures = getIrpfFigures(2026);

    expect(figures.stateScale).toEqual([
      [1_245_000, 0.095],
      [2_020_000, 0.12],
      [3_520_000, 0.15],
      [6_000_000, 0.185],
      [30_000_000, 0.225],
      [Number.POSITIVE_INFINITY, 0.245],
    ]);
    expect(figures.regionalScale[IRPF_REGION.MADRID]).toEqual([
      [1_336_222, 0.085],
      [1_900_463, 0.107],
      [3_542_568, 0.128],
      [5_732_040, 0.174],
      [Number.POSITIVE_INFINITY, 0.205],
    ]);
    expect(figures.minimoPersonalCents).toBe(555_000);
    expect(figures.pensionPlan).toEqual({
      generalLimitCents: 150_000,
      selfEmployedExtraCents: 425_000,
      incomePercentageCap: 0.3,
    });
  });

  it('produces for 2026 exactly what it produced before the table existed', () => {
    // The three verified figures of the acceptance case: 69.189,00 € of rendimiento neto
    expect(computeIrpfCents(2026, 6_918_900)).toBe(2_010_345);
    expect(computeMarginalRate(2026, 6_918_900)).toBe(0.43);
    expect(computePensionReductionCents(2026, 150_000, 425_000, 6_918_900)).toBe(575_000);
  });

  it('applies the 2026 figures to 2025, which shares them', () => {
    expect(computeIrpfCents(2025, 6_918_900)).toBe(computeIrpfCents(2026, 6_918_900));
    expect(computePensionReductionCents(2025, 150_000, 425_000, 6_918_900)).toBe(575_000);
  });

  it('projects an unpublished year on the carried-forward figures, and says so', () => {
    const unpublished = LAST_PUBLISHED_IRPF_YEAR + 1;

    expect(computeIrpfCents(unpublished, 6_918_900)).toBe(computeIrpfCents(LAST_PUBLISHED_IRPF_YEAR, 6_918_900));
    expect(isIrpfScaleConfirmed(unpublished)).toBe(false);
  });
});
