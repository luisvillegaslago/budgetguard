/**
 * Unit Tests: Modelo 100 Casilla Constants
 *
 * The codes are checked against the official form (ANEXO I, BOE-A-2024-5721) rather than against
 * each other. An earlier version of this suite asserted a casilla 0196 that does not exist on the
 * form, which is how it survived: a test that only restates the constant cannot catch an invented
 * box. The membership check below is what actually rules one out.
 */

import { MODELO_100_CASILLA, MODELO_100_CASILLA_OPTIONS, MODELO_100_DEFAULT_CASILLA } from '@/constants/finance';
import en from '@/messages/en.json';
import es from '@/messages/es.json';

/**
 * Casilla 218 is defined on the form as:
 *   Suma ([0181] a [0195] + [0198] a [0200] + [0202] + [0203] + [0205] + [0206] + [0208] +
 *         [0227] + [0214] a [0217])
 * A code outside every one of these ranges is not a deductible-expense box, so nothing assigned
 * to it would ever reach the total.
 */
const CASILLA_218_RANGES: ReadonlyArray<readonly [number, number]> = [
  [181, 195],
  [198, 200],
  [202, 203],
  [205, 206],
  [208, 208],
  [214, 217],
  [227, 227],
];

const isSummedByCasilla218 = (code: string): boolean =>
  CASILLA_218_RANGES.some(([from, to]) => Number(code) >= from && Number(code) <= to);

describe('MODELO_100_CASILLA', () => {
  const codes = Object.values(MODELO_100_CASILLA);

  it('only contains boxes that casilla 218 actually sums', () => {
    const orphans = codes.filter((code) => !isSummedByCasilla218(code));
    expect(orphans).toEqual([]);
  });

  it('does not contain 0196 or 0197 — neither exists on the form', () => {
    expect(codes).not.toContain('0196');
    expect(codes).not.toContain('0197');
  });

  it('keys match their code', () => {
    Object.entries(MODELO_100_CASILLA).forEach(([key, code]) => {
      expect(key).toBe(`C${code}`);
    });
  });

  it('covers the boxes the user has filed', () => {
    // Present in the filed Rentas 2021-2024, so they must never be dropped
    ['0186', '0193', '0194', '0198', '0199', '0200', '0202', '0208', '0217'].forEach((code) => {
      expect(codes).toContain(code);
    });
  });

  it('has a label in both locales for every code', () => {
    codes.forEach((code) => {
      expect(es.fiscal.modelo100).toHaveProperty(`casilla${code}`);
      expect(en.fiscal.modelo100).toHaveProperty(`casilla${code}`);
    });
  });
});

describe('MODELO_100_CASILLA_OPTIONS', () => {
  it('only offers valid casillas', () => {
    const codes: string[] = Object.values(MODELO_100_CASILLA);
    MODELO_100_CASILLA_OPTIONS.forEach((option) => {
      expect(codes).toContain(option);
    });
  });

  it('has no duplicates', () => {
    expect(new Set(MODELO_100_CASILLA_OPTIONS).size).toBe(MODELO_100_CASILLA_OPTIONS.length);
  });

  it('offers the fallback, so a category can be set to it explicitly', () => {
    expect(MODELO_100_CASILLA_OPTIONS).toContain(MODELO_100_DEFAULT_CASILLA);
  });
});

describe('MODELO_100_DEFAULT_CASILLA', () => {
  it('should default to 0202 (Otros servicios exteriores)', () => {
    expect(MODELO_100_DEFAULT_CASILLA).toBe(MODELO_100_CASILLA.C0202);
  });
});
