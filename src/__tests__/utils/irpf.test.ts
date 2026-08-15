/**
 * Unit Tests: IRPF progressive scale utilities
 *
 * Covers both halves of the scale (state + Madrid), the exact bracket limits, the
 * mínimo personal relief and the linear run-rate projection.
 * Every figure is in cents.
 */

import {
  DEFAULT_IRPF_REGION,
  IRPF_REGION,
  IRPF_REGIONAL_SCALE,
  IRPF_STATE_SCALE,
  MINIMO_PERSONAL_CENTS,
} from '@/constants/finance';
import { applyScale, computeIrpfCents, computeMarginalRate, getYearProgress, projectAnnualCents } from '@/utils/irpf';

const MADRID_SCALE = IRPF_REGIONAL_SCALE[IRPF_REGION.MADRID];

describe('applyScale', () => {
  it('returns 0 for a base of 0', () => {
    expect(applyScale(0, IRPF_STATE_SCALE)).toBe(0);
  });

  it('returns 0 for a negative base', () => {
    expect(applyScale(-500_000, IRPF_STATE_SCALE)).toBe(0);
  });

  it('taxes the first bracket at its own rate', () => {
    // 10.000,00 € at 9,5%
    expect(applyScale(1_000_000, IRPF_STATE_SCALE)).toBe(95_000);
  });

  it('taxes an exact bracket limit fully at that bracket rate', () => {
    // 12.450,00 € — the whole first state bracket
    expect(applyScale(1_245_000, IRPF_STATE_SCALE)).toBe(118_275);
  });

  it('spills only the excess into the next bracket', () => {
    // 12.450,00 at 9,5% + 0,01 at 12% = 1.182,75 + 0,0012 → rounds to 118.275
    expect(applyScale(1_245_001, IRPF_STATE_SCALE)).toBe(118_275);
    // 12.450,00 at 9,5% + 100,00 at 12% = 1.182,75 + 12,00
    expect(applyScale(1_255_000, IRPF_STATE_SCALE)).toBe(118_275 + 1_200);
  });

  it('covers every state bracket up to the last, unbounded one', () => {
    // 1.182,75 + 930,00 + 2.250,00 + 4.588,00 + 54.000,00 = 62.950,75 € on a 300.000 € base
    expect(applyScale(30_000_000, IRPF_STATE_SCALE)).toBe(6_295_075);

    // Ten extra euros fall in the 24,5% bracket
    expect(applyScale(30_001_000, IRPF_STATE_SCALE)).toBe(6_295_075 + 245);
  });

  it('applies the Madrid brackets on its own limits', () => {
    // 13.362,22 € at 8,5%
    expect(applyScale(1_336_222, MADRID_SCALE)).toBe(113_579);
  });
});

describe('computeIrpfCents', () => {
  it('returns 0 for a base of 0', () => {
    expect(computeIrpfCents(0)).toBe(0);
  });

  it('returns 0 for a negative base (a loss pays no IRPF)', () => {
    expect(computeIrpfCents(-1_000_000)).toBe(0);
  });

  it('returns 0 exactly at the mínimo personal', () => {
    expect(computeIrpfCents(MINIMO_PERSONAL_CENTS)).toBe(0);
  });

  it('returns 0 below the mínimo personal, never a refund', () => {
    expect(computeIrpfCents(200_000)).toBe(0);
  });

  it('taxes only the excess over the mínimo personal at the first bracket', () => {
    // 6.550,00 € → 1.000,00 € over the mínimo, taxed at 9,5% + 8,5% = 18%
    expect(computeIrpfCents(655_000)).toBe(18_000);
  });

  it('adds the state and the regional halves', () => {
    const base = 4_000_000; // 40.000,00 €
    const minimoQuota =
      applyScale(MINIMO_PERSONAL_CENTS, IRPF_STATE_SCALE) + applyScale(MINIMO_PERSONAL_CENTS, MADRID_SCALE);

    expect(computeIrpfCents(base)).toBe(
      applyScale(base, IRPF_STATE_SCALE) + applyScale(base, MADRID_SCALE) - minimoQuota,
    );
  });

  it('defaults to the Madrid scale', () => {
    expect(computeIrpfCents(6_918_900)).toBe(computeIrpfCents(6_918_900, DEFAULT_IRPF_REGION));
    expect(DEFAULT_IRPF_REGION).toBe(IRPF_REGION.MADRID);
  });

  it('matches the verified figure for a 69.189,00 € net income (Madrid)', () => {
    // State 11.018,28 + Madrid 10.084,17 − mínimo personal 999,00 = 20.103,45 €
    expect(computeIrpfCents(6_918_900)).toBe(2_010_345);
  });
});

describe('computeMarginalRate', () => {
  it('returns the first-bracket rate at a base of 0', () => {
    expect(computeMarginalRate(0)).toBe(0.18); // 9,5% + 8,5%
  });

  it('jumps to the next bracket exactly at the limit', () => {
    // 12.450,00 € is the last cent of the first state bracket: the next one pays 12%
    expect(computeMarginalRate(1_245_000)).toBe(0.205); // 12% + 8,5%
    expect(computeMarginalRate(1_244_999)).toBe(0.18); // 9,5% + 8,5%
  });

  it('returns 43% for a 69.189,00 € net income (22,5% state + 20,5% Madrid)', () => {
    expect(computeMarginalRate(6_918_900)).toBe(0.43);
  });

  it('returns the top rate above the last limit', () => {
    expect(computeMarginalRate(40_000_000)).toBe(0.45); // 24,5% + 20,5%
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
