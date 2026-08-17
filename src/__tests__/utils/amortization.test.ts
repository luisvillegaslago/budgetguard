/**
 * Unit Tests: amortization
 *
 * An asset is not consumed in the year it is bought: its cost is spread over its useful life
 * (art. 30.2 RIRPF + tabla de amortización simplificada, Orden de 27 de marzo de 1998). These
 * figures land in Modelo 100 casillas 0208/0227 and in the Modelo 130 quarterly base, so the
 * invariant that matters most is not any single year but that the schedule sums to the base:
 * a drifting cent is a deduction the user either loses or claims twice.
 *
 * The golden case is a real asset: transaction 3489, Lenovo Yoga Slim 7 Gen 9.
 */

import { AMORTIZATION, AMORTIZATION_GROUP } from '@/constants/finance';
import { type AmortizableAsset, amortizationCentsBetween, computeAmortizationSchedule } from '@/utils/amortization';

/** Grupo 5 "equipos para tratamiento de la información": 26 %, doubled to 52 % by art. 103 LIS (ERD). */
const LAPTOP_COEFFICIENT = AMORTIZATION_GROUP[5].coefficientPercent * AMORTIZATION.ERD_MULTIPLIER;

/** 869,00 € with 21 % VAT → amortizable base of 718,18 €, in service 28-Nov-2025. */
const LENOVO: AmortizableAsset = {
  baseCents: 71818,
  coefficientPercent: LAPTOP_COEFFICIENT,
  inServiceDate: '2025-11-28',
};

const sumCents = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

const quartersOf = (fiscalYear: number): readonly [string, string][] => [
  [`${fiscalYear}-01-01`, `${fiscalYear}-03-31`],
  [`${fiscalYear}-04-01`, `${fiscalYear}-06-30`],
  [`${fiscalYear}-07-01`, `${fiscalYear}-09-30`],
  [`${fiscalYear}-10-01`, `${fiscalYear}-12-31`],
];

const quarterCents = (asset: AmortizableAsset, fiscalYear: number): number[] =>
  quartersOf(fiscalYear).map(([from, to]) => amortizationCentsBetween(asset, from, to));

