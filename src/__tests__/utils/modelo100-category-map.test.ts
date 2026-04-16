/**
 * Unit Tests: Modelo 100 Casilla Constants
 * Validates that AEAT casilla codes and default fallback are correctly defined.
 */

import { MODELO_100_CASILLA, MODELO_100_DEFAULT_CASILLA } from '@/constants/finance';

describe('MODELO_100_CASILLA', () => {
  it('should define all expected casilla codes', () => {
    expect(MODELO_100_CASILLA.C0186).toBe('0186');
    expect(MODELO_100_CASILLA.C0194).toBe('0194');
    expect(MODELO_100_CASILLA.C0196).toBe('0196');
    expect(MODELO_100_CASILLA.C0202).toBe('0202');
    expect(MODELO_100_CASILLA.C0217).toBe('0217');
  });

  it('should have 5 casilla codes', () => {
    expect(Object.keys(MODELO_100_CASILLA)).toHaveLength(5);
  });
});

describe('MODELO_100_DEFAULT_CASILLA', () => {
  it('should default to 0202 (Otros servicios exteriores)', () => {
    expect(MODELO_100_DEFAULT_CASILLA).toBe(MODELO_100_CASILLA.C0202);
  });
});
