/**
 * OCR Document Extraction Service
 * Uses Anthropic API to extract structured invoice data from PDF/image documents.
 * All monetary amounts are converted from euros to cents via Zod .transform().
 */

import type { Locale } from '@/libs/i18n';
import { DEFAULT_LOCALE } from '@/libs/i18n';
import { ExtractedInvoiceRawSchema } from '@/schemas/fiscal-document';
import { callVisionJson } from '@/services/ocr/anthropicVision';
import type { ExtractedInvoiceData } from '@/types/finance';

const LOCALE_TO_LANGUAGE: Record<Locale, string> = {
  en: 'English',
  es: 'Spanish',
};

function getExtractionPrompt(locale: Locale = DEFAULT_LOCALE): string {
  const language = LOCALE_TO_LANGUAGE[locale];
  return `You are an invoice data extraction assistant. Analyze this document and extract the following information as JSON.

Return ONLY a JSON object with these fields:
- totalAmountEuros: number (total amount in euros, REQUIRED)
- baseAmountEuros: number | null (base amount before tax)
- taxAmountEuros: number | null (tax/VAT amount)
- vatPercent: number | null (VAT percentage, e.g. 21)
- date: string | null (invoice date in YYYY-MM-DD format)
- vendor: string | null (vendor/company name)
- invoiceNumber: string | null (invoice or document number)
- description: string | null (brief description of what was purchased/billed, written in ${language})
- confidence: number (your confidence in the extraction, 0.0 to 1.0)

Rules:
- All amounts must be in euros (not cents)
- If you can see the total but not the breakdown, set baseAmountEuros and taxAmountEuros to null
- If the document is not an invoice/receipt, still try to extract what you can
- Set confidence lower if the document is blurry, partially visible, or you're unsure
- Return ONLY valid JSON, no markdown formatting or explanation`;
}

/**
 * Extract structured invoice data from a document using Anthropic API (vision).
 * Returns ExtractedInvoiceData with all amounts in cents (converted via Zod schema).
 */
export async function extractFromDocument(
  fileBuffer: Buffer,
  contentType: string,
  fileName: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<ExtractedInvoiceData> {
  // biome-ignore lint/suspicious/noConsole: OCR extraction logging
  console.log(`[OCR] Starting extraction: ${fileName} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
  const startTime = Date.now();

  const prompt = getExtractionPrompt(locale);
  const rawData = await callVisionJson(fileBuffer, contentType, prompt);

  const validated = ExtractedInvoiceRawSchema.safeParse(rawData);
  if (!validated.success) {
    // biome-ignore lint/suspicious/noConsole: OCR extraction logging
    console.error(`[OCR] Validation failed for ${fileName}:`, validated.error.message);
    throw new Error(`OCR data validation failed: ${validated.error.message}`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  // biome-ignore lint/suspicious/noConsole: OCR extraction logging
  console.log(
    `[OCR] Extracted in ${elapsed}s: ${validated.data.totalAmountCents / 100}€, vendor: ${validated.data.vendor}, date: ${validated.data.date}, confidence: ${validated.data.confidence}`,
  );

  return validated.data;
}