describe('amortization', () => {
  describe('golden case — Lenovo Yoga Slim 7 Gen 9 (tx 3489)', () => {
    it('should apply grupo 5 doubled by the ERD acceleration', () => {
      expect(LAPTOP_COEFFICIENT).toBe(52);
    });

    it('should produce a three-year schedule that exhausts the base', () => {
      expect(computeAmortizationSchedule(LENOVO)).toEqual([
        // 34 days of 2025 (28-Nov to 31-Dec). This is the 34,79 € filed in casilla 0208
        // of the rectificativa of the 2025 Renta.
        { fiscalYear: 2025, cents: 3479, remainingCents: 68339 },
        // A full year at 52 %: 71818 × 0,52 = 37345,36 cents → 373,45 €
        { fiscalYear: 2026, cents: 37345, remainingCents: 30994 },
        // The remainder; the base is exhausted 702 days in, mid-2027
        { fiscalYear: 2027, cents: 30994, remainingCents: 0 },
      ]);
    });

    it('should match the schedule when each year is queried directly', () => {
      expect(amortizationCentsBetween(LENOVO, '2025-01-01', '2025-12-31')).toBe(3479);
      expect(amortizationCentsBetween(LENOVO, '2026-01-01', '2026-12-31')).toBe(37345);
      expect(amortizationCentsBetween(LENOVO, '2027-01-01', '2027-12-31')).toBe(30994);
    });

    it('should deduct nothing after the base is exhausted', () => {
      expect(amortizationCentsBetween(LENOVO, '2028-01-01', '2028-12-31')).toBe(0);
      expect(amortizationCentsBetween(LENOVO, '2035-01-01', '2035-12-31')).toBe(0);
    });

    it('should never deduct more than the acquisition cost', () => {
      expect(amortizationCentsBetween(LENOVO, '2020-01-01', '2099-12-31')).toBe(LENOVO.baseCents);
    });
  });

  describe('invariant: the schedule always sums to the base', () => {
    // Rates from the tabla (grupos 1, 2 and 5), the ERD-doubled rate, and a full write-off
    const coefficients = [
      AMORTIZATION_GROUP[1].coefficientPercent,
      AMORTIZATION_GROUP[2].coefficientPercent,
      AMORTIZATION_GROUP[5].coefficientPercent,
      LAPTOP_COEFFICIENT,
      100,
    ];
    // 1 January and 31 December are the boundaries where a proration bug hides
    const inServiceDates = ['2024-01-01', '2024-02-29', '2025-06-15', '2025-11-28', '2025-12-31', '2028-12-31'];
    // 1 cent stresses the rounding: every year but one must come out empty
    const bases = [1, 99, 71818, 1234567];

    const cases = coefficients.flatMap((coefficientPercent) =>
      inServiceDates.flatMap((inServiceDate) =>
        bases.map((baseCents) => ({ baseCents, coefficientPercent, inServiceDate })),
      ),
    );

    it.each(cases)('should sum to $baseCents cents at $coefficientPercent% from $inServiceDate', (asset) => {
      const schedule = computeAmortizationSchedule(asset);

      expect(sumCents(schedule.map((year) => year.cents))).toBe(asset.baseCents);
      expect(schedule.at(-1)?.remainingCents).toBe(0);
    });

    it('should start the schedule in the year the asset entered service', () => {
      cases.forEach((asset) => {
        expect(computeAmortizationSchedule(asset)[0]?.fiscalYear).toBe(Number(asset.inServiceDate.slice(0, 4)));
      });
    });

    it('should keep remainingCents consistent with the cents already deducted', () => {
      cases.forEach((asset) => {
        const schedule = computeAmortizationSchedule(asset);

        schedule.forEach((year, index) => {
          const deducted = sumCents(schedule.slice(0, index + 1).map((entry) => entry.cents));
          expect(year.remainingCents).toBe(asset.baseCents - deducted);
        });
      });
    });

    it('should never emit a negative yearly figure', () => {
      cases.forEach((asset) => {
        computeAmortizationSchedule(asset).forEach((year) => {
          expect(year.cents).toBeGreaterThanOrEqual(0);
        });
      });
    });
  });

  describe('first year prorated by days, not by months', () => {
    it('should count the 34 days of the Lenovo, not two months nor one', () => {
      const monthlyOverTwoMonths = Math.round((LENOVO.baseCents * LAPTOP_COEFFICIENT * 2) / (100 * 12));
      const monthlyOverOneMonth = Math.round((LENOVO.baseCents * LAPTOP_COEFFICIENT * 1) / (100 * 12));

      expect(amortizationCentsBetween(LENOVO, '2025-01-01', '2025-12-31')).toBe(3479);
      expect(monthlyOverTwoMonths).toBe(6224);
      expect(monthlyOverOneMonth).toBe(3112);
    });

    it('should give a full year to an asset in service on 1 January', () => {
      const asset: AmortizableAsset = {
        baseCents: 71818,
        coefficientPercent: AMORTIZATION_GROUP[5].coefficientPercent,
        inServiceDate: '2025-01-01',
      };

      // 71818 × 0,26 = 18672,68 cents → 186,73 €
      expect(amortizationCentsBetween(asset, '2025-01-01', '2025-12-31')).toBe(18673);
    });

    it('should give a single day to an asset in service on 31 December', () => {
      const asset: AmortizableAsset = {
        baseCents: 71818,
        coefficientPercent: AMORTIZATION_GROUP[5].coefficientPercent,
        inServiceDate: '2025-12-31',
      };

      // 71818 × 0,26 / 365 = 51,15 cents → 0,51 €
      expect(amortizationCentsBetween(asset, '2025-01-01', '2025-12-31')).toBe(51);
      expect(computeAmortizationSchedule(asset)[0]).toEqual({ fiscalYear: 2025, cents: 51, remainingCents: 71767 });
    });

    it('should distinguish two assets bought one day apart', () => {
      const bought28th = amortizationCentsBetween(LENOVO, '2025-01-01', '2025-12-31');
      const bought29th = amortizationCentsBetween(
        { ...LENOVO, inServiceDate: '2025-11-29' },
        '2025-01-01',
        '2025-12-31',
      );

      // One day at 52 % on 718,18 € is 1,0231 €; a month-based proration would show no difference
      expect(bought28th - bought29th).toBe(103);
    });
  });

  describe('amortizationCentsBetween — windows around the in-service date', () => {
    it('should return 0 for a period entirely before the in-service date', () => {
      expect(amortizationCentsBetween(LENOVO, '2025-01-01', '2025-11-27')).toBe(0);
      expect(amortizationCentsBetween(LENOVO, '2024-01-01', '2024-12-31')).toBe(0);
    });

    it('should return 0 for a period ending the day before the asset enters service', () => {
      expect(amortizationCentsBetween(LENOVO, '2025-11-01', '2025-11-27')).toBe(0);
    });

    it('should count only the days from the in-service date in a straddling period', () => {
      // November 2025 contains only 3 amortizable days: 28, 29 and 30
      // 71818 × 0,52 × 3 / 365 = 306,94 cents → 3,07 €
      expect(amortizationCentsBetween(LENOVO, '2025-11-01', '2025-11-30')).toBe(307);
    });

    it('should include the in-service day itself', () => {
      expect(amortizationCentsBetween(LENOVO, '2025-11-28', '2025-11-28')).toBe(102);
      expect(amortizationCentsBetween(LENOVO, '2025-11-27', '2025-11-27')).toBe(0);
    });

    it('should ignore how far back the window starts before the in-service date', () => {
      const fromYearStart = amortizationCentsBetween(LENOVO, '2025-01-01', '2025-12-31');
      const fromInService = amortizationCentsBetween(LENOVO, '2025-11-28', '2025-12-31');
      const fromLongBefore = amortizationCentsBetween(LENOVO, '2019-01-01', '2025-12-31');

      expect(fromYearStart).toBe(fromInService);
      expect(fromLongBefore).toBe(fromInService);
    });
  });

  describe('quarterly windows (Modelo 130)', () => {
    it('should split the first year into quarters that sum to the yearly figure', () => {
      const quarters = quarterCents(LENOVO, 2025);

      expect(quarters).toEqual([0, 0, 0, 3479]);
      expect(sumCents(quarters)).toBe(amortizationCentsBetween(LENOVO, '2025-01-01', '2025-12-31'));
    });

    it('should split a full year into quarters that sum to the yearly figure', () => {
      const quarters = quarterCents(LENOVO, 2026);

      // Q1 is shorter (90 days in 2026), so the quarters are not identical
      expect(quarters).toEqual([9208, 9311, 9413, 9413]);
      expect(sumCents(quarters)).toBe(37345);
    });

    it('should split the closing year into quarters that sum to the remainder', () => {
      expect(sumCents(quarterCents(LENOVO, 2027))).toBe(30994);
    });

    it('should keep quarters additive for every year of every schedule', () => {
      const assets: AmortizableAsset[] = [
        LENOVO,
        {
          baseCents: 250000,
          coefficientPercent: AMORTIZATION_GROUP[2].coefficientPercent,
          inServiceDate: '2024-02-29',
        },
        {
          baseCents: 999999,
          coefficientPercent: AMORTIZATION_GROUP[1].coefficientPercent,
          inServiceDate: '2025-12-31',
        },
      ];

      assets.forEach((asset) => {
        computeAmortizationSchedule(asset).forEach((year) => {
          expect(sumCents(quarterCents(asset, year.fiscalYear))).toBe(year.cents);
        });
      });
    });
  });

  describe('degenerate input', () => {
    const tabla = AMORTIZATION_GROUP[5].coefficientPercent;
    const emptyScheduleCases: AmortizableAsset[] = [
      { baseCents: 0, coefficientPercent: tabla, inServiceDate: '2025-11-28' },
      { baseCents: -71818, coefficientPercent: tabla, inServiceDate: '2025-11-28' },
      { baseCents: 71818, coefficientPercent: 0, inServiceDate: '2025-11-28' },
      { baseCents: 71818, coefficientPercent: -tabla, inServiceDate: '2025-11-28' },
    ];

    it.each(
      emptyScheduleCases,
    )('should return an empty schedule for base $baseCents at $coefficientPercent%', (asset) => {
      expect(computeAmortizationSchedule(asset)).toEqual([]);
    });

    it.each(emptyScheduleCases)('should deduct 0 for base $baseCents at $coefficientPercent%', (asset) => {
      expect(amortizationCentsBetween(asset, '2025-01-01', '2025-12-31')).toBe(0);
      expect(amortizationCentsBetween(asset, '2026-01-01', '2026-12-31')).toBe(0);
    });

    it('should return 0 when the window is reversed', () => {
      expect(amortizationCentsBetween(LENOVO, '2026-12-31', '2026-01-01')).toBe(0);
      expect(amortizationCentsBetween(LENOVO, '2027-12-31', '2025-01-01')).toBe(0);
    });

    it('should return 0 for a single-day window before the in-service date', () => {
      expect(amortizationCentsBetween(LENOVO, '2025-06-15', '2025-06-15')).toBe(0);
    });

    it('should handle a base of one cent without splitting it', () => {
      const schedule = computeAmortizationSchedule({
        baseCents: 1,
        coefficientPercent: tabla,
        inServiceDate: '2025-01-01',
      });

      expect(sumCents(schedule.map((year) => year.cents))).toBe(1);
      expect(schedule.filter((year) => year.cents > 0)).toHaveLength(1);
    });
  });

  describe('leap years', () => {
    // 365.000,00 € at 1 % over 100 years: every day is worth exactly 1000 cents (10,00 €), so
    // the yearly figure reads off the day count with no rounding noise.
    const asset: AmortizableAsset = { baseCents: 36500000, coefficientPercent: 1, inServiceDate: '2020-01-01' };

    it('should accrue one extra day in a leap year — the year is fixed at 365 days', () => {
      // Documented behaviour, not an assumption: the util divides by a constant 365, so a
      // 366-day calendar year accrues 366/365 of the nominal coefficient. It is a deliberate
      // simplification and it cannot overshoot, because the accrual is capped at the base and
      // the final period only ever takes the remainder.
      expect(amortizationCentsBetween(asset, '2027-01-01', '2027-12-31')).toBe(365000);
      expect(amortizationCentsBetween(asset, '2028-01-01', '2028-12-31')).toBe(366000);
      expect(amortizationCentsBetween(asset, '2029-01-01', '2029-12-31')).toBe(365000);
    });

    it('should count 29 February as an amortizable day', () => {
      expect(amortizationCentsBetween(asset, '2028-02-29', '2028-02-29')).toBe(1000);
      expect(amortizationCentsBetween(asset, '2028-02-01', '2028-02-29')).toBe(29000);
      expect(amortizationCentsBetween(asset, '2027-02-01', '2027-02-28')).toBe(28000);
    });

    it('should still sum to the base for an asset in service on 29 February', () => {
      const leapAsset: AmortizableAsset = {
        baseCents: 71818,
        coefficientPercent: LAPTOP_COEFFICIENT,
        inServiceDate: '2024-02-29',
      };
      const schedule = computeAmortizationSchedule(leapAsset);

      expect(sumCents(schedule.map((year) => year.cents))).toBe(leapAsset.baseCents);
      expect(schedule.at(-1)?.remainingCents).toBe(0);
    });

    it('should keep quarters additive across a leap February', () => {
      expect(sumCents(quarterCents(asset, 2028))).toBe(366000);
    });
  });
});
