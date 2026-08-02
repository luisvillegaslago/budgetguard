/**
 * Integration tests for POST /api/fiscal/documents/detect-modelo.
 * Mocks the Anthropic SDK and getUserIdOrThrow. Verifies the full route →
 * detectModelo → DetectedModeloRawSchema pipeline: modelo detection, euros→cents,
 * annual-quarter nulling, markdown-fence parsing, missing-file 400, and SDK error mapping.
 */

import { API_ERROR, MODELO_TYPE, OCR_ERROR_CODE } from '@/constants/finance';

// ============================================================
// Mocks
// ============================================================

// The vision bridge reads ANTHROPIC_API_KEY before constructing the client
process.env.ANTHROPIC_API_KEY = 'test-key';

const mockCreate = jest.fn();

// Keep the real error classes — the vision bridge branches on them via instanceof
jest.mock('@anthropic-ai/sdk', () => {
  const actual = jest.requireActual('@anthropic-ai/sdk');
  class MockAnthropic {
    messages = { create: mockCreate };
  }
  return {
    __esModule: true,
    default: Object.assign(MockAnthropic, {
      APIError: actual.APIError,
      RateLimitError: actual.RateLimitError,
      APIConnectionError: actual.APIConnectionError,
    }),
  };
});

type SdkErrorConstructor = new (status: number, body: unknown, message: string) => Error;

/** Build an SDK error of the given class with the API's JSON error body. */
function sdkError(ErrorClass: SdkErrorConstructor, status: number, type: string, message: string): Error {
  return new ErrorClass(status, { type: 'error', error: { type, message } }, message);
}

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 1),
  AuthError: class AuthError extends Error {},
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

// ============================================================
// Import route AFTER mocks
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { POST } from '@/app/api/fiscal/documents/detect-modelo/route';

const APIError = Anthropic.APIError as unknown as SdkErrorConstructor;
const RateLimitError = Anthropic.RateLimitError as unknown as SdkErrorConstructor;

// ============================================================
// Helpers
// ============================================================

interface DetectionResponse {
  success: boolean;
  data?: {
    modeloType: string | null;
    fiscalYear: number | null;
    fiscalQuarter: number | null;
    resultAmountCents: number | null;
    confidence: number;
  };
  error?: string;
  errors?: Record<string, string[]>;
}

/** Minimal File-like carried by FormData — jsdom's File lacks arrayBuffer() under jest. */
interface FileLike {
  name: string;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

interface FormDataLike {
  get: (key: string) => FileLike | null;
}

const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46]; // "%PDF"

interface FileOverrides {
  type?: string;
  bytes?: number[];
}

/** Build a mock request whose formData() carries an optional PDF file. */
function createFileRequest(
  fileName: string | null,
  overrides: FileOverrides = {},
): { formData: () => Promise<FormDataLike> } {
  const file: FileLike | null =
    fileName === null
      ? null
      : {
          name: fileName,
          type: overrides.type ?? 'application/pdf',
          arrayBuffer: async () => new Uint8Array(overrides.bytes ?? [1, 2, 3, 4]).buffer,
        };
  const formData: FormDataLike = { get: (key: string) => (key === 'file' ? file : null) };
  return { formData: async () => formData };
}

/** Queue the JSON the mocked vision model should return as its text block. */
function mockVisionText(text: string): void {
  mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text }] });
}

async function callRoute(
  fileName: string | null,
  overrides: FileOverrides = {},
): Promise<{ status: number; body: DetectionResponse }> {
  const request = createFileRequest(fileName, overrides);
  const response = await POST(request as never);
  const body = (await response.json()) as DetectionResponse;
  return { status: response.status, body };
}

/** The media type the vision bridge actually sent for the last call. */
function sentMediaType(): string | undefined {
  const content = mockCreate.mock.calls[0]?.[0]?.messages?.[0]?.content;
  return content?.[0]?.source?.media_type;
}

beforeEach(() => {
  mockCreate.mockReset();
});

// ============================================================
// Tests
// ============================================================

