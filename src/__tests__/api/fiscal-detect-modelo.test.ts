/**
 * Integration tests for POST /api/fiscal/documents/detect-modelo.
 * Mocks the Anthropic SDK and getUserIdOrThrow. Verifies the full route →
 * detectModelo → DetectedModeloRawSchema pipeline: modelo detection, euros→cents,
 * annual-quarter nulling, markdown-fence parsing, missing-file 400, and SDK error mapping.
 */

import { API_ERROR, MODELO_TYPE } from '@/constants/finance';

// ============================================================
// Mocks
// ============================================================

// The vision bridge reads ANTHROPIC_API_KEY before constructing the client
process.env.ANTHROPIC_API_KEY = 'test-key';

const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

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

import { POST } from '@/app/api/fiscal/documents/detect-modelo/route';

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

/** Build a mock request whose formData() carries an optional PDF file. */
function createFileRequest(fileName: string | null): { formData: () => Promise<FormDataLike> } {
  const file: FileLike | null =
    fileName === null
      ? null
      : {
          name: fileName,
          type: 'application/pdf',
          arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
        };
  const formData: FormDataLike = { get: (key: string) => (key === 'file' ? file : null) };
  return { formData: async () => formData };
}

/** Queue the JSON the mocked vision model should return as its text block. */
function mockVisionText(text: string): void {
  mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text }] });
}

async function callRoute(fileName: string | null): Promise<{ status: number; body: DetectionResponse }> {
  const request = createFileRequest(fileName);
  const response = await POST(request as never);
  const body = (await response.json()) as DetectionResponse;
  return { status: response.status, body };
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

  it('maps a credit-balance SDK error to 502 api_credits_exhausted', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Your credit balance is too low to access the API'));

    const { status, body } = await callRoute('descarga.pdf');

    expect(status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.error).toBe('api_credits_exhausted');
  });

  it('maps a generic SDK error to 502 detection-failed', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network timeout'));

    const { status, body } = await callRoute('descarga.pdf');

    expect(status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.error).toBe(API_ERROR.FISCAL.DETECTION_FAILED);
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
