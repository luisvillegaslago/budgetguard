/**
 * Integration Tests: IRPF Projection API
 * Tests GET /api/fiscal/projection?year=2026&projectedIncome=77237
 * Validates parameter validation, euro → cent conversion and error handling
 */

import { API_ERROR, IRPF_REGION } from '@/constants/finance';
import type { IrpfProjection } from '@/types/finance';

// ── Mock Data ──

const mockProjection: IrpfProjection = {
  fiscalYear: 2026,
  region: IRPF_REGION.MADRID,
  ytdIncomeCents: 7_723_700,
  ytdExpensesCents: 604_800,
  projectedIncomeCents: 7_723_700,
  projectedExpensesCents: 604_800,
  gastosDificilCents: 200_000,
  projectedNetIncomeCents: 6_918_900,
  modelo130PaidCents: 1_383_780,
  modelo130PaidIsEstimated: false,
  modelo130RemainingCents: 0,
  modelo130TotalCents: 1_383_780,
  retencionesCents: 0,
  estimatedIrpfCents: 2_010_345,
  provisionGapCents: 626_565,
  marginalRate: 0.43,
  monthlyProvisionCents: 167_529,
  effectiveRate: 0.2906,
  isProjectionReliable: true,
};

// ── Mocks ──

const mockGetIrpfProjection = jest.fn();

jest.mock('@/services/database/FiscalRepository', () => ({
  getIrpfProjection: (...args: [number, { projectedIncomeCents?: number }]) => mockGetIrpfProjection(...args),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { GET } from '@/app/api/fiscal/projection/route';

// ── Helpers ──

function createMockRequest(url: string): { url: string } {
  return { url };
}

// ── Tests ──

describe('GET /api/fiscal/projection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetIrpfProjection.mockResolvedValue(mockProjection);
  });

  // ── Success ──

  it('should return the projection for a valid year', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/projection?year=2026');
    const response = await GET(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(mockProjection);
  });

  it('should call the repository without an override when none is given', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/projection?year=2026');
    await GET(request as never);

    expect(mockGetIrpfProjection).toHaveBeenCalledTimes(1);
    expect(mockGetIrpfProjection).toHaveBeenCalledWith(2026, { projectedIncomeCents: undefined });
  });

  it('should convert the projectedIncome override from euros to cents', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/projection?year=2026&projectedIncome=77237');
    await GET(request as never);

    expect(mockGetIrpfProjection).toHaveBeenCalledWith(2026, { projectedIncomeCents: 7_723_700 });
  });

  it('should keep the decimals of the override', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/projection?year=2026&projectedIncome=77237.42');
    await GET(request as never);

    expect(mockGetIrpfProjection).toHaveBeenCalledWith(2026, { projectedIncomeCents: 7_723_742 });
  });

  it('should accept a zero override', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/projection?year=2026&projectedIncome=0');
    await GET(request as never);

    expect(mockGetIrpfProjection).toHaveBeenCalledWith(2026, { projectedIncomeCents: 0 });
  });

  // ── Validation ──

  it('should return 400 for a missing year parameter', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/projection');
    const response = await GET(request as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.errors).toBeDefined();
    expect(mockGetIrpfProjection).not.toHaveBeenCalled();
  });

  it('should return 400 for a year below the minimum', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/projection?year=1999');
    const response = await GET(request as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('should return 400 for a negative projectedIncome', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/projection?year=2026&projectedIncome=-1');
    const response = await GET(request as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(mockGetIrpfProjection).not.toHaveBeenCalled();
  });

  it('should return 400 for a projectedIncome above the ceiling', async () => {
    const request = createMockRequest(
      'http://localhost:3000/api/fiscal/projection?year=2026&projectedIncome=999999999999',
    );
    const response = await GET(request as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(mockGetIrpfProjection).not.toHaveBeenCalled();
  });

  it('should return 400 for a non-numeric projectedIncome', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/projection?year=2026&projectedIncome=abc');
    const response = await GET(request as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  // ── Error handling ──

  it('should return 500 when the repository throws', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockGetIrpfProjection.mockRejectedValue(new Error('Database connection failed'));

    const request = createMockRequest('http://localhost:3000/api/fiscal/projection?year=2026');
    const response = await GET(request as never);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe(API_ERROR.INTERNAL);
    consoleSpy.mockRestore();
  });
});
