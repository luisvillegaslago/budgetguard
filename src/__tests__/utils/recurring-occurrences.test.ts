/**
 * Unit Tests: Recurring Expense Occurrence Calculation
 * Tests the pure date calculation logic for all frequency types
 */

import { RECURRING_FREQUENCY } from '@/constants/finance';
import {
  calculateAllPendingDates,
  calculateOccurrenceDates,
  computeEndDateFromOccurrences,
  extractRecurrenceFields,
} from '@/utils/recurring';

describe('calculateOccurrenceDates', () => {
  describe('monthly frequency', () => {
    const baseRule = {
      frequency: RECURRING_FREQUENCY.MONTHLY,
      dayOfWeek: null,
      dayOfMonth: 15,
      monthOfYear: null,
      startDate: '2026-01-01',
      endDate: null,
    };

    it('should return one date for a regular month', () => {
      const dates = calculateOccurrenceDates(baseRule, '2026-03');
      expect(dates).toEqual(['2026-03-15']);
    });

    it('should clamp day 31 to 28 in February (non-leap)', () => {
      const rule = { ...baseRule, dayOfMonth: 31 };
      const dates = calculateOccurrenceDates(rule, '2027-02');
      expect(dates).toEqual(['2027-02-28']);
    });

    it('should clamp day 31 to 29 in February (leap year)', () => {
      const rule = { ...baseRule, dayOfMonth: 31 };
      const dates = calculateOccurrenceDates(rule, '2028-02');
      expect(dates).toEqual(['2028-02-29']);
    });

    it('should clamp day 31 to 30 in April', () => {
      const rule = { ...baseRule, dayOfMonth: 31 };
      const dates = calculateOccurrenceDates(rule, '2026-04');
      expect(dates).toEqual(['2026-04-30']);
    });

    it('should not clamp day 31 in months with 31 days', () => {
      const rule = { ...baseRule, dayOfMonth: 31 };
      const dates = calculateOccurrenceDates(rule, '2026-01');
      expect(dates).toEqual(['2026-01-31']);
    });

    it('should return empty for months before startDate', () => {
      const dates = calculateOccurrenceDates(baseRule, '2025-12');
      expect(dates).toEqual([]);
    });

    it('should return empty for months after endDate', () => {
      const rule = { ...baseRule, endDate: '2026-06-30' };
      const dates = calculateOccurrenceDates(rule, '2026-07');
      expect(dates).toEqual([]);
    });

    it('should include the startDate month', () => {
      const dates = calculateOccurrenceDates(baseRule, '2026-01');
      expect(dates).toEqual(['2026-01-15']);
    });

    it('should include the endDate month if date is within range', () => {
      const rule = { ...baseRule, endDate: '2026-06-15' };
      const dates = calculateOccurrenceDates(rule, '2026-06');
      expect(dates).toEqual(['2026-06-15']);
    });

    it('should return empty when dayOfMonth is null', () => {
      const rule = { ...baseRule, dayOfMonth: null };
      const dates = calculateOccurrenceDates(rule, '2026-01');
      expect(dates).toEqual([]);
    });

    it('should handle day 1 correctly', () => {
      const rule = { ...baseRule, dayOfMonth: 1 };
      const dates = calculateOccurrenceDates(rule, '2026-03');
      expect(dates).toEqual(['2026-03-01']);
    });
  });

  describe('weekly frequency', () => {
    const baseRule = {
      frequency: RECURRING_FREQUENCY.WEEKLY,
      dayOfWeek: 1, // Monday
      dayOfMonth: null,
      monthOfYear: null,
      startDate: '2026-01-01',
      endDate: null,
    };

    it('should return all Mondays in a month', () => {
      // March 2026: Mondays are 2, 9, 16, 23, 30
      const dates = calculateOccurrenceDates(baseRule, '2026-03');
      expect(dates).toEqual(['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23', '2026-03-30']);
    });

    it('should return 4 occurrences for months with 4 matching days', () => {
      // February 2026: Mondays are 2, 9, 16, 23
      const dates = calculateOccurrenceDates(baseRule, '2026-02');
      expect(dates).toEqual(['2026-02-02', '2026-02-09', '2026-02-16', '2026-02-23']);
    });

    it('should handle Sunday (dayOfWeek=0)', () => {
      const rule = { ...baseRule, dayOfWeek: 0 };
      // March 2026: Sundays are 1, 8, 15, 22, 29
      const dates = calculateOccurrenceDates(rule, '2026-03');
      expect(dates).toEqual(['2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22', '2026-03-29']);
    });

    it('should handle Saturday (dayOfWeek=6)', () => {
      const rule = { ...baseRule, dayOfWeek: 6 };
      // March 2026: Saturdays are 7, 14, 21, 28
      const dates = calculateOccurrenceDates(rule, '2026-03');
      expect(dates).toEqual(['2026-03-07', '2026-03-14', '2026-03-21', '2026-03-28']);
    });

    it('should respect startDate within month', () => {
      const rule = { ...baseRule, startDate: '2026-03-10' };
      // March 2026 Mondays: 2, 9, 16, 23, 30 — only 16, 23, 30 after startDate
      const dates = calculateOccurrenceDates(rule, '2026-03');
      expect(dates).toEqual(['2026-03-16', '2026-03-23', '2026-03-30']);
    });

    it('should respect endDate within month', () => {
      const rule = { ...baseRule, endDate: '2026-03-20' };
      // March 2026 Mondays: 2, 9, 16, 23, 30 — only 2, 9, 16 before endDate
      const dates = calculateOccurrenceDates(rule, '2026-03');
      expect(dates).toEqual(['2026-03-02', '2026-03-09', '2026-03-16']);
    });

    it('should return empty when dayOfWeek is null', () => {
      const rule = { ...baseRule, dayOfWeek: null };
      const dates = calculateOccurrenceDates(rule, '2026-03');
      expect(dates).toEqual([]);
    });
  });

  describe('yearly frequency', () => {
    const baseRule = {
      frequency: RECURRING_FREQUENCY.YEARLY,
      dayOfWeek: null,
      dayOfMonth: 15,
      monthOfYear: 6,
      startDate: '2026-01-01',
      endDate: null,
    };

    it('should return one date in the matching month', () => {
      const dates = calculateOccurrenceDates(baseRule, '2026-06');
      expect(dates).toEqual(['2026-06-15']);
    });

    it('should return empty for non-matching months', () => {
      const dates = calculateOccurrenceDates(baseRule, '2026-03');
      expect(dates).toEqual([]);
    });

    it('should return empty for non-matching months even with same day', () => {
      const dates = calculateOccurrenceDates(baseRule, '2026-01');
      expect(dates).toEqual([]);
    });

    it('should clamp day in February for yearly', () => {
      const rule = { ...baseRule, dayOfMonth: 29, monthOfYear: 2 };
      // 2027 is not a leap year
      const dates = calculateOccurrenceDates(rule, '2027-02');
      expect(dates).toEqual(['2027-02-28']);
    });

    it('should return 29 in leap year February', () => {
      const rule = { ...baseRule, dayOfMonth: 29, monthOfYear: 2 };
      const dates = calculateOccurrenceDates(rule, '2028-02');
      expect(dates).toEqual(['2028-02-29']);
    });

    it('should respect startDate', () => {
      const rule = { ...baseRule, startDate: '2026-07-01' };
      const dates = calculateOccurrenceDates(rule, '2026-06');
      expect(dates).toEqual([]);
    });

    it('should return empty when dayOfMonth or monthOfYear is null', () => {
      expect(calculateOccurrenceDates({ ...baseRule, dayOfMonth: null }, '2026-06')).toEqual([]);
      expect(calculateOccurrenceDates({ ...baseRule, monthOfYear: null }, '2026-06')).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should return empty for invalid month format', () => {
      const rule = {
        frequency: RECURRING_FREQUENCY.MONTHLY,
        dayOfWeek: null,
        dayOfMonth: 1,
        monthOfYear: null,
        startDate: '2026-01-01',
        endDate: null,
      };
      expect(calculateOccurrenceDates(rule, 'invalid')).toEqual([]);
    });
  });
});

