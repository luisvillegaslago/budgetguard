/**
 * Anthropic Vision helper
 * Shared low-level bridge to the Anthropic API for OCR/vision tasks.
 * Encapsulates API key handling, media type resolution, base64 encoding,
 * content-block construction, the vision model call, markdown fence cleanup,
 * JSON parsing, and the mapping of SDK failures to typed VisionApiError.
 */

import Anthropic from '@anthropic-ai/sdk';
import { API_ERROR, VISION_FAILURE } from '@/constants/finance';
import type { VisionFailureReason } from '@/types/finance';
import { ValidationError } from '@/utils/apiErrors';

/** Vision-capable model used for all OCR/detection calls. */
export const VISION_MODEL = 'claude-sonnet-4-6';

/**
 * Failure attributable to the vision provider (credits, rate limit, outage) or
 * to an unusable model response. Routes map this to a 502; anything else that
 * escapes is a server fault and reaches withApiHandler's 500 path.
 */
export class VisionApiError extends Error {
  readonly reason: VisionFailureReason;

  constructor(reason: VisionFailureReason, detail?: string) {
    super(detail ?? reason);
    this.name = 'VisionApiError';
    this.reason = reason;
  }
}

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
type SupportedMediaType = 'application/pdf' | ImageMediaType;

const PDF_MEDIA_TYPE = 'application/pdf';

/** Content types we accept when the file's own bytes are inconclusive. */
const DECLARED_MEDIA_TYPES: Record<string, SupportedMediaType> = {
  'application/pdf': PDF_MEDIA_TYPE,
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/gif': 'image/gif',
  'image/webp': 'image/webp',
};

interface MagicBytes {
  readonly mediaType: SupportedMediaType;
  readonly prefix: readonly number[];
  /** Extra signature further into the header (WEBP carries "WEBP" at byte 8) */
  readonly suffix?: { readonly offset: number; readonly bytes: readonly number[] };
}

const MAGIC_BYTES: readonly MagicBytes[] = [
  { mediaType: PDF_MEDIA_TYPE, prefix: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mediaType: 'image/png', prefix: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mediaType: 'image/jpeg', prefix: [0xff, 0xd8, 0xff] },
  { mediaType: 'image/gif', prefix: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  {
    mediaType: 'image/webp',
    prefix: [0x52, 0x49, 0x46, 0x46], // RIFF
    suffix: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // WEBP
  },
];

function matchesBytes(buffer: Buffer, bytes: readonly number[], offset: number): boolean {
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

/** Identify the file from its own bytes; returns null for anything unsupported. */
function sniffMediaType(buffer: Buffer): SupportedMediaType | null {
  const match = MAGIC_BYTES.find(
    (signature) =>
      matchesBytes(buffer, signature.prefix, 0) &&
      (!signature.suffix || matchesBytes(buffer, signature.suffix.bytes, signature.suffix.offset)),
  );

  return match?.mediaType ?? null;
}

/**
 * Resolve the media type to send to the API. The file's own bytes win over the
 * declared content type: browsers send an empty type (or octet-stream) for many
 * uploads, and a mislabelled PDF must never be sent as an image.
 */
function resolveMediaType(fileBuffer: Buffer, contentType: string): SupportedMediaType {
  const sniffed = sniffMediaType(fileBuffer);
  if (sniffed) return sniffed;

  const declared = DECLARED_MEDIA_TYPES[contentType.toLowerCase()];
  if (declared) return declared;

  throw new ValidationError(API_ERROR.FISCAL.UNSUPPORTED_FILE_TYPE, `Unsupported content type "${contentType}"`);
}

/** JSON body the API returns on an error response: `{ type, error: { type, message } }`. */
function apiErrorType(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const inner = (body as { error?: unknown }).error;
  if (typeof inner !== 'object' || inner === null) return null;
  const type = (inner as { type?: unknown }).type;
  return typeof type === 'string' ? type : null;
}

/** Map an SDK failure to a typed reason, branching on the SDK error classes. */
function toVisionApiError(error: unknown): VisionApiError {
  const detail = error instanceof Error ? error.message : String(error);

  if (error instanceof Anthropic.RateLimitError) {
    return new VisionApiError(VISION_FAILURE.RATE_LIMITED, detail);
  }

  if (error instanceof Anthropic.APIError) {
    // The API reports exhausted credits as a `billing_error`, or as an
    // `invalid_request_error` whose message names the credit balance — the
    // latter has no distinct code, so the message is the last-resort signal.
    const type = apiErrorType(error.error);
    const isBilling =
      type === 'billing_error' ||
      error.status === 402 ||
      (type === 'invalid_request_error' && detail.includes('credit balance'));

    if (isBilling) return new VisionApiError(VISION_FAILURE.CREDITS_EXHAUSTED, detail);
    return new VisionApiError(VISION_FAILURE.UNAVAILABLE, detail);
  }

  return new VisionApiError(VISION_FAILURE.UNAVAILABLE, detail);
}

/**
 * Call the Anthropic vision model with a document/image and a prompt, then
 * parse the JSON object it returns. Handles markdown code fences.
 * Throws ValidationError for unsupported file types (400), VisionApiError for
 * provider failures and unusable responses (502), and a plain Error only when
 * the server is misconfigured (500).
 */
export async function callVisionJson(fileBuffer: Buffer, contentType: string, prompt: string): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  const mediaType = resolveMediaType(fileBuffer, contentType);
  const client = new Anthropic({ apiKey });
  const base64Data = fileBuffer.toString('base64');

  const content: Anthropic.ContentBlockParam[] =
    mediaType === PDF_MEDIA_TYPE
      ? [
          {
            type: 'document',
            source: { type: 'base64', media_type: PDF_MEDIA_TYPE, data: base64Data },
          },
          { type: 'text', text: prompt },
        ]
      : [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Data },
          },
          { type: 'text', text: prompt },
        ];

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: VISION_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content }],
    });
  } catch (error) {
    throw toVisionApiError(error);
  }

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new VisionApiError(VISION_FAILURE.INVALID_RESPONSE, 'No text response from Claude');
  }

  // Parse JSON from response (handle potential markdown code blocks)
  let jsonText = textBlock.text.trim();
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new VisionApiError(
      VISION_FAILURE.INVALID_RESPONSE,
      `Model response is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
