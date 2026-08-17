/**
 * Unit Tests: Working days for AEAT deadlines
 *
 * A deadline landing on a día inhábil moves to the next working one, which is exactly the
 * difference between filing on time and paying a recargo. The cases below are the real
 * calendar dates the quarterly deadlines hit.
 */

import { isWorkingDay, nextWorkingDay } from '@/utils/workingDays';

/** Local midnight, the same convention fiscalDeadlines.ts uses for every deadline. */
const utc = (year: number, month: number, day: number): Date => new Date(year, month - 1, day);

describe('isWorkingDay', () => {
  it('rejects weekends', () => {
    expect(isWorkingDay(utc(2027, 1, 30))).toBe(false); // sábado
    expect(isWorkingDay(utc(2027, 1, 31))).toBe(false); // domingo
    expect(isWorkingDay(utc(2027, 2, 1))).toBe(true); // lunes
  });

  it('rejects the fixed national holidays', () => {
    expect(isWorkingDay(utc(2027, 1, 1))).toBe(false);
    expect(isWorkingDay(utc(2026, 10, 12))).toBe(false);
    expect(isWorkingDay(utc(2026, 12, 25))).toBe(false);
  });

  it('rejects Jueves and Viernes Santo, which can reach the April deadline', () => {
    // Easter 2030 falls on 21 April: Good Friday is the 19th, Maundy Thursday the 18th
    expect(isWorkingDay(utc(2030, 4, 18))).toBe(false);
    expect(isWorkingDay(utc(2030, 4, 19))).toBe(false);
    expect(isWorkingDay(utc(2030, 4, 17))).toBe(true);
  });

  it('accepts an ordinary working day', () => {
    expect(isWorkingDay(utc(2026, 10, 20))).toBe(true);
    expect(isWorkingDay(utc(2026, 7, 15))).toBe(true);
  });
});

describe('nextWorkingDay', () => {
  it('leaves a working day untouched', () => {
    expect(nextWorkingDay(utc(2026, 10, 20))).toEqual(utc(2026, 10, 20));
  });

  it('moves the 4T 2026 deadline off its Saturday', () => {
    // 30 January 2027 is a Saturday: the real deadline is Monday the 1st of February
    expect(nextWorkingDay(utc(2027, 1, 30))).toEqual(utc(2027, 2, 1));
  });

  it('moves the 2025 quarterly deadlines the AEAT calendar itself extended', () => {
    // AEAT published "hasta el 21 de abril" and "hasta el 21 de julio" for 2025: both Sundays
    expect(nextWorkingDay(utc(2025, 4, 20))).toEqual(utc(2025, 4, 21));
    expect(nextWorkingDay(utc(2025, 7, 20))).toEqual(utc(2025, 7, 21));
  });

  it('jumps over a holiday that follows a weekend', () => {
    // 1 January 2028 is a Saturday, so the next working day is Monday the 3rd
    expect(nextWorkingDay(utc(2028, 1, 1))).toEqual(utc(2028, 1, 3));
  });

  it('never moves a date backwards', () => {
    const dates = [utc(2026, 1, 30), utc(2026, 4, 20), utc(2026, 7, 20), utc(2026, 10, 20)];

    dates.forEach((date) => {
      expect(nextWorkingDay(date).getTime()).toBeGreaterThanOrEqual(date.getTime());
    });
  });
});
