/**
 * Integration Tests: Skydiving Tunnel Sessions API
 * Tests GET/POST /api/skydiving/tunnel,
 * PUT/DELETE /api/skydiving/tunnel/[id],
 * and POST /api/skydiving/tunnel/import
 */

import type { ImportResult, TunnelSession } from '@/types/skydive';

// Captured data for write assertions
let capturedCreateData: Record<string, unknown> | null = null;
let capturedUpdateData: { sessionId: number; data: Record<string, unknown> } | null = null;
let capturedBulkRows: unknown[] | null = null;

const mockSession: TunnelSession = {
  sessionId: 1,
  sessionDate: '2025-05-20',
  location: 'Madrid Fly',
  sessionType: 'Freefly',
  durationSec: 120,
  priceCents: null,
  notes: null,
  transactionId: null,
  createdAt: '2025-05-20T10:00:00.000Z',
  updatedAt: '2025-05-20T10:00:00.000Z',
};

const mockImportResult: ImportResult = {
  inserted: 3,
  skipped: 1,
  total: 4,
};

// Mock auth
jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 1),
  AuthError: class AuthError extends Error {},
}));

// Mock database connection (used by import route to find tunnel category)
jest.mock('@/services/database/connection', () => ({
  query: jest.fn(async () => [{ CategoryID: 10 }]),
}));

