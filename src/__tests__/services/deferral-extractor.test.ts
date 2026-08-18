/**
 * DeferralExtractor — the parts that do not need the vision API.
 *
 * The reader itself is exercised against the real resolution PDFs by hand; what is pinned here is
 * everything around it that decides what a read means: the period the letter never prints, and the
 * schema that stands between a model's answer and a booked instalment.
 */

import { MODELO_TYPE } from '@/constants/finance';
import { ExtractedDeferralRawSchema } from '@/schemas/deferral';
import { deriveDeferralPeriod } from '@/services/ocr/DeferralExtractor';

/** A complete, well-formed reading of the 1T 2026 letter, used as the base for the schema cases. */
const VALID_EXTRACTION = {
  expedienteNumber: '282640432002C',
  liquidacionNumber: 'A2861626530066513',
  concepto: 'I.R.P.F. FRACCIONAMIENTOS PAGOS PROFESIONALES-EMPRESARIOS',
  modeloType: MODELO_TYPE.M130,
  interestStartDate: '2026-04-20',
  interestRatePercent: 4.062,
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
  confidence: 0.95,
};

describe('deriveDeferralPeriod', () => {
  // The resolution prints no ejercicio and no periodo. What it does print is the last day of the
  // voluntary period, and that is what identifies the modelo being deferred.
  it('reads the quarter off the month the voluntary period closed', () => {
    expect(deriveDeferralPeriod(MODELO_TYPE.M130, '2026-04-20')).toEqual({ fiscalYear: 2026, fiscalQuarter: 1 });
    expect(deriveDeferralPeriod(MODELO_TYPE.M130, '2026-07-20')).toEqual({ fiscalYear: 2026, fiscalQuarter: 2 });
    expect(deriveDeferralPeriod(MODELO_TYPE.M303, '2026-10-20')).toEqual({ fiscalYear: 2026, fiscalQuarter: 3 });
  });

  it('books a January deadline against the previous year, which is the 4T it settles', () => {
    expect(deriveDeferralPeriod(MODELO_TYPE.M130, '2026-01-20')).toEqual({ fiscalYear: 2025, fiscalQuarter: 4 });
  });

  it('holds when AEAT moves the deadline off the 20th', () => {
    // 20-07-2025 fell on a Sunday; the 2T 2025 letter prints 22-07-2025
    expect(deriveDeferralPeriod(MODELO_TYPE.M130, '2025-07-22')).toEqual({ fiscalYear: 2025, fiscalQuarter: 2 });
  });

  it('gives the annual modelos no quarter and the year they declare', () => {
    expect(deriveDeferralPeriod(MODELO_TYPE.M100, '2026-06-30')).toEqual({ fiscalYear: 2025, fiscalQuarter: null });
    expect(deriveDeferralPeriod(MODELO_TYPE.M390, '2026-01-30')).toEqual({ fiscalYear: 2025, fiscalQuarter: null });
  });

  it('refuses to guess rather than inventing a period', () => {
    // A quarterly deadline never falls in March: the date was misread, or this is not what we think
    expect(deriveDeferralPeriod(MODELO_TYPE.M130, '2026-03-05')).toEqual({ fiscalYear: null, fiscalQuarter: null });
    expect(deriveDeferralPeriod(null, '2026-07-20')).toEqual({ fiscalYear: null, fiscalQuarter: null });
    expect(deriveDeferralPeriod(MODELO_TYPE.M130, null)).toEqual({ fiscalYear: null, fiscalQuarter: null });
  });
});

