/**
 * Unit Tests: money utilities
 *
 * Focus on parseInputToCents, the input boundary where a user-typed (or
 * app-formatted) string becomes integer cents. A thousands separator used to
 * be silently swallowed: "1.234,56" parsed as 123 cents instead of 123456.
 */

import { formatCurrency, parseInputToCents } from '@/utils/money';

describe('parseInputToCents', () => {
  describe('plain decimal input', () => {
    it('should parse a comma as decimal separator', () => {
      expect(parseInputToCents('419,28')).toBe(41928);
    });

    it('should parse a period as decimal separator', () => {
      expect(parseInputToCents('419.28')).toBe(41928);
    });

    it('should parse an integer amount', () => {
      expect(parseInputToCents('420')).toBe(42000);
    });

    it('should parse a negative amount', () => {
      expect(parseInputToCents('-419,28')).toBe(-41928);
    });
  });

  describe('thousands separator', () => {
    it('should parse Spanish grouping with comma decimals', () => {
      expect(parseInputToCents('1.234,56')).toBe(123456);
    });

    it('should parse English grouping with period decimals', () => {
      expect(parseInputToCents('1,234.56')).toBe(123456);
    });

    it('should parse several grouping separators', () => {
      expect(parseInputToCents('1.234.567,89')).toBe(123456789);
    });

    it('should parse a grouped amount with a currency symbol and spaces', () => {
      expect(parseInputToCents('12.500,00 €')).toBe(1250000);
    });

    it('should read a lone three-digit tail as grouping, not as decimals', () => {
      // Money carries two decimals: "1.234" is 1.234,00 EUR in es-ES and 1234 in en-US,
      // never 1,23 EUR. Both conventions agree, so there is nothing ambiguous to preserve.
      expect(parseInputToCents('1.234')).toBe(123400);
      expect(parseInputToCents('1,234')).toBe(123400);
      expect(parseInputToCents('-1.234')).toBe(-123400);
    });

    it('should still read a one- or two-digit tail as decimals', () => {
      expect(parseInputToCents('1.2')).toBe(120);
      expect(parseInputToCents('1,23')).toBe(123);
    });
  });

  describe('round trip with formatCurrency', () => {
    it('should re-parse its own formatted output without the symbol', () => {
      expect(parseInputToCents(formatCurrency(1250000, false))).toBe(1250000);
    });

    it('should re-parse its own formatted output with the symbol', () => {
      expect(parseInputToCents(formatCurrency(1250000))).toBe(1250000);
    });

    it('should re-parse a negative formatted amount', () => {
      expect(parseInputToCents(formatCurrency(-123456))).toBe(-123456);
    });
  });

  describe('invalid input', () => {
    it('should return null for an empty string', () => {
      expect(parseInputToCents('')).toBeNull();
    });

    it('should return null for whitespace only', () => {
      expect(parseInputToCents('   ')).toBeNull();
    });

    it('should return null for non-numeric text', () => {
      expect(parseInputToCents('abc')).toBeNull();
    });
  });
});
