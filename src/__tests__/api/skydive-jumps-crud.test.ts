/**
 * Integration Tests: Skydiving Jumps API
 * Tests GET/POST /api/skydiving/jumps, GET/PUT/DELETE /api/skydiving/jumps/[id],
 * POST /api/skydiving/jumps/import, GET /api/skydiving/stats,
 * and GET /api/skydiving/categories
 */

import { TRANSACTION_TYPE } from '@/constants/finance';
import type { Category } from '@/types/finance';
import type { ImportResult, SkydiveJump, SkydiveStats } from '@/types/skydive';

// Captured data for write assertions
let capturedCreateData: Record<string, unknown> | null = null;
let capturedUpdateData: { jumpId: number; data: Record<string, unknown> } | null = null;
let capturedBulkRows: unknown[] | null = null;

const mockJump: SkydiveJump = {
  jumpId: 1,
  jumpNumber: 42,
  title: null,
  jumpDate: '2025-06-15',
  dropzone: 'Skydive Madrid',
  canopy: 'Sabre3 170',
  wingsuit: null,
  freefallTimeSec: 55,
  jumpType: 'Belly',
  aircraft: 'Cessna 208',
  exitAltitudeFt: 15000,
  landingDistanceM: null,
  comment: null,
  priceCents: null,
  transactionId: null,
  createdAt: '2025-06-15T10:00:00.000Z',
  updatedAt: '2025-06-15T10:00:00.000Z',
};

const mockStats: SkydiveStats = {
  totalJumps: 149,
  totalFreefallSec: 5400,
  uniqueDropzones: 8,
  lastJumpDate: '2025-06-15',
  totalTunnelSec: 3600,
  totalTunnelSessions: 30,
  totalCostCents: 150000,
  jumpsByType: [
    { jumpType: 'Belly', count: 80, totalFreefallSec: 3000 },
    { jumpType: 'Freefly', count: 69, totalFreefallSec: 2400 },
  ],
  jumpsByYear: [
    { year: 2025, count: 42, totalFreefallSec: 1800 },
    { year: 2024, count: 107, totalFreefallSec: 3600 },
  ],
};

const mockImportResult: ImportResult = {
  inserted: 5,
  skipped: 2,
  total: 7,
};

const mockCategories: Category[] = [
  {
    categoryId: 30,
    name: 'Saltos',
    type: TRANSACTION_TYPE.EXPENSE,
    icon: 'cloud',
    color: '#3B82F6',
    sortOrder: 0,
    isActive: true,
    parentCategoryId: 20,
    defaultShared: false,
    defaultVatPercent: null,
    defaultDeductionPercent: null,
  },
  {
    categoryId: 31,
    name: 'Túnel',
    type: TRANSACTION_TYPE.EXPENSE,
    icon: 'wind',
    color: '#8B5CF6',
    sortOrder: 1,
    isActive: true,
    parentCategoryId: 20,
    defaultShared: false,
    defaultVatPercent: null,
    defaultDeductionPercent: null,
  },
];

// Mock the SkydiveRepository
jest.mock('@/services/database/SkydiveRepository', () => ({
  getAllJumps: jest.fn(async () => ({ items: [mockJump], total: 1, page: 1, limit: 50, totalPages: 1 })),
  getJumpById: jest.fn(async (id: number) => {
    if (id === 1) return mockJump;
    return null;
  }),
  createJump: jest.fn(async (data: Record<string, unknown>) => {
    capturedCreateData = data;
    return { ...mockJump, ...data };
  }),
  updateJump: jest.fn(async (jumpId: number, data: Record<string, unknown>) => {
    capturedUpdateData = { jumpId, data };
    if (jumpId === 1) return { ...mockJump, ...data };
    return null;
  }),
  deleteJump: jest.fn(async () => true),
  bulkCreateJumps: jest.fn(async (rows: unknown[]) => {
    capturedBulkRows = rows;
    return { ...mockImportResult, total: rows.length, inserted: rows.length, skipped: 0 };
  }),
  getSkydiveStats: jest.fn(async () => mockStats),
  getSkydiveCategories: jest.fn(async () => mockCategories),
}));

// Mock NextResponse
jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { GET as GET_CATEGORIES } from '@/app/api/skydiving/categories/route';
import { DELETE as DELETE_JUMP, GET as GET_JUMP, PUT as PUT_JUMP } from '@/app/api/skydiving/jumps/[id]/route';
import { POST as POST_IMPORT } from '@/app/api/skydiving/jumps/import/route';
// Import AFTER mocking
import { GET as GET_JUMPS, POST as POST_JUMP } from '@/app/api/skydiving/jumps/route';
import { GET as GET_STATS } from '@/app/api/skydiving/stats/route';