describe('ExtractedDeferralRawSchema', () => {
  it('accepts a clean reading unchanged', () => {
    const parsed = ExtractedDeferralRawSchema.parse(VALID_EXTRACTION);
    expect(parsed.principalCents).toBe(195671);
    expect(parsed.fracciones).toHaveLength(4);
    // The remainder AEAT loads onto the last fracción survives the round trip
    expect(parsed.fracciones[3]?.principalCents).toBe(48920);
  });

  it('rejects euros arriving where cents are expected', () => {
    const asEuros = { ...VALID_EXTRACTION, principalCents: 1956.71 };
    expect(ExtractedDeferralRawSchema.safeParse(asEuros).success).toBe(false);
  });

  it('rejects a Spanish-formatted string instead of coercing it', () => {
    // "1.956,71" through z.coerce would become 1 cent, or 195671 would become "195671" silently
    const asString = { ...VALID_EXTRACTION, principalCents: '1.956,71' };
    expect(ExtractedDeferralRawSchema.safeParse(asString).success).toBe(false);
  });

  it('rejects an interest rate that took the printed dot for a thousands separator', () => {
    // The letter prints "4.062"; a reader that returns 4062 has misread it as four thousand
    const asThousands = { ...VALID_EXTRACTION, interestRatePercent: 4062 };
    expect(ExtractedDeferralRawSchema.safeParse(asThousands).success).toBe(false);
  });

  it('keeps a zero recargo and a zero interés as the real values they are', () => {
    const withZeroInterest = {
      ...VALID_EXTRACTION,
      fracciones: [{ ...VALID_EXTRACTION.fracciones[0], interestCents: 0, totalCents: 48917 }],
      principalCents: 48917,
      interestCents: 0,
    };
    const parsed = ExtractedDeferralRawSchema.parse(withZeroInterest);
    expect(parsed.fracciones[0]?.interestCents).toBe(0);
    expect(parsed.fracciones[0]?.surchargeCents).toBe(0);
    expect(parsed.interestCents).toBe(0);
  });

  it('keeps a recargo de apremio as its own part, never folded into the principal', () => {
    // Sixth fracción of the 2T 2025 letter (282540627253E), requested in período ejecutivo:
    // 0,01 EUR of principal carrying the whole 416,24 EUR recargo, and 0,00 EUR of interest
    // because the recargo is not part of the base de cálculo. Its "Importe total deuda (1+2)"
    // column reads 416,25 — reading that as the principal loses a non-deductible 416,24.
    const withSurcharge = {
      ...VALID_EXTRACTION,
      principalCents: 1,
      surchargeCents: 41624,
      interestCents: 0,
      fracciones: [
        {
          fraccionNumber: 1,
          principalCents: 1,
          surchargeCents: 41624,
          interestCents: 0,
          totalCents: 41625,
          dueDate: '2026-04-20',
        },
      ],
    };
    const parsed = ExtractedDeferralRawSchema.parse(withSurcharge);
    expect(parsed.fracciones[0]?.principalCents).toBe(1);
    expect(parsed.fracciones[0]?.surchargeCents).toBe(41624);
    expect(parsed.surchargeCents).toBe(41624);
  });

  it('lets a letter that does not add up through, for the verification to report', () => {
    // Rejecting it here would show the user nothing to correct; the arithmetic gate is
    // CreateDeferralSchema, at the point where the deferral is about to be stored
    const short = { ...VALID_EXTRACTION, principalCents: 195670 };
    expect(ExtractedDeferralRawSchema.safeParse(short).success).toBe(true);
  });

  it('normalises an unreadable header field to null instead of dropping it', () => {
    const partial = { ...VALID_EXTRACTION, liquidacionNumber: undefined, expedienteNumber: null };
    const parsed = ExtractedDeferralRawSchema.parse(partial);
    expect(parsed.liquidacionNumber).toBeNull();
    expect(parsed.expedienteNumber).toBeNull();
  });

  it('fails an incomplete fracción row: half a row is a misread table, not a gap', () => {
    const missingDueDate = {
      ...VALID_EXTRACTION,
      fracciones: [{ ...VALID_EXTRACTION.fracciones[0], dueDate: null }],
    };
    expect(ExtractedDeferralRawSchema.safeParse(missingDueDate).success).toBe(false);
  });

  it('rejects a due date that is not ISO', () => {
    const spanishDate = {
      ...VALID_EXTRACTION,
      fracciones: [{ ...VALID_EXTRACTION.fracciones[0], dueDate: '22-06-2026' }],
    };
    expect(ExtractedDeferralRawSchema.safeParse(spanishDate).success).toBe(false);
  });
});
