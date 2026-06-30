/**
 * Unit tests for the Madrid civil-time fiscal-year helpers.
 */

import { fiscalYearOf, madridYearStartUtc } from '@/utils/crypto/fiscalYear';

describe('fiscalYearOf', () => {
  it('maps a UTC instant that is already next-year in Madrid to the next year', () => {
    // 2024-12-31 23:30 UTC = 2025-01-01 00:30 Madrid (CET, UTC+1) → fiscal year 2025
    expect(fiscalYearOf('2024-12-31T23:30:00Z')).toBe(2025);
  });

  it('keeps a late-December UTC instant in the same year when Madrid is still December', () => {
    // 2025-12-31 22:30 UTC = 2025-12-31 23:30 Madrid → fiscal year 2025
    expect(fiscalYearOf('2025-12-31T22:30:00Z')).toBe(2025);
  });

  it('returns the plain year for a mid-year instant', () => {
    expect(fiscalYearOf('2025-06-15T10:00:00Z')).toBe(2025);
    expect(fiscalYearOf(new Date('2025-08-14T05:56:09Z'))).toBe(2025);
  });
});

describe('madridYearStartUtc', () => {
  it('returns the UTC instant of Madrid 1 Jan 00:00 (23:00 UTC the prior day, CET)', () => {
    expect(madridYearStartUtc(2025).toISOString()).toBe('2024-12-31T23:00:00.000Z');
  });

  it('round-trips: madridYearStartUtc(Y) is the first instant of fiscal year Y', () => {
    const start = madridYearStartUtc(2026);
    expect(fiscalYearOf(start)).toBe(2026);
    // one millisecond earlier still belongs to the previous fiscal year
    expect(fiscalYearOf(new Date(start.getTime() - 1))).toBe(2025);
  });
});