// Helpers
function createMockRequest(body: Record<string, unknown>): {
  url: string;
  json: () => Promise<Record<string, unknown>>;
} {
  return {
    url: 'http://localhost:3000/api/skydiving/jumps',
    json: async () => body,
  };
}

function createMockGetRequest(params?: { year?: number; dropzone?: string }): {
  nextUrl: URL;
  url: string;
} {
  const url = new URL('http://localhost:3000/api/skydiving/jumps');
  if (params?.year) url.searchParams.set('year', String(params.year));
  if (params?.dropzone) url.searchParams.set('dropzone', params.dropzone);
  return { nextUrl: url, url: url.toString() };
}

function createMockParams(id: string): { params: Promise<{ id: string }> } {
  return {
    params: Promise.resolve({ id }),
  };
}

// ============================
// GET /api/skydiving/jumps
// ============================
describe('GET /api/skydiving/jumps', () => {
  it('should return all jumps with count metadata', async () => {
    const request = createMockGetRequest();
    const response = await GET_JUMPS(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.meta.count).toBe(1);
    expect(data.data[0].jumpId).toBe(1);
    expect(data.data[0].jumpNumber).toBe(42);
    expect(data.data[0].dropzone).toBe('Skydive Madrid');
  });

  it('should pass year filter from query params', async () => {
    const request = createMockGetRequest({ year: 2025 });
    const response = await GET_JUMPS(request as never);

    expect(response.status).toBe(200);
  });

  it('should pass dropzone filter from query params', async () => {
    const request = createMockGetRequest({ dropzone: 'Skydive Madrid' });
    const response = await GET_JUMPS(request as never);

    expect(response.status).toBe(200);
  });

  it('should pass both year and dropzone filters', async () => {
    const request = createMockGetRequest({ year: 2025, dropzone: 'Skydive Madrid' });
    const response = await GET_JUMPS(request as never);

    expect(response.status).toBe(200);
  });
});

// ============================
// POST /api/skydiving/jumps
// ============================
describe('POST /api/skydiving/jumps', () => {
  beforeEach(() => {
    capturedCreateData = null;
  });

  it('should create a jump with valid data', async () => {
    const request = createMockRequest({
      jumpNumber: 43,
      jumpDate: '2025-07-01',
      dropzone: 'Skydive Empuriabrava',
      canopy: 'Sabre3 170',
      freefallTimeSec: 60,
      jumpType: 'Freefly',
      aircraft: 'Cessna 208',
      exitAltitudeFt: 15000,
    });
    const response = await POST_JUMP(request as never);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(capturedCreateData).not.toBeNull();
    expect(capturedCreateData!.jumpNumber).toBe(43);
  });

  it('should create a jump with only required fields', async () => {
    const request = createMockRequest({
      jumpNumber: 44,
      jumpDate: '2025-07-02',
    });
    const response = await POST_JUMP(request as never);

    expect(response.status).toBe(201);
    expect(capturedCreateData!.jumpNumber).toBe(44);
  });

  it('should reject missing jumpNumber', async () => {
    const request = createMockRequest({
      jumpDate: '2025-07-01',
    });
    const response = await POST_JUMP(request as never);

    expect(response.status).toBe(400);
  });

  it('should reject missing jumpDate', async () => {
    const request = createMockRequest({
      jumpNumber: 43,
    });
    const response = await POST_JUMP(request as never);

    expect(response.status).toBe(400);
  });

  it('should reject negative jumpNumber', async () => {
    const request = createMockRequest({
      jumpNumber: -1,
      jumpDate: '2025-07-01',
    });
    const response = await POST_JUMP(request as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.errors).toBeDefined();
  });

  it('should reject invalid date format', async () => {
    const request = createMockRequest({
      jumpNumber: 43,
      jumpDate: 'not-a-date',
    });
    const response = await POST_JUMP(request as never);

    expect(response.status).toBe(400);
  });
});

