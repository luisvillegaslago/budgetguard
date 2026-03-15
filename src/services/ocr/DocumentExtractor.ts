/**
 * OCR Document Extraction Service
 * Uses Anthropic API to extract structured invoice data from PDF/image documents.
 * Falls back to Claude CLI if no API key is configured.
 * All monetary amounts are converted from euros to cents via Zod .transform().
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Locale } from '@/libs/i18n';
import { DEFAULT_LOCALE } from '@/libs/i18n';
import { ExtractedInvoiceRawSchema } from '@/schemas/fiscal-document';
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

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

function getImageMediaType(contentType: string): ImageMediaType {
  const typeMap: Record<string, ImageMediaType> = {
    'image/jpeg': 'image/jpeg',
    'image/jpg': 'image/jpeg',
    'image/png': 'image/png',
    'image/gif': 'image/gif',
    'image/webp': 'image/webp',
  };
  return typeMap[contentType] ?? 'image/jpeg';
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  // biome-ignore lint/suspicious/noConsole: OCR extraction logging
  console.log(`[OCR] Starting extraction: ${fileName} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
  const startTime = Date.now();

  const client = new Anthropic({ apiKey });
  const base64Data = fileBuffer.toString('base64');
  const isPdf = contentType === 'application/pdf';
  const prompt = getExtractionPrompt(locale);

  const content: Anthropic.ContentBlockParam[] = isPdf
    ? [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64Data },
        },
        { type: 'text', text: prompt },
      ]
    : [
        {
          type: 'image',
          source: { type: 'base64', media_type: getImageMediaType(contentType), data: base64Data },
        },
        { type: 'text', text: prompt },
      ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  // Parse JSON from response (handle potential markdown code blocks)
  let jsonText = textBlock.text.trim();
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  const rawData = JSON.parse(jsonText);

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
