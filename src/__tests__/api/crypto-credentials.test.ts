/**
 * Integration tests: POST/DELETE /api/crypto/credentials
 *
 * Critical contract: keys with write/withdraw/futures/margin permissions
 * MUST be rejected with 400 + UNSAFE_PERMISSIONS BEFORE anything is
 * persisted. Read-only keys are accepted, encrypted, and the public DTO
 * never echoes the secret.
 */

import { API_ERROR } from '@/constants/finance';

// ============================================================
// Mocks
// ============================================================

const safePermissions = {
  ipRestrict: true,
  enableReading: true,
  enableWithdrawals: false,
  enableInternalTransfer: false,
  enableMargin: false,
  enableFutures: false,
  enableSpotAndMarginTrading: false,
  enableVanillaOptions: false,
  permitsUniversalTransfer: false,
  createTime: 1700000000000,
};

let mockPermissionsResult: 'safe' | 'withdrawal' | 'futures' | 'no-read' = 'safe';
let upsertCalled = false;

// Mock the BinanceClient module: stand-in error class + mocked client.
// Defined inside the factory to dodge jest.mock hoisting (the factory runs
// before any top-level `class` declarations would be initialized).
jest.mock('@/services/exchanges/binance/BinanceClient', () => {
  class FakeBinanceClientError extends Error {
    readonly name = 'BinanceClientError';
    constructor(public readonly code: string) {
      super(code);
    }
  }
  return {
    BinanceClient: jest.fn().mockImplementation(() => ({
      validatePermissions: jest.fn(async () => {
        if (mockPermissionsResult !== 'safe') {
          throw new FakeBinanceClientError('api-error.crypto.unsafe-permissions');
        }
        return safePermissions;
      }),
    })),
    BinanceClientError: FakeBinanceClientError,
    BINANCE_INVALID_SYMBOL_CODE: -1121,
    BINANCE_INVALID_PARAM_CODE: -1100,
    BINANCE_NO_TRADING_PERMISSION_CODE: -2010,
  };
});

jest.mock('@/services/database/ExchangeCredentialsRepository', () => ({
  upsertCredential: jest.fn(async (input: { exchange: string; apiKey: string; permissions: unknown }) => {
    upsertCalled = true;
    return {
      credentialId: 1,
      exchange: input.exchange,
      apiKeyLast4: input.apiKey.slice(-4),
      permissions: input.permissions,
      lastValidatedAt: new Date('2026-04-28T10:00:00Z').toISOString(),
      isActive: true,
      createdAt: new Date('2026-04-28T10:00:00Z').toISOString(),
    };
  }),
  deactivateCredential: jest.fn(async () => true),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { POST } from '@/app/api/crypto/credentials/route';

// ============================================================
// Helpers
// ============================================================

const VALID_KEY = 'a'.repeat(64); // matches the 50-80 alphanumeric pattern
const VALID_SECRET = 'b'.repeat(64);

function createMockRequest(body: Record<string, unknown>) {
  return {
    url: 'http://localhost:3000/api/crypto/credentials',
    json: async () => body,
  };
}

beforeEach(() => {
  upsertCalled = false;
  mockPermissionsResult = 'safe';
});

// ============================================================
// POST /api/crypto/credentials
// ============================================================

describe('POST /api/crypto/credentials', () => {
  it('rejects keys with withdrawal permission and never persists', async () => {
    mockPermissionsResult = 'withdrawal';
    const req = createMockRequest({ exchange: 'binance', apiKey: VALID_KEY, apiSecret: VALID_SECRET });
    const res = await POST(req as never);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe(API_ERROR.CRYPTO.UNSAFE_PERMISSIONS);
    expect(upsertCalled).toBe(false);
  });

  it('rejects keys with futures permission and never persists', async () => {
    mockPermissionsResult = 'futures';
    const req = createMockRequest({ exchange: 'binance', apiKey: VALID_KEY, apiSecret: VALID_SECRET });
    const res = await POST(req as never);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe(API_ERROR.CRYPTO.UNSAFE_PERMISSIONS);
    expect(upsertCalled).toBe(false);
  });

  it('rejects keys without reading permission', async () => {
    mockPermissionsResult = 'no-read';
    const req = createMockRequest({ exchange: 'binance', apiKey: VALID_KEY, apiSecret: VALID_SECRET });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    expect(upsertCalled).toBe(false);
  });

  it('accepts a read-only key, persists encrypted, returns public DTO without secret', async () => {
    mockPermissionsResult = 'safe';
    const req = createMockRequest({ exchange: 'binance', apiKey: VALID_KEY, apiSecret: VALID_SECRET });
    const res = await POST(req as never);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(upsertCalled).toBe(true);

    // Public DTO contract: no plaintext, only the last 4 chars + permissions snapshot.
    expect(data.data.apiKeyLast4).toBe('aaaa');
    expect(JSON.stringify(data.data)).not.toContain(VALID_SECRET);
    expect(JSON.stringify(data.data)).not.toContain(VALID_KEY);
    expect(data.data.permissions).toMatchObject({ enableReading: true, enableWithdrawals: false });
  });

  it('rejects a malformed body (validation 400) before calling Binance', async () => {
    const req = createMockRequest({ exchange: 'binance', apiKey: 'short', apiSecret: 'short' });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    expect(upsertCalled).toBe(false);
  });
});
