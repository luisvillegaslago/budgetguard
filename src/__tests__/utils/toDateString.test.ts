/**
 * Unit Tests: toDateString
 * Ensures DATE columns from PostgreSQL are converted to YYYY-MM-DD
 * without UTC timezone shift (the pg driver returns Date objects
 * in the local timezone, so toISOString() would lose a day).
 */

import { toDateString } from '@/utils/helpers';

describe('toDateString', () => {
  describe('string inputs', () => {
    it('should return YYYY-MM-DD from an ISO timestamp string', () => {
      expect(toDateString('2026-03-07T00:00:00.000Z')).toBe('2026-03-07');
    });

    it('should return a plain date string as-is', () => {
      expect(toDateString('2026-03-07')).toBe('2026-03-07');
    });

    it('should handle ISO string with non-zero time', () => {
      expect(toDateString('2026-12-25T15:30:00.000Z')).toBe('2026-12-25');
    });

    it('should handle string with timezone offset', () => {
      expect(toDateString('2026-06-15T00:00:00+02:00')).toBe('2026-06-15');
    });
  });

  describe('Date object inputs (simulating pg driver behavior)', () => {
    it('should use local date, not UTC — CET midnight case', () => {
      // pg driver returns DATE "2026-03-07" as Date in local TZ.
      // In CET (UTC+1) this is 2026-03-06T23:00:00Z internally.
      // We must get "2026-03-07", not "2026-03-06".
      const date = new Date(2026, 2, 7); // March 7, 2026 local time
      expect(toDateString(date)).toBe('2026-03-07');
    });

    it('should pad single-digit month and day', () => {
      const date = new Date(2026, 0, 5); // January 5
      expect(toDateString(date)).toBe('2026-01-05');
    });

    it('should handle last day of year', () => {
      const date = new Date(2026, 11, 31); // December 31
      expect(toDateString(date)).toBe('2026-12-31');
    });

    it('should handle first day of year', () => {
      const date = new Date(2026, 0, 1); // January 1
      expect(toDateString(date)).toBe('2026-01-01');
    });

    it('should handle leap year date', () => {
      const date = new Date(2028, 1, 29); // Feb 29, 2028
      expect(toDateString(date)).toBe('2028-02-29');
    });
  });
});
