/**
 * Unit Tests: deferral verification
 *
 * The fixtures are the three real "RESOLUCIÓN DE APLAZAMIENTO/FRACCIONAMIENTO" letters AEAT sent
 * for the Modelo 130 of 2T 2025, 1T 2026 and 2T 2026, transcribed row by row from ANEXO I and
 * cross-checked against the días and bases printed in ANEXO II.
 *
 * What is being protected: of a deferral, only the intereses de demora are deductible, and as a
 * gasto financiero (casilla 0203, DGT V4080-15 and STS 150/2021). Booking the fracción whole is
 * what once left 95 € of interest undeducted for two years. Splitting it correctly is only safe if
 * the reading of the letter has been checked first, which is what this module does.
 *
 * Note the two traps the fixtures carry: AEAT loads the rounding remainder onto the LAST fracción
 * (781,66 ×5 then 781,69), and the recargo de apremio is a column of its own that never accrues
 * interest — letter 282540627253E has 416,24 € of it.
 */

import { DEFERRAL_CHECK } from '@/constants/finance';
import type { DeferralFraccion } from '@/types/finance';
import {
  accruedInterestCents,
  deferralTotals,
  interestAccrualEndDate,
  type VerifiableDeferral,
  verifyDeferral,
} from '@/utils/deferral';

/** Tipo de interés de demora as AEAT prints it. The tipo actually applied is 4,0625 %. */
const PRINTED_RATE = 4.062;

/**
 * 282640560363H — Modelo 130 2T 2026, six fracciones, no recargo.
 * Fecha de Intereses 20-07-2026; ANEXO II accrues from 21-07-2026 over 62/92/123/153/184/215 days.
 * The sixth fracción carries the remainder of both columns: 781,69 of principal and 18,71 of
 * interest, where its own days work out to 18,70.
 */
const LETTER_2T_2026: VerifiableDeferral = {
  interestStartDate: '2026-07-20',
  interestRatePercent: PRINTED_RATE,
  principalCents: 468999,
  surchargeCents: 0,
  interestCents: 7212,
  fracciones: [
    {
      fraccionNumber: 1,
      principalCents: 78166,
      surchargeCents: 0,
      interestCents: 539,
      totalCents: 78705,
      dueDate: '2026-09-21',
    },
    {
      fraccionNumber: 2,
      principalCents: 78166,
      surchargeCents: 0,
      interestCents: 800,
      totalCents: 78966,
      dueDate: '2026-10-20',
    },
    {
      fraccionNumber: 3,
      principalCents: 78166,
      surchargeCents: 0,
      interestCents: 1070,
      totalCents: 79236,
      dueDate: '2026-11-20',
    },
    {
      fraccionNumber: 4,
      principalCents: 78166,
      surchargeCents: 0,
      interestCents: 1331,
      totalCents: 79497,
      dueDate: '2026-12-21',
    },
    {
      fraccionNumber: 5,
      principalCents: 78166,
      surchargeCents: 0,
      interestCents: 1601,
      totalCents: 79767,
      dueDate: '2027-01-20',
    },
    {
      fraccionNumber: 6,
      principalCents: 78169,
      surchargeCents: 0,
      interestCents: 1871,
      totalCents: 80040,
      dueDate: '2027-02-22',
    },
  ],
};

/**
 * 282640432002C — Modelo 130 1T 2026, four fracciones, no recargo.
 * Fecha de Intereses 20-04-2026; ANEXO II accrues from 21-04-2026 over 61/91/122/153 days.
 * Two of its vencimientos are printed shifted off a día inhábil: 22-06-2026 and 21-09-2026.
 */
const LETTER_1T_2026: VerifiableDeferral = {
  interestStartDate: '2026-04-20',
  interestRatePercent: PRINTED_RATE,
  principalCents: 195671,
  surchargeCents: 0,
  interestCents: 2324,
  fracciones: [
    {
      fraccionNumber: 1,
      principalCents: 48917,
      surchargeCents: 0,
      interestCents: 332,
      totalCents: 49249,
      dueDate: '2026-06-22',
    },
    {
      fraccionNumber: 2,
      principalCents: 48917,
      surchargeCents: 0,
      interestCents: 495,
      totalCents: 49412,
      dueDate: '2026-07-20',
    },
    {
      fraccionNumber: 3,
      principalCents: 48917,
      surchargeCents: 0,
      interestCents: 664,
      totalCents: 49581,
      dueDate: '2026-08-20',
    },
    {
      fraccionNumber: 4,
      principalCents: 48920,
      surchargeCents: 0,
      interestCents: 833,
      totalCents: 49753,
      dueDate: '2026-09-21',
    },
  ],
};

