/**
 * Unit Tests: summary period helpers
 *
 * The daily-average divisor is the piece with real edge cases: it decides what the
 * KPI divides a period's spend by, and getting it wrong inflates or deflates the
 * figure without any visible error. A running period must count only the days that
 * have happened, a finished one its full calendar length (366 in a leap year), and a
 * future one nothing at all.
 */

import { SUMMARY_GRANULARITY } from '@/constants/finance';
import {
  dailyAverageDivisor,
  monthPeriod,
  periodYear,
  previousPeriod,
  resolvePeriod,
  yearPeriod,
} from '@/utils/summaryPeriod';

/** Fixed "today": 10 March 2026, the 69th day of the year. */
const TODAY = new Date(2026, 2, 10);

describe('resolvePeriod', () => {
  it('picks the month or the year depending on the lens', () => {
    expect(resolvePeriod(SUMMARY_GRANULARITY.MONTH, '2026-03', '2024')).toEqual(monthPeriod('2026-03'));
    expect(resolvePeriod(SUMMARY_GRANULARITY.YEAR, '2026-03', '2024')).toEqual(yearPeriod('2024'));
  });
});

describe('previousPeriod', () => {
  it('steps back one month, crossing the year boundary', () => {
    expect(previousPeriod(monthPeriod('2026-01'))).toEqual(monthPeriod('2025-12'));
  });

  it('steps back one year', () => {
    expect(previousPeriod(yearPeriod('2026'))).toEqual(yearPeriod('2025'));
  });
});

describe('periodYear', () => {
  it('reads the year out of either period shape', () => {
    expect(periodYear(monthPeriod('2025-07'))).toBe('2025');
    expect(periodYear(yearPeriod('2025'))).toBe('2025');
  });
});

describe('dailyAverageDivisor — monthly lens', () => {
  it('counts only the elapsed days of the running month', () => {
    expect(dailyAverageDivisor(monthPeriod('2026-03'), TODAY)).toBe(10);
  });

  it('counts the full length of a past month', () => {
    expect(dailyAverageDivisor(monthPeriod('2026-01'), TODAY)).toBe(31);
    expect(dailyAverageDivisor(monthPeriod('2026-02'), TODAY)).toBe(28);
  });

  it('refuses a future month', () => {
    expect(dailyAverageDivisor(monthPeriod('2026-04'), TODAY)).toBeNull();
  });
});

describe('dailyAverageDivisor — yearly lens', () => {
  it('counts only the elapsed days of the running year', () => {
    // 31 (Jan) + 28 (Feb, 2026 is not a leap year) + 10 = 69
    expect(dailyAverageDivisor(yearPeriod('2026'), TODAY)).toBe(69);
  });

  it('counts the full length of a past year', () => {
    expect(dailyAverageDivisor(yearPeriod('2025'), TODAY)).toBe(365);
  });

  it('counts 366 days for a past leap year', () => {
    expect(dailyAverageDivisor(yearPeriod('2024'), TODAY)).toBe(366);
    expect(dailyAverageDivisor(yearPeriod('2000'), TODAY)).toBe(366); // divisible by 400
    expect(dailyAverageDivisor(yearPeriod('1900'), TODAY)).toBe(365); // divisible by 100, not 400
  });

  it('refuses a future year', () => {
    expect(dailyAverageDivisor(yearPeriod('2027'), TODAY)).toBeNull();
  });

  it('counts the first day of a running year as one day, never zero', () => {
    const newYearsDay = new Date(2026, 0, 1);
    expect(dailyAverageDivisor(yearPeriod('2026'), newYearsDay)).toBe(1);
  });

  it('counts every day of a leap year that has just ended', () => {
    const firstOf2025 = new Date(2025, 0, 1);
    expect(dailyAverageDivisor(yearPeriod('2024'), firstOf2025)).toBe(366);
  });
});
