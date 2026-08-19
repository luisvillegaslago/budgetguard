/**
 * Deferral (aplazamiento/fraccionamiento) Extraction Service
 *
 * Reads an AEAT "RESOLUCIÓN DE APLAZAMIENTO/FRACCIONAMIENTO" with Anthropic Vision and returns the
 * header of the resolution plus every row of its ANEXO I, so the instalments can be booked split
 * into principal / recargo / intereses instead of whole. Only the intereses de demora are a
 * deductible expense, and as a financial one (casilla 0203, DGT V4080-15 and STS 150/2021).
 *
 * **Vision, not a PDF text layer.** These letters do have a real text layer, but it prints each
 * AEAT label two lines away from its own value — the header of ANEXO I comes out as "Importe
 * principal / Recargo de / Importe total / Importe de los / Importe total del", with the six
 * numbers of a row arriving as a bare run of digits some distance later. Reading that has already
 * produced a misreading in this project. Vision reads the RENDERED page, where each figure sits in
 * its own column, which is why this reuses the existing vision bridge instead of adding a PDF
 * text-extraction dependency.
 *
 * **Nothing here computes an amount.** The reader transcribes ANEXO I, including the totals row,
 * and the two are compared afterwards. AEAT does not keep the principal constant across the
 * fracciones — it loads the rounding remainder onto the last one (781,66 ×5, then 781,69) — so a
 * split derived by dividing the total is wrong by up to a few cents per instalment.
 *
 * **The recargo de apremio is not hypothetical.** The 2T 2025 letter (expediente 282540627253E)
 * was requested in período ejecutivo, and its ANEXO I prints 2.081,21 € of principal against
 * 416,24 € of recargo — the whole recargo falling on a sixth fracción of 0,01 € of principal, which
 * is also why that fracción bears 0,00 € of interest (the recargo is not part of the base de
 * cálculo). Its "Importe total deuda (1+2)" column reads 2.497,45 €, and reading THAT as the
 * principal is precisely how 416,24 € of non-deductible recargo (art. 15.c LIS) disappears into a
 * figure treated as tax paid.
 *
 * **Known limitation:** one deferred modelo per resolution. A letter whose ANEXO I repeats
 * "Número Liquidación" for several debts is still transcribed in full, but comes back with
 * `liquidacionNumber: null` and a capped confidence, for the confirm screen to sort out.
 */

import { FISCAL_QUARTER, type FiscalQuarter, MODELO_TYPE, type ModeloType, VISION_FAILURE } from '@/constants/finance';
import { ExtractedDeferralRawSchema } from '@/schemas/deferral';
import { callVisionJson, VisionApiError } from '@/services/ocr/anthropicVision';
import type { ExtractedDeferralData } from '@/types/finance';

/**
 * Token budget for the answer. One fracción costs roughly 70 tokens of JSON and the live letters
 * carry four and six of them, but AEAT grants longer calendars: a truncated response is invalid
 * JSON, not a partial read, so the ceiling is set well above what any real ANEXO I needs.
 */
const DEFERRAL_MAX_TOKENS = 8192;

/**
 * Confidence ceiling applied when the liquidación number came back empty. That happens either
 * because the letter defers several debts — the prompt has the reader blank the field rather than
 * pick one of them — or because the line could not be read. Both need a human, so neither may
 * present itself as a certain reading.
 */
const UNRESOLVED_LIQUIDACION_CONFIDENCE = 0.5;