/**
 * 282540627253E — Modelo 130 2T 2025, six fracciones, and the one with a recargo de apremio.
 * Principal 2.081,21 + recargo 416,24 = 2.497,45 de deuda. The sixth fracción is the recargo
 * itself, over a single cent of principal, and it liquidates 0,00 € of interest across 272 days
 * because the base de cálculo excludes the recargo del período ejecutivo.
 */
const LETTER_2T_2025: VerifiableDeferral = {
  interestStartDate: '2025-07-22',
  interestRatePercent: PRINTED_RATE,
  principalCents: 208121,
  surchargeCents: 41624,
  interestCents: 4208,
  fracciones: [
    {
      fraccionNumber: 1,
      principalCents: 41624,
      surchargeCents: 0,
      interestCents: 561,
      totalCents: 42185,
      dueDate: '2025-11-20',
    },
    {
      fraccionNumber: 2,
      principalCents: 41624,
      surchargeCents: 0,
      interestCents: 700,
      totalCents: 42324,
      dueDate: '2025-12-22',
    },
    {
      fraccionNumber: 3,
      principalCents: 41624,
      surchargeCents: 0,
      interestCents: 843,
      totalCents: 42467,
      dueDate: '2026-01-20',
    },
    {
      fraccionNumber: 4,
      principalCents: 41624,
      surchargeCents: 0,
      interestCents: 987,
      totalCents: 42611,
      dueDate: '2026-02-20',
    },
    {
      fraccionNumber: 5,
      principalCents: 41624,
      surchargeCents: 0,
      interestCents: 1117,
      totalCents: 42741,
      dueDate: '2026-03-20',
    },
    {
      fraccionNumber: 6,
      principalCents: 1,
      surchargeCents: 41624,
      interestCents: 0,
      totalCents: 41625,
      dueDate: '2026-04-20',
    },
  ],
};

const REAL_LETTERS: ReadonlyArray<readonly [string, VerifiableDeferral]> = [
  ['282640560363H (2T 2026)', LETTER_2T_2026],
  ['282640432002C (1T 2026)', LETTER_1T_2026],
  ['282540627253E (2T 2025)', LETTER_2T_2025],
];

/** A copy of a letter with one row rewritten — how a misread digit is simulated. */
function withFraccion(
  letter: VerifiableDeferral,
  fraccionNumber: number,
  patch: Partial<DeferralFraccion>,
): VerifiableDeferral {
  return {
    ...letter,
    fracciones: letter.fracciones.map((fraccion) =>
      fraccion.fraccionNumber === fraccionNumber ? { ...fraccion, ...patch } : fraccion,
    ),
  };
}

