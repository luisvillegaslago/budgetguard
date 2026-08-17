/**
 * Integration Tests: Fixed Assets (inmovilizado) API
 * Tests GET/POST /api/fiscal/assets and GET/PUT/DELETE /api/fiscal/assets/[id]
 *
 * Two things are worth pinning here, and neither is CRUD plumbing.
 *
 * The wire contract: the amortizable base travels in EUROS and reaches the repository in CENTS,
 * and the in-service date reaches it as a calendar day — a DATE column read as an instant shifts
 * the acquisition by one day for half the year, which moves cents between two fiscal years.
 *
 * The ERD cap: a rate above the tabla maximum doubled by art. 103 LIS is an over-deduction, the
 * exact error this module exists to prevent. The schema only ever sees the payload, so a PUT that
 * raises the rate alone carries no group to check against; the route re-checks the merged row.
 */

import { API_ERROR, MODELO_100_CASILLA, VALIDATION_KEY } from '@/constants/finance';
import type { FixedAsset, FixedAssetInput, FixedAssetUpdateInput } from '@/types/finance';

// ── Mock Data ──

/** The real asset: Lenovo Yoga Slim 7 Gen 9, 869,00 € with 21% VAT → base 718,18 €, grupo 5 at 52% */
const LENOVO: FixedAsset = {
  assetId: 1,
  description: 'Lenovo Yoga Slim 7 Gen 9',
  inServiceDate: '2025-11-28',
  baseCents: 71818,
  coefficientPercent: 52,
  amortizationGroup: 5,
  modelo100CasillaCode: MODELO_100_CASILLA.C0208,
  transactionId: 3489,
  notes: null,
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
};

/** A valid POST body, in euros, as the form sends it */
const validBody = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  description: 'Lenovo Yoga Slim 7 Gen 9',
  baseAmount: 718.18,
  inServiceDate: '2025-11-28',
  coefficientPercent: 52,
  amortizationGroup: 5,
  modelo100CasillaCode: MODELO_100_CASILLA.C0208,
  transactionId: 3489,
  notes: null,
  ...overrides,
});

// ── Mocks ──

const mockGetFixedAssets = jest.fn();
const mockGetFixedAssetById = jest.fn();
const mockCreateFixedAsset = jest.fn();
const mockUpdateFixedAsset = jest.fn();
const mockDeleteFixedAsset = jest.fn();

