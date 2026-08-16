/**
 * Integration Tests: Annual Fiscal Profile API
 * Tests GET/PUT /api/fiscal/profile
 *
 * The wire contract is the point: contributions travel in EUROS and reach the repository in
 * CENTS, one field per bucket, because each bucket carries its own legal ceiling.
 */

import { API_ERROR } from '@/constants/finance';
import type { FiscalProfile, FiscalProfileInput } from '@/types/finance';

// ── Mocks ──

const mockGetFiscalProfile = jest.fn();
const mockUpsertFiscalProfile = jest.fn();

jest.mock('@/services/database/FiscalProfileRepository', () => ({
  getFiscalProfile: (year: number) => mockGetFiscalProfile(year),
  upsertFiscalProfile: (year: number, input: FiscalProfileInput) => mockUpsertFiscalProfile(year, input),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { GET, PUT } from '@/app/api/fiscal/profile/route';

// ── Helpers ──

/** The user's real 2025 profile: 1.500 € individual + 4.250 € plan de empleo. */
const SAVED_PROFILE: FiscalProfile = {
  fiscalYear: 2025,
  pensionIndividualCents: 150_000,
  pensionEmploymentCents: 425_000,
  vatPoolOpeningCents: 114_452,
};

function createMockRequest(url: string, body?: Record<string, unknown>) {
  return { url, json: async () => body ?? {} };
}

// ── GET ──

describe('GET /api/fiscal/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetFiscalProfile.mockResolvedValue(SAVED_PROFILE);
  });

  it('should return the profile of the requested year', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/profile?year=2025');
    const response = await GET(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(SAVED_PROFILE);
    expect(mockGetFiscalProfile).toHaveBeenCalledWith(2025);
  });

  it('should return a zeroed profile for a year never saved', async () => {
    mockGetFiscalProfile.mockResolvedValue({
      fiscalYear: 2027,
      pensionIndividualCents: 0,
      pensionEmploymentCents: 0,
    });

    const request = createMockRequest('http://localhost:3000/api/fiscal/profile?year=2027');
    const response = await GET(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.pensionIndividualCents).toBe(0);
    expect(body.data.pensionEmploymentCents).toBe(0);
  });

  it('should return 400 for a missing year', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/profile');
    const response = await GET(request as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(mockGetFiscalProfile).not.toHaveBeenCalled();
  });

  it('should return 400 for a year outside the supported range', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/profile?year=1999');
    const response = await GET(request as never);

    expect(response.status).toBe(400);
    expect(mockGetFiscalProfile).not.toHaveBeenCalled();
  });

  it('should return 500 when the repository throws', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockGetFiscalProfile.mockRejectedValue(new Error('Database connection failed'));

    const request = createMockRequest('http://localhost:3000/api/fiscal/profile?year=2025');
    const response = await GET(request as never);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe(API_ERROR.INTERNAL);
    consoleSpy.mockRestore();
  });
});

// ── PUT ──