// Mock the SkydiveRepository
jest.mock('@/services/database/SkydiveRepository', () => ({
  getAllTunnelSessions: jest.fn(async () => [mockSession]),
  createTunnelSession: jest.fn(async (data: Record<string, unknown>) => {
    capturedCreateData = data;
    return { ...mockSession, ...data };
  }),
  updateTunnelSession: jest.fn(async (sessionId: number, data: Record<string, unknown>) => {
    capturedUpdateData = { sessionId, data };
    if (sessionId === 1) return { ...mockSession, ...data };
    return null;
  }),
  deleteTunnelSession: jest.fn(async () => true),
  bulkCreateTunnelSessions: jest.fn(async (rows: unknown[]) => {
    capturedBulkRows = rows;
    return { ...mockImportResult, total: rows.length, inserted: rows.length, skipped: 0 };
  }),
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

import { DELETE as DELETE_SESSION, PUT as PUT_SESSION } from '@/app/api/skydiving/tunnel/[id]/route';
import { POST as POST_IMPORT } from '@/app/api/skydiving/tunnel/import/route';
// Import AFTER mocking
import { GET as GET_SESSIONS, POST as POST_SESSION } from '@/app/api/skydiving/tunnel/route';

// Helpers
function createMockRequest(body: Record<string, unknown>): {
  url: string;
  json: () => Promise<Record<string, unknown>>;
} {
  return {
    url: 'http://localhost:3000/api/skydiving/tunnel',
    json: async () => body,
  };
}

function createMockGetRequest(params?: { year?: number; location?: string }): {
  nextUrl: URL;
  url: string;
} {
  const url = new URL('http://localhost:3000/api/skydiving/tunnel');
  if (params?.year) url.searchParams.set('year', String(params.year));
  if (params?.location) url.searchParams.set('location', params.location);
  return { nextUrl: url, url: url.toString() };
}

function createMockParams(id: string): { params: Promise<{ id: string }> } {
  return {
    params: Promise.resolve({ id }),
  };
}

// ============================
// GET /api/skydiving/tunnel
// ============================
describe('GET /api/skydiving/tunnel', () => {
  it('should return all tunnel sessions with count metadata', async () => {
    const request = createMockGetRequest();
    const response = await GET_SESSIONS(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.meta.count).toBe(1);
    expect(data.data[0].sessionId).toBe(1);
    expect(data.data[0].location).toBe('Madrid Fly');
    expect(data.data[0].sessionType).toBe('Freefly');
    expect(data.data[0].durationSec).toBe(120);
  });

  it('should pass year filter from query params', async () => {
    const request = createMockGetRequest({ year: 2025 });
    const response = await GET_SESSIONS(request as never);

    expect(response.status).toBe(200);
  });

  it('should pass location filter from query params', async () => {
    const request = createMockGetRequest({ location: 'Madrid Fly' });
    const response = await GET_SESSIONS(request as never);

    expect(response.status).toBe(200);
  });

  it('should pass both year and location filters', async () => {
    const request = createMockGetRequest({ year: 2025, location: 'Madrid Fly' });
    const response = await GET_SESSIONS(request as never);

    expect(response.status).toBe(200);
  });
});

// ============================
// POST /api/skydiving/tunnel
// ============================
describe('POST /api/skydiving/tunnel', () => {
  beforeEach(() => {
    capturedCreateData = null;
  });

  it('should create a tunnel session with valid data', async () => {
    const request = createMockRequest({
      sessionDate: '2025-06-01',
      location: 'Madrid Fly',
      sessionType: 'Belly',
      durationMin: 3,
      notes: 'Practice session',
    });
    const response = await POST_SESSION(request as never);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(capturedCreateData).not.toBeNull();
    expect(capturedCreateData!.durationSec).toBe(180);
  });

  it('should create a session with only required fields', async () => {
    const request = createMockRequest({
      sessionDate: '2025-06-02',
      durationMin: 1,
    });
    const response = await POST_SESSION(request as never);

    expect(response.status).toBe(201);
    expect(capturedCreateData!.durationSec).toBe(60);
  });

  it('should reject missing sessionDate', async () => {
    const request = createMockRequest({
      durationMin: 2,
    });
    const response = await POST_SESSION(request as never);

    expect(response.status).toBe(400);
  });

  it('should reject missing durationMin', async () => {
    const request = createMockRequest({
      sessionDate: '2025-06-01',
    });
    const response = await POST_SESSION(request as never);

    expect(response.status).toBe(400);
  });

  it('should reject negative durationMin', async () => {
    const request = createMockRequest({
      sessionDate: '2025-06-01',
      durationMin: -10,
    });
    const response = await POST_SESSION(request as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.errors).toBeDefined();
  });

  it('should reject zero durationMin', async () => {
    const request = createMockRequest({
      sessionDate: '2025-06-01',
      durationMin: 0,
    });
    const response = await POST_SESSION(request as never);

    expect(response.status).toBe(400);
  });

  it('should reject invalid date format', async () => {
    const request = createMockRequest({
      sessionDate: 'not-a-date',
      durationMin: 2,
    });
    const response = await POST_SESSION(request as never);

    expect(response.status).toBe(400);
  });
});

// ============================
// PUT /api/skydiving/tunnel/[id]
// ============================
describe('PUT /api/skydiving/tunnel/[id]', () => {
  beforeEach(() => {
    capturedUpdateData = null;
  });

  it('should update tunnel session with valid data', async () => {
    const request = createMockRequest({
      location: 'Barcelona Fly',
      durationMin: 4,
    });
    const response = await PUT_SESSION(request as never, createMockParams('1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(capturedUpdateData).not.toBeNull();
    expect(capturedUpdateData!.sessionId).toBe(1);
    expect(capturedUpdateData!.data.location).toBe('Barcelona Fly');
    expect(capturedUpdateData!.data.durationSec).toBe(240);
  });

  it('should return 404 for non-existent session', async () => {
    const request = createMockRequest({ durationMin: 3 });
    const response = await PUT_SESSION(request as never, createMockParams('999'));

    expect(response.status).toBe(404);
  });

  it('should return 400 for invalid ID', async () => {
    const request = createMockRequest({ durationMin: 3 });
    const response = await PUT_SESSION(request as never, createMockParams('abc'));

    expect(response.status).toBe(400);
  });

  it('should reject negative durationMin on update', async () => {
    const request = createMockRequest({ durationMin: -5 });
    const response = await PUT_SESSION(request as never, createMockParams('1'));

    expect(response.status).toBe(400);
  });
});

// ============================
// DELETE /api/skydiving/tunnel/[id]
// ============================
describe('DELETE /api/skydiving/tunnel/[id]', () => {
  it('should delete an existing tunnel session', async () => {
    const request = createMockRequest({});
    const response = await DELETE_SESSION(request as never, createMockParams('1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should return 400 for invalid ID', async () => {
    const request = createMockRequest({});
    const response = await DELETE_SESSION(request as never, createMockParams('abc'));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });
});

// ============================
// POST /api/skydiving/tunnel/import
// ============================
describe('POST /api/skydiving/tunnel/import', () => {
  beforeEach(() => {
    capturedBulkRows = null;
  });

  it('should import valid rows successfully', async () => {
    const request = createMockRequest({
      rows: [
        { sessionDate: '2025-01-10', location: 'Madrid Fly', durationSec: 120, sessionType: 'Belly' },
        { sessionDate: '2025-02-15', location: 'Barcelona Fly', durationSec: 180, sessionType: 'Freefly' },
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
    expect(data.error).toBe('No rows provided');
  });

  it('should return 400 when rows is missing', async () => {
    const request = createMockRequest({});
    const response = await POST_IMPORT(request as never);

    expect(response.status).toBe(400);
  });

  it('should report validation errors for invalid rows while importing valid ones', async () => {
    const request = createMockRequest({
      rows: [
        { sessionDate: '2025-01-10', durationSec: 120 },
        { sessionDate: 'invalid-date', durationSec: -5 },
        { sessionDate: '2025-03-20', durationSec: 60 },
      ],
    });
    const response = await POST_IMPORT(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    // At least one invalid row should be reported
    expect(data.data.validationErrors.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle all rows being invalid', async () => {
    const request = createMockRequest({
      rows: [{ sessionDate: 'bad-date', durationSec: -1 }, { durationSec: 0 }],
    });
    const response = await POST_IMPORT(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.validationErrors.length).toBeGreaterThanOrEqual(1);
  });
});