jest.mock('@/services/database/FixedAssetRepository', () => ({
  getFixedAssets: (year?: number) => mockGetFixedAssets(year),
  getFixedAssetById: (assetId: number) => mockGetFixedAssetById(assetId),
  createFixedAsset: (input: FixedAssetInput) => mockCreateFixedAsset(input),
  updateFixedAsset: (assetId: number, input: FixedAssetUpdateInput) => mockUpdateFixedAsset(assetId, input),
  deleteFixedAsset: (assetId: number) => mockDeleteFixedAsset(assetId),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { DELETE, GET as GET_ONE, PUT } from '@/app/api/fiscal/assets/[id]/route';
import { GET as GET_LIST, POST } from '@/app/api/fiscal/assets/route';

// ── Helpers ──

function createMockRequest(url: string, body?: Record<string, unknown>) {
  return { url, json: async () => body ?? {} };
}

/** The route context Next.js passes: params is a promise in the app router */
const context = (id: string) => ({ params: Promise.resolve({ id }) });

// ── GET /api/fiscal/assets ──

describe('GET /api/fiscal/assets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetFixedAssets.mockResolvedValue([LENOVO]);
  });

  it('should return every asset when no year is given', async () => {
    const response = await GET_LIST(createMockRequest('http://localhost:3000/api/fiscal/assets') as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([LENOVO]);
    expect(body.meta.count).toBe(1);
    expect(mockGetFixedAssets).toHaveBeenCalledWith(undefined);
  });

  it('should pass the year through as a number', async () => {
    await GET_LIST(createMockRequest('http://localhost:3000/api/fiscal/assets?year=2026') as never);

    expect(mockGetFixedAssets).toHaveBeenCalledWith(2026);
  });

  it('should return 400 for a year outside the accepted range', async () => {
    const response = await GET_LIST(createMockRequest('http://localhost:3000/api/fiscal/assets?year=1799') as never);

    expect(response.status).toBe(400);
    expect(mockGetFixedAssets).not.toHaveBeenCalled();
  });
});

// ── POST /api/fiscal/assets ──

describe('POST /api/fiscal/assets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateFixedAsset.mockResolvedValue(LENOVO);
  });

  it('should convert the base from euros to cents and keep the in-service date a calendar day', async () => {
    const response = await POST(createMockRequest('http://localhost:3000/api/fiscal/assets', validBody()) as never);

    expect(response.status).toBe(201);
    expect(mockCreateFixedAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        baseCents: 71818,
        inServiceDate: '2025-11-28',
        coefficientPercent: 52,
        amortizationGroup: 5,
        modelo100CasillaCode: MODELO_100_CASILLA.C0208,
      }),
    );
  });

  it('should never let a float reach the repository as the base', async () => {
    await POST(createMockRequest('http://localhost:3000/api/fiscal/assets', validBody()) as never);

    const { baseCents } = mockCreateFixedAsset.mock.calls[0][0];
    expect(Number.isInteger(baseCents)).toBe(true);
  });

  it('should store an omitted optional as null rather than undefined', async () => {
    const body = validBody();
    delete body.amortizationGroup;
    delete body.transactionId;
    delete body.notes;

    await POST(createMockRequest('http://localhost:3000/api/fiscal/assets', body) as never);

    expect(mockCreateFixedAsset).toHaveBeenCalledWith(
      expect.objectContaining({ amortizationGroup: null, transactionId: null, notes: null }),
    );
  });

  it('should accept the ERD-doubled rate of the grupo (52% on a grupo 5)', async () => {
    const response = await POST(
      createMockRequest('http://localhost:3000/api/fiscal/assets', validBody({ coefficientPercent: 52 })) as never,
    );

    expect(response.status).toBe(201);
  });

  it('should reject a rate above the doubled maximum of its grupo (60% on a grupo 5)', async () => {
    const response = await POST(
      createMockRequest('http://localhost:3000/api/fiscal/assets', validBody({ coefficientPercent: 60 })) as never,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errors.coefficientPercent).toContain(VALIDATION_KEY.INVALID_AMORTIZATION_COEFFICIENT);
    expect(mockCreateFixedAsset).not.toHaveBeenCalled();
  });

  it('should allow a rate the tabla does not reach when no grupo is declared', async () => {
    const response = await POST(
      createMockRequest(
        'http://localhost:3000/api/fiscal/assets',
        validBody({ amortizationGroup: null, coefficientPercent: 100 }),
      ) as never,
    );

    // Libertad de amortización (art. 102 LIS) is recorded as a custom rate with no group
    expect(response.status).toBe(201);
  });

  it('should reject a casilla that is not one of the two amortization boxes', async () => {
    const response = await POST(
      createMockRequest(
        'http://localhost:3000/api/fiscal/assets',
        validBody({ modelo100CasillaCode: MODELO_100_CASILLA.C0202 }),
      ) as never,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errors.modelo100CasillaCode).toContain(VALIDATION_KEY.INVALID_MODELO_100_CASILLA);
    expect(mockCreateFixedAsset).not.toHaveBeenCalled();
  });

  it.each([
    ['a base of zero', { baseAmount: 0 }],
    ['a negative base', { baseAmount: -718.18 }],
    ['an empty description', { description: '   ' }],
    ['a grupo outside the tabla', { amortizationGroup: 11 }],
    ['a rate of zero', { amortizationGroup: null, coefficientPercent: 0 }],
  ])('should return 400 for %s', async (_case, overrides) => {
    const response = await POST(
      createMockRequest('http://localhost:3000/api/fiscal/assets', validBody(overrides)) as never,
    );

    expect(response.status).toBe(400);
    expect(mockCreateFixedAsset).not.toHaveBeenCalled();
  });
});

// ── GET /api/fiscal/assets/[id] ──