describe('calculateAllPendingDates', () => {
  it('should calculate dates across multiple months', () => {
    const rule = {
      frequency: RECURRING_FREQUENCY.MONTHLY,
      dayOfWeek: null,
      dayOfMonth: 1,
      monthOfYear: null,
      startDate: '2026-01-01',
      endDate: null,
    };

    const dates = calculateAllPendingDates(rule, '2026-01', '2026-03');
    expect(dates).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });

  it('should handle single month range', () => {
    const rule = {
      frequency: RECURRING_FREQUENCY.MONTHLY,
      dayOfWeek: null,
      dayOfMonth: 15,
      monthOfYear: null,
      startDate: '2026-01-01',
      endDate: null,
    };

    const dates = calculateAllPendingDates(rule, '2026-03', '2026-03');
    expect(dates).toEqual(['2026-03-15']);
  });

  it('should handle year boundary', () => {
    const rule = {
      frequency: RECURRING_FREQUENCY.MONTHLY,
      dayOfWeek: null,
      dayOfMonth: 1,
      monthOfYear: null,
      startDate: '2025-11-01',
      endDate: null,
    };

    const dates = calculateAllPendingDates(rule, '2025-11', '2026-02');
    expect(dates).toEqual(['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01']);
  });

  it('should filter out dates before startDate in range', () => {
    const rule = {
      frequency: RECURRING_FREQUENCY.MONTHLY,
      dayOfWeek: null,
      dayOfMonth: 15,
      monthOfYear: null,
      startDate: '2026-02-01',
      endDate: null,
    };

    const dates = calculateAllPendingDates(rule, '2026-01', '2026-03');
    expect(dates).toEqual(['2026-02-15', '2026-03-15']);
  });

  it('should filter out dates after endDate in range', () => {
    const rule = {
      frequency: RECURRING_FREQUENCY.MONTHLY,
      dayOfWeek: null,
      dayOfMonth: 15,
      monthOfYear: null,
      startDate: '2026-01-01',
      endDate: '2026-02-28',
    };

    const dates = calculateAllPendingDates(rule, '2026-01', '2026-03');
    expect(dates).toEqual(['2026-01-15', '2026-02-15']);
  });

  it('should accumulate weekly dates across months', () => {
    const rule = {
      frequency: RECURRING_FREQUENCY.WEEKLY,
      dayOfWeek: 1, // Monday
      dayOfMonth: null,
      monthOfYear: null,
      startDate: '2026-01-01',
      endDate: null,
    };

    const dates = calculateAllPendingDates(rule, '2026-01', '2026-01');
    // January 2026 Mondays: 5, 12, 19, 26
    expect(dates).toEqual(['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26']);
  });
});

