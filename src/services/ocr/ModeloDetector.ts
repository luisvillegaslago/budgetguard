/**
 * Modelo Detection Service
 * Uses Anthropic Vision to detect the AEAT modelo type, fiscal period and result
 * amount from an uploaded tax-form PDF/image, before persisting anything.
 * The result amount is converted from euros to cents via Zod .transform().
 */

import { DetectedModeloRawSchema } from '@/schemas/fiscal-document';
import { callVisionJson } from '@/services/ocr/anthropicVision';
import type { DetectedModeloData } from '@/types/finance';

const DETECTION_PROMPT = `You are a Spanish tax form (AEAT) classification assistant. Analyze this document and detect which modelo it is.

Return ONLY a JSON object with these fields:
- modeloType: "303" | "130" | "390" | "100" | null
- fiscalYear: number | null (the "Ejercicio")
- fiscalQuarter: number | null (1, 2, 3 or 4)
- resultAmountEuros: number | null (final settlement result, in euros)
- confidence: number (your confidence in the detection, 0.0 to 1.0)

Rules:
- Spanish AEAT tax forms print the form number prominently in the header ("Modelo 303", "Modelo 130", "Modelo 390", "Modelo 100").
- Only these four are valid; if it is not one of them, return modeloType: null and low confidence. Do NOT guess.
- "Ejercicio" is the fiscal year; "Periodo" is 1T/2T/3T/4T -> map to 1/2/3/4, and "0A"/annual -> null.
- Forms 390 and 100 are annual: fiscalQuarter must be null.
- resultAmountEuros is the final settlement box, labelled "Resultado" or "Resultado de la liquidacion".
- Transcribe that box's sign as printed. It is POSITIVE when payable ("a ingresar"), and NEGATIVE for every
  non-payable outcome: "a devolver" (refund), "a compensar" (carried forward to the next quarter), or a
  printed minus sign. Never flip the sign the form shows.
- Amounts in euros, not cents. Return ONLY valid JSON, no markdown.`;

/**
 * Detect the modelo type and fiscal metadata from a tax-form document.
 * Returns DetectedModeloData with the result amount in cents (via Zod schema).
 */
export async function detectModelo(
  fileBuffer: Buffer,
  contentType: string,
  fileName: string,
): Promise<DetectedModeloData> {
  // biome-ignore lint/suspicious/noConsole: OCR detection logging
  console.log(`[OCR] Starting modelo detection: ${fileName} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
  const startTime = Date.now();

  const rawData = await callVisionJson(fileBuffer, contentType, DETECTION_PROMPT);

  const validated = DetectedModeloRawSchema.safeParse(rawData);
  if (!validated.success) {
    // biome-ignore lint/suspicious/noConsole: OCR detection logging
    console.error(`[OCR] Modelo detection validation failed for ${fileName}:`, validated.error.message);
    throw new Error(`OCR data validation failed: ${validated.error.message}`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  // biome-ignore lint/suspicious/noConsole: OCR detection logging
  console.log(
    `[OCR] Detected in ${elapsed}s: modelo ${validated.data.modeloType}, year: ${validated.data.fiscalYear}, quarter: ${validated.data.fiscalQuarter}, confidence: ${validated.data.confidence}`,
  );

  return validated.data;
}
