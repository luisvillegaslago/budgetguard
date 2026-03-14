/**
 * Integration tests for fiscal deadlines API routes.
 * Tests GET deadlines (server-computed) and GET/PUT settings.
 */

import { FILING_STATUS } from '@/constants/finance';
import type { FiscalDeadlineSettings } from '@/types/finance';

// ============================================================
// Mock Data
// ============================================================

const mockSettings: FiscalDeadlineSettings = {
  reminderDaysBefore: 7,
  postponementReminder: true,
  isActive: true,
};

const mockFiledSet = new Set(['303-2025-1', '130-2025-1']);

let capturedSettings: FiscalDeadlineSettings | null = null;

// ============================================================
// Mocks
// ============================================================

jest.mock('@/services/database/FiscalDocumentRepository', () => ({
  getDeadlineSettings: jest.fn(async () => mockSettings),
  getFiledModelos: jest.fn(async () => mockFiledSet),
  upsertDeadlineSettings: jest.fn(async (input: FiscalDeadlineSettings) => {
    capturedSettings = input;
    return input;
  }),
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
// Import routes AFTER mocks
// ============================================================

import { GET as GET_DEADLINES } from '@/app/api/fiscal/deadlines/route';
import { GET as GET_SETTINGS, PUT as PUT_SETTINGS } from '@/app/api/fiscal/deadlines/settings/route';

// ============================================================
// Helpers
// ============================================================

function createMockRequest(
  url: string,
  body?: Record<string, unknown>,
): {
  url: string;
  json: () => Promise<Record<string, unknown>>;
} {
  return { url, json: async () => body ?? {} };
}

// ============================================================
// Tests
// ============================================================

describe('GET /api/fiscal/deadlines', () => {
  it('should return all deadlines for a year', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/deadlines?year=2025');
    const response = await GET_DEADLINES(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(10); // 4×303 + 4×130 + 390 + 100
  });

  it('should mark filed modelos as FILED', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/deadlines?year=2025');
    const response = await GET_DEADLINES(request as never);
    const data = await response.json();

    const q1_303 = data.data.find(
      (d: { modeloType: string; fiscalQuarter: number }) => d.modeloType === '303' && d.fiscalQuarter === 1,
    );
    const q1_130 = data.data.find(
      (d: { modeloType: string; fiscalQuarter: number }) => d.modeloType === '130' && d.fiscalQuarter === 1,
    );

    expect(q1_303.status).toBe(FILING_STATUS.FILED);
    expect(q1_303.isFiled).toBe(true);
    expect(q1_130.status).toBe(FILING_STATUS.FILED);
  });

  it('should return only active deadlines when active=true', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/deadlines?year=2025&active=true');
    const response = await GET_DEADLINES(request as never);
    const data = await response.json();

    // All active deadlines should be upcoming, due, or overdue
    expect(
      data.data.every(
        (d: { status: string }) =>
          d.status === FILING_STATUS.UPCOMING || d.status === FILING_STATUS.DUE || d.status === FILING_STATUS.OVERDUE,
      ),
    ).toBe(true);
  });

  it('should include meta with year and reminderDaysBefore', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/deadlines?year=2025');
    const response = await GET_DEADLINES(request as never);
    const data = await response.json();

    expect(data.meta.year).toBe(2025);
    expect(data.meta.reminderDaysBefore).toBe(7);
  });

  it('should default to current year if not provided', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/deadlines');
    const response = await GET_DEADLINES(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.meta.year).toBe(new Date().getFullYear());
  });
});

describe('GET /api/fiscal/deadlines/settings', () => {
  it('should return deadline settings', async () => {
    const response = await GET_SETTINGS();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.reminderDaysBefore).toBe(7);
    expect(data.data.postponementReminder).toBe(true);
    expect(data.data.isActive).toBe(true);
  });
});

describe('PUT /api/fiscal/deadlines/settings', () => {
  beforeEach(() => {
    capturedSettings = null;
  });

  it('should update deadline settings', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/deadlines/settings', {
      reminderDaysBefore: 14,
      postponementReminder: false,
      isActive: true,
    });
    const response = await PUT_SETTINGS(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(capturedSettings?.reminderDaysBefore).toBe(14);
    expect(capturedSettings?.postponementReminder).toBe(false);
  });

  it('should apply defaults for missing fields', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/deadlines/settings', {});
    const response = await PUT_SETTINGS(request as never);

    expect(response.status).toBe(200);
    expect(capturedSettings?.reminderDaysBefore).toBe(7);
    expect(capturedSettings?.postponementReminder).toBe(true);
    expect(capturedSettings?.isActive).toBe(true);
  });

  it('should reject invalid reminderDaysBefore', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal/deadlines/settings', {
      reminderDaysBefore: 0,
    });
    const response = await PUT_SETTINGS(request as never);

    expect(response.status).toBe(400);
  });
});