describe('PUT /api/fiscal/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsertFiscalProfile.mockImplementation(async (year: number, input: FiscalProfileInput) => ({
      fiscalYear: year,
      ...input,
    }));
  });

  it('should convert both contributions from euros to cents', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/profile', {
      fiscalYear: 2025,
      pensionIndividual: 1500,
      pensionEmployment: 4250,
    });
    const response = await PUT(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockUpsertFiscalProfile).toHaveBeenCalledWith(2025, {
      pensionIndividualCents: 150_000,
      pensionEmploymentCents: 425_000,
      vatPoolOpeningCents: undefined,
    });
    expect(body.data).toEqual({ ...SAVED_PROFILE, vatPoolOpeningCents: undefined });
  });

  it('should keep the decimals of a contribution', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/profile', {
      fiscalYear: 2026,
      pensionIndividual: 1500.55,
      pensionEmployment: 0,
    });
    await PUT(request as never);

    expect(mockUpsertFiscalProfile).toHaveBeenCalledWith(2026, {
      pensionIndividualCents: 150_055,
      pensionEmploymentCents: 0,
      vatPoolOpeningCents: undefined,
    });
  });

  it('should accept zero in both buckets', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/profile', {
      fiscalYear: 2026,
      pensionIndividual: 0,
      pensionEmployment: 0,
    });
    const response = await PUT(request as never);

    expect(response.status).toBe(200);
    expect(mockUpsertFiscalProfile).toHaveBeenCalledWith(2026, {
      pensionIndividualCents: 0,
      pensionEmploymentCents: 0,
      vatPoolOpeningCents: undefined,
    });
  });

  it('should store an over-the-limit contribution as typed, leaving the cap to the projection', async () => {
    // What was paid in is a fact; how much of it reduces the base is a computation
    const request = createMockRequest('http://localhost:3000/api/fiscal/profile', {
      fiscalYear: 2026,
      pensionIndividual: 5750,
      pensionEmployment: 0,
    });
    const response = await PUT(request as never);

    expect(response.status).toBe(200);
    expect(mockUpsertFiscalProfile).toHaveBeenCalledWith(2026, {
      pensionIndividualCents: 575_000,
      pensionEmploymentCents: 0,
      vatPoolOpeningCents: undefined,
    });
  });

  it('should answer in cents even though the request travelled in euros', async () => {
    // The wire is asymmetric on purpose: euros in (what the user typed), cents out (what is
    // stored and what the projection will read). A symmetric response would need a second
    // conversion in the client and reopen the floating-point door the whole app keeps shut.
    const request = createMockRequest('http://localhost:3000/api/fiscal/profile', {
      fiscalYear: 2025,
      pensionIndividual: 1500,
      pensionEmployment: 4250,
    });
    const response = await PUT(request as never);
    const body = await response.json();

    expect(body.data.pensionIndividualCents).toBe(150_000);
    expect(body.data.pensionEmploymentCents).toBe(425_000);
    expect(body.data).not.toHaveProperty('pensionIndividual');
  });

  it('should return 400 for a non-numeric contribution', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/profile', {
      fiscalYear: 2026,
      pensionIndividual: '1.500 €',
      pensionEmployment: 0,
    });
    const response = await PUT(request as never);

    expect(response.status).toBe(400);
    expect(mockUpsertFiscalProfile).not.toHaveBeenCalled();
  });

  it('should return 400 for a year outside the supported range', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/profile', {
      fiscalYear: 1999,
      pensionIndividual: 1500,
      pensionEmployment: 0,
    });
    const response = await PUT(request as never);

    expect(response.status).toBe(400);
    expect(mockUpsertFiscalProfile).not.toHaveBeenCalled();
  });

  it('should return 400 for a negative contribution', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/profile', {
      fiscalYear: 2026,
      pensionIndividual: -1,
      pensionEmployment: 0,
    });
    const response = await PUT(request as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(mockUpsertFiscalProfile).not.toHaveBeenCalled();
  });

  it('should return 400 for a contribution above the sanity ceiling', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/profile', {
      fiscalYear: 2026,
      pensionIndividual: 999_999_999,
      pensionEmployment: 0,
    });
    const response = await PUT(request as never);

    expect(response.status).toBe(400);
    expect(mockUpsertFiscalProfile).not.toHaveBeenCalled();
  });

  it('should accept a partial write and leave the omitted figures alone', async () => {
    // Two cards edit this row — the pension contributions and the IVA pool — so a write may
    // legitimately carry one field. `undefined` reaches the repository as "keep what is stored",
    // which is the difference between correcting one figure and wiping the other.
    const request = createMockRequest('http://localhost:3000/api/fiscal/profile', {
      fiscalYear: 2026,
      vatPoolOpening: 1144.52,
    });
    const response = await PUT(request as never);

    expect(response.status).toBe(200);
    expect(mockUpsertFiscalProfile).toHaveBeenCalledWith(2026, {
      pensionIndividualCents: undefined,
      pensionEmploymentCents: undefined,
      vatPoolOpeningCents: 114_452,
    });
  });

  it('should return 400 when the year is missing', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/profile', {
      pensionIndividual: 1500,
      pensionEmployment: 4250,
    });
    const response = await PUT(request as never);

    expect(response.status).toBe(400);
    expect(mockUpsertFiscalProfile).not.toHaveBeenCalled();
  });

  it('should return 500 when the repository throws', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockUpsertFiscalProfile.mockRejectedValue(new Error('Database connection failed'));

    const request = createMockRequest('http://localhost:3000/api/fiscal/profile', {
      fiscalYear: 2026,
      pensionIndividual: 1500,
      pensionEmployment: 1000,
    });
    const response = await PUT(request as never);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe(API_ERROR.INTERNAL);
    consoleSpy.mockRestore();
  });
});