describe('extractRecurrenceFields', () => {
  it('should extract dayOfWeek for weekly frequency', () => {
    // 2026-01-05 is a Monday (dayOfWeek=1)
    const fields = extractRecurrenceFields('2026-01-05', RECURRING_FREQUENCY.WEEKLY);
    expect(fields).toEqual({ dayOfWeek: 1, dayOfMonth: null, monthOfYear: null });
  });

  it('should extract dayOfMonth for monthly frequency', () => {
    const fields = extractRecurrenceFields('2026-03-15', RECURRING_FREQUENCY.MONTHLY);
    expect(fields).toEqual({ dayOfWeek: null, dayOfMonth: 15, monthOfYear: null });
  });

  it('should extract dayOfMonth and monthOfYear for yearly frequency', () => {
    const fields = extractRecurrenceFields('2026-06-20', RECURRING_FREQUENCY.YEARLY);
    expect(fields).toEqual({ dayOfWeek: null, dayOfMonth: 20, monthOfYear: 6 });
  });

  it('should handle Sunday (dayOfWeek=0)', () => {
    // 2026-01-04 is a Sunday
    const fields = extractRecurrenceFields('2026-01-04', RECURRING_FREQUENCY.WEEKLY);
    expect(fields.dayOfWeek).toBe(0);
  });
});

describe('computeEndDateFromOccurrences', () => {
  it('should compute monthly end date for 12 occurrences', () => {
    // 12 occurrences from Jan 15 → Dec 15 (same year)
    const endDate = computeEndDateFromOccurrences('2026-01-15', RECURRING_FREQUENCY.MONTHLY, 12);
    expect(endDate).toBe('2026-12-15');
  });

  it('should compute weekly end date for 4 occurrences', () => {
    // 4 occurrences = start + 3 weeks
    const endDate = computeEndDateFromOccurrences('2026-01-05', RECURRING_FREQUENCY.WEEKLY, 4);
    expect(endDate).toBe('2026-01-26');
  });

  it('should compute yearly end date for 3 occurrences', () => {
    const endDate = computeEndDateFromOccurrences('2026-06-15', RECURRING_FREQUENCY.YEARLY, 3);
    expect(endDate).toBe('2028-06-15');
  });

  it('should return same date for count=1', () => {
    const endDate = computeEndDateFromOccurrences('2026-03-15', RECURRING_FREQUENCY.MONTHLY, 1);
    expect(endDate).toBe('2026-03-15');
  });

  it('should clamp day for monthly (Jan 31 + 1 month → Feb 28)', () => {
    const endDate = computeEndDateFromOccurrences('2026-01-31', RECURRING_FREQUENCY.MONTHLY, 2);
    expect(endDate).toBe('2026-02-28');
  });

  it('should handle leap year for yearly (Feb 29)', () => {
    // 2024 is leap year, Feb 29 → 2025 Feb 28 (non-leap)
    const endDate = computeEndDateFromOccurrences('2024-02-29', RECURRING_FREQUENCY.YEARLY, 2);
    expect(endDate).toBe('2025-02-28');
  });
});
