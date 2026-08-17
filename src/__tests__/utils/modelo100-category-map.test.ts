/**
 * Unit Tests: Modelo 100 Casilla Constants
 *
 * The codes are checked against what AEAT actually sums, not against each other: a test that
 * restates the constant proves nothing about whether the box exists.
 *
 * "What AEAT sums" has two sources, and needing both is the lesson. The ranges below come from
 * the official form of ejercicio 2023 (ANEXO I, BOE-A-2024-5721). That form has no 0196 — and a
 * filed Renta of ejercicio 2025 does, as "Regularización cuotas RETA", summed into its casilla
 * 218. Trusting the older form alone once led to deleting a box that exists.
 *
 * So: an older form proves what existed then, never what exists now. When a campaign adds a box,
 * add it here with the filed declaration as the evidence.
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
  [196, 196], // Added after the 2023 form; evidenced by the filed Renta 2025
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

  it('does not contain 0197 — it is in none of the summed ranges', () => {
    expect(codes).not.toContain('0197');
  });

  it('keys match their code', () => {
    Object.entries(MODELO_100_CASILLA).forEach(([key, code]) => {
      expect(key).toBe(`C${code}`);
    });
  });

  it('covers the boxes the user has filed', () => {
    // Present in the filed Rentas 2021-2025, so they must never be dropped. 0196 is here
    // precisely because it was dropped once, on the authority of an older form that predates it.
    ['0186', '0193', '0194', '0196', '0198', '0199', '0200', '0202', '0208', '0217'].forEach((code) => {
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
