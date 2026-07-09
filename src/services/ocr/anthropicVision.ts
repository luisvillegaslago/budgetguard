/**
 * Anthropic Vision helper
 * Shared low-level bridge to the Anthropic API for OCR/vision tasks.
 * Encapsulates API key handling, base64 encoding, content-block construction,
 * the vision model call, markdown fence cleanup, and JSON parsing.
 */

import Anthropic from '@anthropic-ai/sdk';

/** Vision-capable model used for all OCR/detection calls. */
export const VISION_MODEL = 'claude-sonnet-4-6';

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
 * Call the Anthropic vision model with a document/image and a prompt, then
 * parse the JSON object it returns. Handles markdown code fences.
 * Throws if ANTHROPIC_API_KEY is missing or the model returns no text block.
 */
export async function callVisionJson(fileBuffer: Buffer, contentType: string, prompt: string): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  const client = new Anthropic({ apiKey });
  const base64Data = fileBuffer.toString('base64');
  const isPdf = contentType === 'application/pdf';

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
    model: VISION_MODEL,
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

  return JSON.parse(jsonText);
}