describe('deferral verification', () => {
  describe('the three real resolutions', () => {
    REAL_LETTERS.forEach(([name, letter]) => {
      it(`should verify ${name} clean`, () => {
        expect(verifyDeferral(letter)).toMatchObject({ isValid: true, issues: [] });
      });

      it(`should reconcile the ANEXO I rows of ${name} with its totals row`, () => {
        const { declaredTotals, computedTotals } = verifyDeferral(letter);
        expect(computedTotals).toEqual(declaredTotals);
      });
    });

    it('should reconcile 282640560363H down to the cent AEAT moved onto the last fracción', () => {
      // 781,66 × 5 + 781,69 = 4.689,99 — never 781,66 × 6, which is 4.689,96
      expect(deferralTotals(LETTER_2T_2026.fracciones)).toEqual({
        principalCents: 468999,
        surchargeCents: 0,
        interestCents: 7212,
        totalCents: 476211,
      });
    });

    it('should keep the recargo de apremio of 282540627253E out of the principal', () => {
      const { computedTotals } = verifyDeferral(LETTER_2T_2025);

      expect(computedTotals.principalCents).toBe(208121);
      expect(computedTotals.surchargeCents).toBe(41624);
      // The deuda of the letter, 2.497,45 €, is the two of them together and never a single figure
      expect(computedTotals.principalCents + computedTotals.surchargeCents).toBe(249745);
    });

    it('should accept the fracción that is pure recargo and accrues no interest', () => {
      const recargoFraccion = LETTER_2T_2025.fracciones[5]!;

      expect(recargoFraccion).toMatchObject({ surchargeCents: 41624, interestCents: 0 });
      expect(verifyDeferral(LETTER_2T_2025).isValid).toBe(true);
    });
  });

  describe('interest accrual (art. 53 RGR)', () => {
    it('should roll a vencimiento moved off a día inhábil back to its legal day', () => {
      // ANEXO I prints the day the payment is due; ANEXO II accrues to the 5th or the 20th (art. 45.2 RGR)
      expect(interestAccrualEndDate('2026-09-21')).toBe('2026-09-20');
      expect(interestAccrualEndDate('2027-02-22')).toBe('2027-02-20');
      expect(interestAccrualEndDate('2026-06-22')).toBe('2026-06-20');
      expect(interestAccrualEndDate('2025-12-22')).toBe('2025-12-20');
    });

    it('should leave a vencimiento already on its legal day untouched', () => {
      expect(interestAccrualEndDate('2026-10-20')).toBe('2026-10-20');
      expect(interestAccrualEndDate('2026-01-05')).toBe('2026-01-05');
      expect(interestAccrualEndDate('2026-01-08')).toBe('2026-01-05');
    });

    it('should take a vencimiento too far from any legal day at face value', () => {
      // Not a día inhábil shift — a shift is a day or two, never ten
      expect(interestAccrualEndDate('2026-01-15')).toBe('2026-01-15');
      expect(interestAccrualEndDate('2026-01-03')).toBe('2026-01-03');
    });

    it('should reproduce the intereses of ANEXO I from the días of ANEXO II', () => {
      // 782,66 € at 4,062 % over 62, 92, 123, 153 and 184 days — the growing instalments
      expect(accruedInterestCents(78166, PRINTED_RATE, 62)).toBe(539);
      expect(accruedInterestCents(78166, PRINTED_RATE, 92)).toBe(800);
      expect(accruedInterestCents(78166, PRINTED_RATE, 123)).toBe(1070);
      expect(accruedInterestCents(78166, PRINTED_RATE, 153)).toBe(1331);
      expect(accruedInterestCents(78166, PRINTED_RATE, 184)).toBe(1601);
    });

    it('should land a cent low where the printed tipo is a truncation of 4,0625 %', () => {
      // The letter prints 18,71; the row recomputed at the printed 4,062 gives 18,70, and at the
      // real 4,0625 gives 18,7057. This one cent is the whole reason the accrual check has a band.
      expect(accruedInterestCents(78169, PRINTED_RATE, 215)).toBe(1870);
      expect(accruedInterestCents(78169, 4.0625, 215)).toBe(1871);
      expect(verifyDeferral(LETTER_2T_2026).isValid).toBe(true);
    });
  });

  describe('a fracción whose parts do not add up', () => {
    // 789,66 read as 789,60: the row's own total no longer matches its three columns
    const misread = withFraccion(LETTER_2T_2026, 2, { totalCents: 78960 });

    it('should report the row and by how much', () => {
      expect(verifyDeferral(misread).issues).toEqual([
        {
          check: DEFERRAL_CHECK.FRACCION_TOTAL,
          fraccionNumber: 2,
          expected: 78960,
          actual: 78966,
          difference: 6,
        },
      ]);
    });

    it('should not let the column totals absorb it', () => {
      // The parts still add to the totals row: only the printed total of the row disagrees
      const { declaredTotals, computedTotals } = verifyDeferral(misread);
      expect(computedTotals).toEqual(declaredTotals);
    });
  });

  describe('a totals row that does not match its fracciones', () => {
    it('should report the column and the difference', () => {
      // 72,12 € of interest read as 72,02 €
      const misread: VerifiableDeferral = { ...LETTER_2T_2026, interestCents: 7202 };

      expect(verifyDeferral(misread).issues).toEqual([
        {
          check: DEFERRAL_CHECK.INTEREST_TOTAL,
          fraccionNumber: null,
          expected: 7202,
          actual: 7212,
          difference: 10,
        },
      ]);
    });

    it('should trip both the row and the column when a single digit is misread', () => {
      // 781,66 read as 781,69 in the third fracción
      const misread = withFraccion(LETTER_2T_2026, 3, { principalCents: 78169 });
      const checks = verifyDeferral(misread).issues.map((found) => found.check);

      expect(checks).toEqual([DEFERRAL_CHECK.FRACCION_TOTAL, DEFERRAL_CHECK.PRINCIPAL_TOTAL]);
    });

    it('should treat a totals row that could not be read as a disagreement, not a free pass', () => {
      const unread: VerifiableDeferral = { ...LETTER_2T_2026, principalCents: null };
      const verdict = verifyDeferral(unread);

      expect(verdict.isValid).toBe(false);
      expect(verdict.issues).toEqual([
        {
          check: DEFERRAL_CHECK.PRINCIPAL_TOTAL,
          fraccionNumber: null,
          expected: 0,
          actual: 468999,
          difference: 468999,
        },
      ]);
    });
  });

  describe('an interés inconsistent with its day count', () => {
    it('should catch a letter that adds up perfectly and is still wrong', () => {
      // 4,95 € read as 5,95 €, with the row total and the totals row moved to match it. Every
      // self-consistency check passes; only art. 53 RGR knows 91 days of 489,17 € is 4,95 €.
      const consistentButWrong: VerifiableDeferral = {
        ...withFraccion(LETTER_1T_2026, 2, { interestCents: 595, totalCents: 49512 }),
        interestCents: 2424,
      };

      expect(verifyDeferral(consistentButWrong).issues).toEqual([
        {
          check: DEFERRAL_CHECK.INTEREST_ACCRUAL,
          fraccionNumber: 2,
          expected: 595,
          actual: 495,
          difference: -100,
        },
      ]);
    });

    it('should report a three-cent disagreement rather than round it away', () => {
      // 18,71 € read as 18,74 €. Small enough to be a rounding and it is not: it is shown.
      const consistentButWrong: VerifiableDeferral = {
        ...withFraccion(LETTER_2T_2026, 6, { interestCents: 1874, totalCents: 80043 }),
        interestCents: 7215,
      };

      expect(verifyDeferral(consistentButWrong).issues).toEqual([
        {
          check: DEFERRAL_CHECK.INTEREST_ACCRUAL,
          fraccionNumber: 6,
          expected: 1874,
          actual: 1870,
          difference: -4,
        },
      ]);
    });

    it('should stay silent when there is no tipo to recompute from', () => {
      const noRate: VerifiableDeferral = { ...LETTER_2T_2026, interestRatePercent: null };
      expect(verifyDeferral(noRate).issues).toEqual([]);
    });

    it('should stay silent when the fecha de intereses could not be read', () => {
      const noStart: VerifiableDeferral = { ...LETTER_2T_2026, interestStartDate: null };
      expect(verifyDeferral(noStart).issues).toEqual([]);
    });
  });

  describe('vencimientos out of order', () => {
    it('should report a fracción falling due before the one before it', () => {
      // The fourth vencimiento read as 20-10-2026, a month before the third
      const misread = withFraccion(LETTER_2T_2026, 4, { dueDate: '2026-10-20' });
      const issues = verifyDeferral(misread).issues;

      expect(issues).toContainEqual({
        check: DEFERRAL_CHECK.DUE_DATE_ORDER,
        fraccionNumber: 4,
        expected: 1,
        actual: -31,
        difference: -32,
      });
      // And the interés of that fracción no longer belongs to its span, so it shows up twice
      expect(issues.map((found) => found.check)).toContain(DEFERRAL_CHECK.INTEREST_ACCRUAL);
    });

    it('should report a first vencimiento that does not clear the fecha de intereses', () => {
      const misread = withFraccion(LETTER_1T_2026, 1, { dueDate: '2026-04-20' });

      expect(verifyDeferral(misread).issues).toEqual([
        {
          check: DEFERRAL_CHECK.DUE_DATE_ORDER,
          fraccionNumber: 1,
          expected: 1,
          actual: 0,
          difference: -1,
        },
      ]);
    });
  });

  describe('fracciones that were not read as a run', () => {
    it('should report a table that could not be read at all', () => {
      const empty: VerifiableDeferral = { ...LETTER_2T_2026, fracciones: [] };
      const verdict = verifyDeferral(empty);

      expect(verdict.issues[0]).toEqual({
        check: DEFERRAL_CHECK.FRACCION_SEQUENCE,
        fraccionNumber: null,
        expected: 1,
        actual: 0,
        difference: -1,
      });
    });

    it('should report a gap in the numbering', () => {
      const skipped = withFraccion(LETTER_1T_2026, 2, { fraccionNumber: 3 });

      expect(verifyDeferral(skipped).issues).toContainEqual({
        check: DEFERRAL_CHECK.FRACCION_SEQUENCE,
        fraccionNumber: 2,
        expected: 2,
        actual: 3,
        difference: 1,
      });
    });
  });

  describe('the verdict itself', () => {
    it('should expose both sets of totals so the human can see what disagrees', () => {
      const misread: VerifiableDeferral = { ...LETTER_2T_2025, surchargeCents: 41620 };
      const verdict = verifyDeferral(misread);

      expect(verdict.isValid).toBe(false);
      expect(verdict.declaredTotals).toEqual({
        principalCents: 208121,
        surchargeCents: 41620,
        interestCents: 4208,
        totalCents: 253949,
      });
      expect(verdict.computedTotals).toEqual({
        principalCents: 208121,
        surchargeCents: 41624,
        interestCents: 4208,
        totalCents: 253953,
      });
    });
  });
});
