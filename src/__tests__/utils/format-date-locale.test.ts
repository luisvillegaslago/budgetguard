/**
 * Unit Tests: formatDate with locale parameter
 * Tests the new locale-aware date formatting
 */

import { formatDate } from '@/utils/helpers';

describe('formatDate with locale', () => {
  const testDate = '2026-03-09';

  it('should default to es-ES locale', () => {
    const result = formatDate(testDate, 'long');
    expect(result).toContain('2026');
    // Spanish month name
    expect(result.toLowerCase()).toContain('marzo');
  });

  it('should format in English when locale is en-GB', () => {
    const result = formatDate(testDate, 'long', 'en-GB');
    expect(result).toContain('2026');
    expect(result.toLowerCase()).toContain('march');
  });

  it('should format short dates with locale', () => {
    const esResult = formatDate(testDate, 'short', 'es-ES');
    const enResult = formatDate(testDate, 'short', 'en-GB');
    // Both should contain 9 (day)
    expect(esResult).toContain('9');
    expect(enResult).toContain('9');
    // Different month abbreviations
    expect(esResult.toLowerCase()).toContain('mar');
    expect(enResult.toLowerCase()).toContain('mar'); // March abbreviation same in both
  });

  it('should format month view with locale', () => {
    const esResult = formatDate(testDate, 'month', 'es-ES');
    const enResult = formatDate(testDate, 'month', 'en-GB');
    expect(esResult.toLowerCase()).toContain('marzo');
    expect(enResult.toLowerCase()).toContain('march');
  });

  it('should handle Date objects', () => {
    const date = new Date('2026-03-09T00:00:00Z');
    const result = formatDate(date, 'long', 'en-GB');
    expect(result.toLowerCase()).toContain('march');
    expect(result).toContain('2026');
  });

  it('should use UTC timezone to avoid date shifts', () => {
    // Midnight UTC date — without UTC, timezone could shift to previous day
    const result = formatDate('2026-01-01', 'long', 'en-GB');
    expect(result).toContain('1');
    expect(result.toLowerCase()).toContain('january');
  });
});