// ============================
// GET /api/skydiving/jumps/[id]
// ============================
describe('GET /api/skydiving/jumps/[id]', () => {
  it('should return jump detail for valid ID', async () => {
    const request = createMockRequest({});
    const response = await GET_JUMP(request as never, createMockParams('1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.jumpId).toBe(1);
    expect(data.data.jumpNumber).toBe(42);
    expect(data.data.dropzone).toBe('Skydive Madrid');
    expect(data.data.canopy).toBe('Sabre3 170');
  });

  it('should return 404 for non-existent jump', async () => {
    const request = createMockRequest({});
    const response = await GET_JUMP(request as never, createMockParams('999'));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
  });

  it('should return 400 for invalid ID', async () => {
    const request = createMockRequest({});
    const response = await GET_JUMP(request as never, createMockParams('abc'));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });
});

// ============================
// PUT /api/skydiving/jumps/[id]
// ============================
describe('PUT /api/skydiving/jumps/[id]', () => {
  beforeEach(() => {
    capturedUpdateData = null;
  });

  it('should update jump with valid data', async () => {
    const request = createMockRequest({
      dropzone: 'Skydive Empuriabrava',
      jumpType: 'Freefly',
    });
    const response = await PUT_JUMP(request as never, createMockParams('1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(capturedUpdateData).not.toBeNull();
    expect(capturedUpdateData!.jumpId).toBe(1);
    expect(capturedUpdateData!.data.dropzone).toBe('Skydive Empuriabrava');
  });

  it('should return 404 for non-existent jump', async () => {
    const request = createMockRequest({ jumpType: 'Belly' });
    const response = await PUT_JUMP(request as never, createMockParams('999'));

    expect(response.status).toBe(404);
  });

  it('should return 400 for invalid ID', async () => {
    const request = createMockRequest({ jumpType: 'Belly' });
    const response = await PUT_JUMP(request as never, createMockParams('abc'));

    expect(response.status).toBe(400);
  });

  it('should reject negative freefallTimeSec', async () => {
    const request = createMockRequest({ freefallTimeSec: -10 });
    const response = await PUT_JUMP(request as never, createMockParams('1'));

    expect(response.status).toBe(400);
  });
});

// ============================
// DELETE /api/skydiving/jumps/[id]
// ============================
describe('DELETE /api/skydiving/jumps/[id]', () => {
  it('should delete an existing jump', async () => {
    const request = createMockRequest({});
    const response = await DELETE_JUMP(request as never, createMockParams('1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should return 400 for invalid ID', async () => {
    const request = createMockRequest({});
    const response = await DELETE_JUMP(request as never, createMockParams('abc'));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });
});

// ============================
// POST /api/skydiving/jumps/import
// ============================
describe('POST /api/skydiving/jumps/import', () => {
  beforeEach(() => {
    capturedBulkRows = null;
  });

  it('should import valid rows successfully', async () => {
    const request = createMockRequest({
      rows: [
        { jumpNumber: 1, jumpDate: '2025-01-10', dropzone: 'Skydive Madrid', jumpType: 'Belly' },
        { jumpNumber: 2, jumpDate: '2025-02-15', dropzone: 'Empuriabrava', jumpType: 'Freefly' },
      ],
    });
    const response = await POST_IMPORT(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.inserted).toBe(2);
    expect(data.data.total).toBe(2);
    expect(data.data.validationErrors).toHaveLength(0);
    expect(capturedBulkRows).toHaveLength(2);
  });

  it('should return 400 for empty rows array', async () => {
    const request = createMockRequest({ rows: [] });
    const response = await POST_IMPORT(request as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('At least one row is required');
  });

  it('should return 400 when rows is missing', async () => {
    const request = createMockRequest({});
    const response = await POST_IMPORT(request as never);

    expect(response.status).toBe(400);
  });

  it('should report validation errors for invalid rows while importing valid ones', async () => {
    const request = createMockRequest({
      rows: [
        { jumpNumber: 1, jumpDate: '2025-01-10' },
        { jumpNumber: -1, jumpDate: 'invalid-date' },
        { jumpNumber: 3, jumpDate: '2025-03-20' },
      ],
    });
    const response = await POST_IMPORT(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    // At least one valid row should be imported, invalid ones reported
    expect(data.data.validationErrors.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================
// GET /api/skydiving/stats
// ============================
describe('GET /api/skydiving/stats', () => {
  it('should return aggregated skydiving statistics', async () => {
    const response = await GET_STATS();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.totalJumps).toBe(149);
    expect(data.data.totalFreefallSec).toBe(5400);
    expect(data.data.uniqueDropzones).toBe(8);
    expect(data.data.lastJumpDate).toBe('2025-06-15');
    expect(data.data.totalTunnelSec).toBe(3600);
    expect(data.data.totalTunnelSessions).toBe(30);
    expect(data.data.jumpsByType).toHaveLength(2);
    expect(data.data.jumpsByYear).toHaveLength(2);
  });
});

// ============================
// GET /api/skydiving/categories
// ============================
describe('GET /api/skydiving/categories', () => {
  it('should return Paracaidismo subcategories', async () => {
    const response = await GET_CATEGORIES();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(2);
    expect(data.data[0].name).toBe('Saltos');
    expect(data.data[1].name).toBe('Túnel');
    expect(data.data[0].parentCategoryId).toBe(20);
  });
});
