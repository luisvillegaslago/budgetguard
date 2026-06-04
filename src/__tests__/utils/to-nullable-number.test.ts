/**
 * Unit Tests: toNullableNumber
 * react-hook-form setValueAs helper that maps empty/invalid number inputs to
 * null (instead of NaN, which would fail z.number() validation).
 */

import { toNullableNumber } from '@/utils/helpers';

describe('toNullableNumber', () => {
  it('maps empty string to null', () => {
    expect(toNullableNumber('')).toBeNull();
  });

  it('maps null and undefined to null', () => {
    expect(toNullableNumber(null)).toBeNull();
    expect(toNullableNumber(undefined)).toBeNull();
  });

  it('maps non-numeric input to null', () => {
    expect(toNullableNumber('abc')).toBeNull();
  });

  it('parses numeric strings', () => {
    expect(toNullableNumber('15')).toBe(15);
    expect(toNullableNumber('0')).toBe(0);
    expect(toNullableNumber('12.5')).toBe(12.5);
  });

  it('passes through numbers', () => {
    expect(toNullableNumber(42)).toBe(42);
    expect(toNullableNumber(0)).toBe(0);
  });

  it('maps NaN to null', () => {
    expect(toNullableNumber(Number.NaN)).toBeNull();
  });
});