const EXTRACTION_PROMPT = `You are reading a Spanish AEAT letter: "CONCESIÓN DEL APLAZAMIENTO/FRACCIONAMIENTO DE PAGO". You are transcribing it, not interpreting it. Do not calculate anything.

Return ONLY a JSON object with these fields:
- expedienteNumber: string | null ("Número de expediente", repeated as "Expediente:" in the page footer, e.g. "282640560363H")
- liquidacionNumber: string | null ("Número Liquidación", printed above the ANEXO I table and in every ANEXO II row, e.g. "A2861626530123900")
- concepto: string | null (the "Concepto:" line of ANEXO I, copied verbatim)
- modeloType: "303" | "130" | "390" | "100" | null (the AEAT form that concepto refers to)
- interestStartDate: string | null ("Fecha de Intereses", as YYYY-MM-DD)
- interestRatePercent: number | null ("Tipo de interés" in ANEXO II)
- principalCents: integer | null (TOTAL GENERAL row of ANEXO I, "Importe principal deuda")
- surchargeCents: integer | null (TOTAL GENERAL row, "Recargo de apremio")
- interestCents: integer | null (TOTAL GENERAL row, "Importe de los intereses")
- fracciones: array, one object per instalment row of ANEXO I, in printed order, each with:
    fraccionNumber: integer, principalCents: integer, surchargeCents: integer,
    interestCents: integer, totalCents: integer, dueDate: "YYYY-MM-DD"
- confidence: number (your confidence in the whole reading, 0.0 to 1.0)

AMOUNTS
- Every amount is printed Spanish-style: "." groups thousands, "," separates decimals. "4.689,99" is four thousand six hundred eighty-nine euros and ninety-nine cents.
- Return every amount as an INTEGER NUMBER OF CENTS: "4.689,99" -> 468999, "781,66" -> 78166, "5,39" -> 539, "0,00" -> 0.
- Never a decimal number, never a string, no "€", no separators. 781.66 would be wrong; 78166 is right.
- Do not add, subtract, average or round anything. Transcribe each cell exactly as it is printed.

THE ONE FIGURE THAT IS NOT AN AMOUNT
- "Tipo de interés" is a percentage, and this letter prints it with a DOT as the decimal mark: "4.062" means 4.062 percent, NOT four thousand and sixty-two. It is the legal interés de demora and is always between 3 and 6.
- Return it as a plain percentage number, e.g. 4.062. Never convert it to cents.

ANEXO I IS THE AUTHORITY FOR THE SPLIT
- ANEXO I ("DEUDAS Y PLAZOS DE LA NOTIFICACIÓN") has one row per fracción, with six columns in this order: "Importe principal deuda (1)" | "Recargo de apremio (2)" | "Importe total deuda (1+2)" | "Importe de los intereses (3)" | "Importe total del plazo (1+2+3)" | "Fecha de vencimiento".
- Map them: principalCents = column (1), surchargeCents = column (2), interestCents = column (3), totalCents = "Importe total del plazo (1+2+3)", dueDate = "Fecha de vencimiento".
- The column "Importe total deuda (1+2)" is NOT requested. Read it, use it to keep your columns aligned, and return it nowhere.
- fraccionNumber is the 1-based position of the row within ANEXO I. The table prints no number column; count the rows.
- ANEXO II ("LIQUIDACIÓN DE INTERESES DE DEMORA") is corroboration only: its "Base de cálculo" repeats each fracción's principal and its "Intereses" repeats each fracción's interest. Use it to confirm what you read in ANEXO I. If the two disagree, return what ANEXO I prints and lower your confidence.

THE ROWS THAT ARE NOT FRACCIONES
- Below the instalments, ANEXO I prints a row of dashes, then a totals row, then a row labelled "TOTAL GENERAL". None of those three is a fracción. Never put them in "fracciones".
- The top-level principalCents / surchargeCents / interestCents are the TOTAL GENERAL row AS PRINTED. Copy those cells. Do not add up the fracciones to produce them: the two are compared afterwards, and a total you calculated yourself would hide a digit you misread.

FOUR THINGS THAT LOOK LIKE MISTAKES AND ARE NOT
1. The LAST fracción's principal is normally a few cents different from all the others: 781,66 five times and then 781,69; 489,17 three times and then 489,20. AEAT loads the rounding remainder onto the final instalment. This is correct. Transcribe it exactly as printed and never "correct" it to match the rest.
2. "Recargo de apremio" is its own column and is very often 0,00 on every row. A printed 0,00 is a real value: return 0, never null, and never fold it into the principal.
3. A fracción whose "Importe de los intereses" is 0,00 exists and is not an error. Return 0 for it.
4. Two fracciones may fall due on dates that are not exactly one month apart (the 20th moves to the 21st or 22nd when it is a weekend or a holiday). Transcribe the date printed.

DATES
- Printed DD-MM-YYYY, returned YYYY-MM-DD: "21-09-2026" -> "2026-09-21".
- "Fecha de Intereses" is printed once, above the ANEXO I table. It is the last day of the periodo voluntario. It is NOT the date the letter was signed (written out in words, e.g. "9 de julio de 2026") and NOT a fecha de vencimiento.

CONCEPTO AND MODELO
- Copy the "Concepto:" line verbatim, then map it to a form:
  "I.R.P.F. FRACCIONAMIENTOS PAGOS PROFESIONALES-EMPRESARIOS" -> "130"
  an I.V.A. autoliquidación / régimen general concepto -> "303"
  an I.V.A. resumen anual concepto -> "390"
  an I.R.P.F. declaración anual / Renta concepto -> "100"
- If the concepto matches none of those, return modeloType: null and lower the confidence. Do not guess.
- Do NOT return a fiscal year or a quarter. The letter does not print them.

WHEN THE LETTER DEFERS MORE THAN ONE DEBT
- ANEXO I may repeat "Número Liquidación" / "Concepto" / "Fecha de Intereses" as separate blocks, one per deferred debt. If it does, still transcribe every instalment row in printed order, but return liquidacionNumber: null and a confidence no higher than 0.5.

- Anything you cannot read: null, or [] for fracciones, and a lower confidence. Never invent a figure and never fill a gap by calculating it.
- Return ONLY valid JSON, no markdown formatting and no explanation.`;

/** The annual modelos carry no quarter; they are filed the year AFTER the one they declare. */
const ANNUAL_MODELOS: readonly ModeloType[] = [MODELO_TYPE.M390, MODELO_TYPE.M100];