describe('GET /api/fiscal/assets/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetFixedAssetById.mockResolvedValue(LENOVO);
  });

  it('should return the asset with a schedule that exhausts its base', async () => {
    const response = await GET_ONE(createMockRequest('http://localhost:3000') as never, context('1') as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.asset).toEqual(LENOVO);
    // 34,79 € (34 days of 2025) + 373,45 € + 309,94 € — the last year takes the remainder
    expect(body.data.years.map((year: { cents: number }) => year.cents)).toEqual([3479, 37345, 30994]);
    expect(body.data.years.reduce((sum: number, year: { cents: number }) => sum + year.cents, 0)).toBe(
      LENOVO.baseCents,
    );
  });

  it('should return 404 for an asset of another user', async () => {
    mockGetFixedAssetById.mockResolvedValue(null);

    const response = await GET_ONE(createMockRequest('http://localhost:3000') as never, context('99') as never);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe(API_ERROR.NOT_FOUND.FIXED_ASSET);
  });

  it('should return 400 for a non-numeric id', async () => {
    const response = await GET_ONE(createMockRequest('http://localhost:3000') as never, context('abc') as never);

    expect(response.status).toBe(400);
    expect(mockGetFixedAssetById).not.toHaveBeenCalled();
  });
});

// ── PUT /api/fiscal/assets/[id] ──

describe('PUT /api/fiscal/assets/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetFixedAssetById.mockResolvedValue(LENOVO);
    mockUpdateFixedAsset.mockResolvedValue(LENOVO);
  });

  it('should convert an updated base to cents and leave omitted fields undefined', async () => {
    const response = await PUT(
      createMockRequest('http://localhost:3000', { baseAmount: 800 }) as never,
      context('1') as never,
    );

    expect(response.status).toBe(200);
    expect(mockUpdateFixedAsset).toHaveBeenCalledWith(1, { baseCents: 80000 });
  });

  it('should re-check the rate against the STORED grupo when the payload carries only the rate', async () => {
    // The schema sees `{ coefficientPercent: 60 }` alone and cannot object; the stored asset is a
    // grupo 5, whose ERD ceiling is 52%. Without the route's re-check this over-deducts every year.
    const response = await PUT(
      createMockRequest('http://localhost:3000', { coefficientPercent: 60 }) as never,
      context('1') as never,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errors.coefficientPercent).toContain(VALIDATION_KEY.INVALID_AMORTIZATION_COEFFICIENT);
    expect(mockUpdateFixedAsset).not.toHaveBeenCalled();
  });

  it('should accept a rate that still fits the stored grupo', async () => {
    const response = await PUT(
      createMockRequest('http://localhost:3000', { coefficientPercent: 26 }) as never,
      context('1') as never,
    );

    expect(response.status).toBe(200);
    expect(mockUpdateFixedAsset).toHaveBeenCalledWith(1, { coefficientPercent: 26 });
  });

  it('should let an explicit null grupo lift the cap in the same payload', async () => {
    const response = await PUT(
      createMockRequest('http://localhost:3000', { amortizationGroup: null, coefficientPercent: 60 }) as never,
      context('1') as never,
    );

    // Clearing the group says the rate no longer comes from the tabla, so nothing caps it
    expect(response.status).toBe(200);
    expect(mockUpdateFixedAsset).toHaveBeenCalledWith(1, { amortizationGroup: null, coefficientPercent: 60 });
  });

  it('should check a new grupo against the rate already stored', async () => {
    // Grupo 2 caps at 10% doubled to 20%; the stored 52% no longer fits
    const response = await PUT(
      createMockRequest('http://localhost:3000', { amortizationGroup: 2 }) as never,
      context('1') as never,
    );

    expect(response.status).toBe(400);
    expect(mockUpdateFixedAsset).not.toHaveBeenCalled();
  });

  it('should return 404 before validating ownership-dependent state', async () => {
    mockGetFixedAssetById.mockResolvedValue(null);

    const response = await PUT(
      createMockRequest('http://localhost:3000', { coefficientPercent: 26 }) as never,
      context('99') as never,
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe(API_ERROR.NOT_FOUND.FIXED_ASSET);
    expect(mockUpdateFixedAsset).not.toHaveBeenCalled();
  });
});

// ── DELETE /api/fiscal/assets/[id] ──

describe('DELETE /api/fiscal/assets/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteFixedAsset.mockResolvedValue(true);
  });

  it('should delete the asset of the current user', async () => {
    const response = await DELETE(createMockRequest('http://localhost:3000') as never, context('1') as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.deleted).toBe(true);
    expect(mockDeleteFixedAsset).toHaveBeenCalledWith(1);
  });

  it('should return 404 when nothing was deleted', async () => {
    mockDeleteFixedAsset.mockResolvedValue(false);

    const response = await DELETE(createMockRequest('http://localhost:3000') as never, context('99') as never);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe(API_ERROR.NOT_FOUND.FIXED_ASSET);
  });
});