describe('POST /api/fiscal/documents/detect-modelo', () => {
  it('detects a Modelo 303 1T and converts the result amount to cents', async () => {
    mockVisionText(
      JSON.stringify({
        modeloType: '303',
        fiscalYear: 2026,
        fiscalQuarter: 1,
        resultAmountEuros: 419.28,
        confidence: 0.95,
      }),
    );

    const { status, body } = await callRoute('descarga.pdf');

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.modeloType).toBe(MODELO_TYPE.M303);
    expect(body.data?.fiscalYear).toBe(2026);
    expect(body.data?.fiscalQuarter).toBe(1);
    expect(body.data?.resultAmountCents).toBe(41928);
    expect(body.data?.confidence).toBe(0.95);
  });

  it('forces fiscalQuarter to null for annual Modelo 390 even if the AI returns a quarter', async () => {
    mockVisionText(
      JSON.stringify({
        modeloType: '390',
        fiscalYear: 2025,
        fiscalQuarter: 4,
        resultAmountEuros: 0,
        confidence: 0.9,
      }),
    );

    const { status, body } = await callRoute('descarga.pdf');

    expect(status).toBe(200);
    expect(body.data?.modeloType).toBe(MODELO_TYPE.M390);
    expect(body.data?.fiscalQuarter).toBeNull();
  });

  it('keeps negative result amounts (refund due) as negative cents', async () => {
    mockVisionText(
      JSON.stringify({
        modeloType: '130',
        fiscalYear: 2026,
        fiscalQuarter: 2,
        resultAmountEuros: -150.5,
        confidence: 0.88,
      }),
    );

    const { status, body } = await callRoute('descarga.pdf');

    expect(status).toBe(200);
    expect(body.data?.resultAmountCents).toBe(-15050);
  });

  it('parses a response wrapped in markdown ```json fences', async () => {
    mockVisionText(
      '```json\n' +
        JSON.stringify({
          modeloType: '303',
          fiscalYear: 2026,
          fiscalQuarter: 3,
          resultAmountEuros: 100,
          confidence: 0.91,
        }) +
        '\n```',
    );

    const { status, body } = await callRoute('descarga.pdf');

    expect(status).toBe(200);
    expect(body.data?.modeloType).toBe(MODELO_TYPE.M303);
    expect(body.data?.fiscalQuarter).toBe(3);
    expect(body.data?.resultAmountCents).toBe(10000);
  });

  it('returns 400 when no file is provided', async () => {
    const { status, body } = await callRoute(null);

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.errors?.file).toContain(API_ERROR.FISCAL.FILE_REQUIRED);
    // The vision model must never be reached without a file
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('maps a billing_error SDK error to 502 api_credits_exhausted', async () => {
    mockCreate.mockRejectedValueOnce(sdkError(APIError, 400, 'billing_error', 'Your organization has no credits left'));

    const { status, body } = await callRoute('descarga.pdf');

    expect(status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.error).toBe(OCR_ERROR_CODE.API_CREDITS_EXHAUSTED);
  });

  it('maps a credit-balance invalid_request_error to 502 api_credits_exhausted', async () => {
    mockCreate.mockRejectedValueOnce(
      sdkError(APIError, 400, 'invalid_request_error', 'Your credit balance is too low to access the API'),
    );

    const { status, body } = await callRoute('descarga.pdf');

    expect(status).toBe(502);
    expect(body.error).toBe(OCR_ERROR_CODE.API_CREDITS_EXHAUSTED);
  });

  it('maps a rate-limit SDK error to 502 detection-failed', async () => {
    mockCreate.mockRejectedValueOnce(
      sdkError(RateLimitError, 429, 'rate_limit_error', 'Number of requests has exceeded your rate limit'),
    );

    const { status, body } = await callRoute('descarga.pdf');

    expect(status).toBe(502);
    expect(body.error).toBe(API_ERROR.FISCAL.DETECTION_FAILED);
  });

  it('maps a generic SDK error to 502 detection-failed', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network timeout'));

    const { status, body } = await callRoute('descarga.pdf');

    expect(status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.error).toBe(API_ERROR.FISCAL.DETECTION_FAILED);
  });

  it('maps an unparseable model response to 502 detection-failed', async () => {
    mockVisionText('this is not JSON at all');

    const { status, body } = await callRoute('descarga.pdf');

    expect(status).toBe(502);
    expect(body.error).toBe(API_ERROR.FISCAL.DETECTION_FAILED);
  });

  it('sends a type-less PDF as a document, not as an image', async () => {
    mockVisionText(
      JSON.stringify({
        modeloType: '303',
        fiscalYear: 2026,
        fiscalQuarter: 1,
        resultAmountEuros: 10,
        confidence: 0.9,
      }),
    );

    const { status } = await callRoute('descarga.pdf', { type: '', bytes: PDF_MAGIC_BYTES });

    expect(status).toBe(200);
    expect(sentMediaType()).toBe('application/pdf');
  });

  it('trusts the file bytes over a wrong declared content type', async () => {
    mockVisionText(
      JSON.stringify({
        modeloType: '303',
        fiscalYear: 2026,
        fiscalQuarter: 1,
        resultAmountEuros: 10,
        confidence: 0.9,
      }),
    );

    const { status } = await callRoute('descarga.pdf', { type: 'image/png', bytes: PDF_MAGIC_BYTES });

    expect(status).toBe(200);
    expect(sentMediaType()).toBe('application/pdf');
  });

  it('returns 400 for an unsupported file type without calling the model', async () => {
    const { status, body } = await callRoute('archivo.zip', {
      type: 'application/zip',
      bytes: [0x50, 0x4b, 0x03, 0x04],
    });

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe(API_ERROR.FISCAL.UNSUPPORTED_FILE_TYPE);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns modeloType null with low confidence for a non-modelo document', async () => {
    mockVisionText(
      JSON.stringify({
        modeloType: null,
        fiscalYear: null,
        fiscalQuarter: null,
        resultAmountEuros: null,
        confidence: 0.2,
      }),
    );

    const { status, body } = await callRoute('vodafone-enero.pdf');

    expect(status).toBe(200);
    expect(body.data?.modeloType).toBeNull();
    expect(body.data?.fiscalQuarter).toBeNull();
    expect(body.data?.resultAmountCents).toBeNull();
    expect(body.data?.confidence).toBe(0.2);
  });
});