/**
 * Month of the "Fecha de Intereses" -> the quarter whose voluntary period it closes, and how far
 * back its fiscal year lies. 4T is filed in January of the following year, hence the -1.
 */
const MONTH_TO_QUARTER: Readonly<Record<number, { readonly quarter: FiscalQuarter; readonly yearOffset: number }>> = {
  1: { quarter: FISCAL_QUARTER.Q4, yearOffset: -1 },
  // A voluntary period ending on a día inhábil runs to the next working day (art. 30.5 Ley
  // 39/2015), and the 4T one closes on 30 January: when that is a weekend the fecha de intereses
  // spills into February. 30-ene-2027 is a Saturday, so this row is not hypothetical — without it
  // a 4T resolution imports with no period at all.
  2: { quarter: FISCAL_QUARTER.Q4, yearOffset: -1 },
  4: { quarter: FISCAL_QUARTER.Q1, yearOffset: 0 },
  // The same spill for the three quarterly deadlines, which close on the 20th.
  5: { quarter: FISCAL_QUARTER.Q1, yearOffset: 0 },
  7: { quarter: FISCAL_QUARTER.Q2, yearOffset: 0 },
  8: { quarter: FISCAL_QUARTER.Q2, yearOffset: 0 },
  10: { quarter: FISCAL_QUARTER.Q3, yearOffset: 0 },
  11: { quarter: FISCAL_QUARTER.Q3, yearOffset: 0 },
};

interface DeferralPeriod {
  fiscalYear: number | null;
  fiscalQuarter: FiscalQuarter | null;
}

const NO_PERIOD: DeferralPeriod = { fiscalYear: null, fiscalQuarter: null };

/**
 * Work out which modelo period the letter defers.
 *
 * **The resolution never prints it.** It names a concepto and a "Fecha de Intereses", and that date
 * is the last day of the periodo voluntario of the modelo being deferred — which is what identifies
 * the period, whatever month the resolution itself was signed in. So it is derived here, in code,
 * rather than asked of the reader: a month-to-quarter lookup is exact and testable, and the reader
 * has no business doing arithmetic on a figure the page does not carry.
 *
 * The date is split by hand instead of going through `Date`: 'YYYY-MM-DD' parsed as a Date is UTC
 * midnight, and reading its month back in the local timezone shifts it a day, which at the turn of
 * a month is a different quarter.
 */
export function deriveDeferralPeriod(modeloType: ModeloType | null, interestStartDate: string | null): DeferralPeriod {
  if (!modeloType || !interestStartDate) return NO_PERIOD;

  const [yearPart, monthPart] = interestStartDate.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return NO_PERIOD;

  // 390 (filed in January) and 100 (filed by 30 June) both declare the previous year
  if (ANNUAL_MODELOS.includes(modeloType)) {
    return { fiscalYear: year - 1, fiscalQuarter: null };
  }

  const period = MONTH_TO_QUARTER[month];
  if (!period) return NO_PERIOD;

  return { fiscalYear: year + period.yearOffset, fiscalQuarter: period.quarter };
}

/**
 * Extract a deferral resolution from its PDF/image.
 * Returns ExtractedDeferralData with every amount already in cents, exactly as ANEXO I prints it.
 */
export async function extractDeferral(
  fileBuffer: Buffer,
  contentType: string,
  fileName: string,
): Promise<ExtractedDeferralData> {
  // biome-ignore lint/suspicious/noConsole: OCR extraction logging
  console.log(`[OCR] Starting deferral extraction: ${fileName} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
  const startTime = Date.now();

  const rawData = await callVisionJson(fileBuffer, contentType, EXTRACTION_PROMPT, DEFERRAL_MAX_TOKENS);

  const validated = ExtractedDeferralRawSchema.safeParse(rawData);
  if (!validated.success) {
    // biome-ignore lint/suspicious/noConsole: OCR extraction logging
    console.error(`[OCR] Deferral extraction validation failed for ${fileName}:`, validated.error.message);
    throw new VisionApiError(VISION_FAILURE.INVALID_RESPONSE, `OCR data validation failed: ${validated.error.message}`);
  }

  const { concepto, ...data } = validated.data;
  const { fiscalYear, fiscalQuarter } = deriveDeferralPeriod(data.modeloType, data.interestStartDate);

  const confidence =
    data.liquidacionNumber === null ? Math.min(data.confidence, UNRESOLVED_LIQUIDACION_CONFIDENCE) : data.confidence;

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  // biome-ignore lint/suspicious/noConsole: OCR extraction logging
  console.log(
    `[OCR] Deferral extracted in ${elapsed}s: expediente ${data.expedienteNumber}, modelo ${data.modeloType} (${concepto}), ${fiscalQuarter ?? 'annual'}/${fiscalYear}, ${data.fracciones.length} fracciones, interest ${data.interestCents}c, confidence: ${confidence}`,
  );

  return { ...data, fiscalYear, fiscalQuarter, confidence };
}
