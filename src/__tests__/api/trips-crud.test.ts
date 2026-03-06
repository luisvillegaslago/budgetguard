/**
 * Integration Tests: Trip CRUD API
 * Tests GET/POST /api/trips, GET/PATCH/DELETE /api/trips/[id],
 * and GET /api/trips/categories
 */

import { TRANSACTION_TYPE } from '@/constants/finance';
import type { Trip, TripDetail, TripDisplay } from '@/types/finance';

// Captured data for assertions
let capturedCreateName: string | null = null;
let capturedUpdateData: { tripId: number; name: string } | null = null;
let capturedDeleteId: number | null = null;

const mockTrip: Trip = {
  tripId: 1,
  name: 'Sierra Nevada 2025',
  createdAt: '2025-10-01T10:00:00.000Z',
  updatedAt: '2025-10-01T10:00:00.000Z',
};

const mockTripDisplay: TripDisplay = {
  ...mockTrip,
  expenseCount: 3,
  totalCents: 21250,
  startDate: '2025-10-15',
  endDate: '2025-10-17',
  categorySummary: [
    {
      categoryId: 15,
      categoryName: 'Hotel',
      categoryIcon: 'bed',
      categoryColor: '#8B5CF6',
      totalCents: 12000,
      count: 1,
    },
  ],
};

const mockTripDetail: TripDetail = {
  ...mockTrip,
  expenses: [
    {
      transactionId: 100,
      categoryId: 15,
      category: {
        categoryId: 15,
        name: 'Hotel',
        type: TRANSACTION_TYPE.EXPENSE,
        icon: 'bed',
        color: '#8B5CF6',
        sortOrder: 0,
        isActive: true,
        parentCategoryId: 5,
        defaultShared: false,
        defaultVatPercent: null,
        defaultDeductionPercent: null,
      },
      parentCategory: { categoryId: 5, name: 'Viajes' },
      amountCents: 12000,
      description: 'Hotel 2 noches',
      transactionDate: '2025-10-15',
      type: TRANSACTION_TYPE.EXPENSE,
      sharedDivisor: 1,
      originalAmountCents: null,
      recurringExpenseId: null,
      transactionGroupId: null,
      tripId: 1,
      tripName: 'Sierra Nevada 2025',
      vatPercent: null,
      deductionPercent: null,
      vendorName: null,
      invoiceNumber: null,
      createdAt: '2025-10-15T10:00:00.000Z',
      updatedAt: '2025-10-15T10:00:00.000Z',
    },
  ],
  categorySummary: [
    {
      categoryId: 15,
      categoryName: 'Hotel',
      categoryIcon: 'bed',
      categoryColor: '#8B5CF6',
      totalCents: 12000,
      count: 1,
    },
  ],
  totalCents: 12000,
  expenseCount: 1,
};

const mockTripCategories = [
  {
    categoryId: 15,
    name: 'Hotel',
    type: TRANSACTION_TYPE.EXPENSE,
    icon: 'bed',
    color: '#8B5CF6',
    sortOrder: 0,
    isActive: true,
    parentCategoryId: 5,
    defaultShared: false,
    defaultVatPercent: null,
    defaultDeductionPercent: null,
  },
  {
    categoryId: 16,
    name: 'Gasolina',
    type: TRANSACTION_TYPE.EXPENSE,
    icon: 'fuel',
    color: '#F59E0B',
    sortOrder: 1,
    isActive: true,
    parentCategoryId: 5,
    defaultShared: false,
    defaultVatPercent: null,
    defaultDeductionPercent: null,
  },
];

// Mock the TripRepository
jest.mock('@/services/database/TripRepository', () => ({
  getAllTrips: jest.fn(async () => [mockTripDisplay]),
  getTripById: jest.fn(async (id: number) => {
    if (id === 1) return mockTripDetail;
    return null;
  }),
  createTrip: jest.fn(async (name: string) => {
    capturedCreateName = name;
    return { ...mockTrip, name };
  }),
  updateTrip: jest.fn(async (tripId: number, name: string) => {
    capturedUpdateData = { tripId, name };
    if (tripId === 1) return { ...mockTrip, name };
    return null;
  }),
  deleteTrip: jest.fn(async (tripId: number) => {
    capturedDeleteId = tripId;
    return tripId === 1;
  }),
  getTripCategories: jest.fn(async () => mockTripCategories),
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

import { DELETE as DELETE_TRIP, GET as GET_TRIP, PATCH as PATCH_TRIP } from '@/app/api/trips/[id]/route';
import { GET as GET_TRIP_CATEGORIES } from '@/app/api/trips/categories/route';
// Import after mocking
import { GET as GET_TRIPS, POST as POST_TRIP } from '@/app/api/trips/route';

// Helpers
function createMockRequest(body: Record<string, unknown>): {
  url: string;
  json: () => Promise<Record<string, unknown>>;
} {
  return {
    url: 'http://localhost:3000/api/trips',
    json: async () => body,
  };
}

function createMockParams(id: string): { params: Promise<{ id: string }> } {
  return {
    params: Promise.resolve({ id }),
  };
}

// ============================
// GET /api/trips
// ============================
describe('GET /api/trips', () => {
  it('should return all trips with count metadata', async () => {
    const response = await GET_TRIPS();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.meta.count).toBe(1);
    expect(data.data[0].tripId).toBe(1);
    expect(data.data[0].name).toBe('Sierra Nevada 2025');
    expect(data.data[0].expenseCount).toBe(3);
    expect(data.data[0].totalCents).toBe(21250);
    expect(data.data[0].categorySummary).toHaveLength(1);
  });
});

// ============================
// POST /api/trips
// ============================
describe('POST /api/trips', () => {
  beforeEach(() => {
    capturedCreateName = null;
  });

  it('should create a trip with valid name', async () => {
    const request = createMockRequest({ name: 'Madrid Weekend' });
    const response = await POST_TRIP(request as any);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.name).toBe('Madrid Weekend');
    expect(capturedCreateName).toBe('Madrid Weekend');
  });

  it('should reject empty name', async () => {
    const request = createMockRequest({ name: '' });
    const response = await POST_TRIP(request as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.errors).toBeDefined();
  });

  it('should reject missing name', async () => {
    const request = createMockRequest({});
    const response = await POST_TRIP(request as any);

    expect(response.status).toBe(400);
  });

  it('should reject name longer than 100 characters', async () => {
    const request = createMockRequest({ name: 'A'.repeat(101) });
    const response = await POST_TRIP(request as any);

    expect(response.status).toBe(400);
  });
});

// ============================
// GET /api/trips/[id]
// ============================
describe('GET /api/trips/[id]', () => {
  it('should return trip detail for valid ID', async () => {
    const request = createMockRequest({});
    const response = await GET_TRIP(request as any, createMockParams('1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.tripId).toBe(1);
    expect(data.data.name).toBe('Sierra Nevada 2025');
    expect(data.data.expenses).toHaveLength(1);
    expect(data.data.categorySummary).toHaveLength(1);
    expect(data.data.totalCents).toBe(12000);
    expect(data.data.expenseCount).toBe(1);
  });

  it('should return 404 for non-existent trip', async () => {
    const request = createMockRequest({});
    const response = await GET_TRIP(request as any, createMockParams('999'));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
  });

  it('should return 400 for invalid ID', async () => {
    const request = createMockRequest({});
    const response = await GET_TRIP(request as any, createMockParams('abc'));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });
});

// ============================
// PATCH /api/trips/[id]
// ============================
describe('PATCH /api/trips/[id]', () => {
  beforeEach(() => {
    capturedUpdateData = null;
  });

  it('should update trip name', async () => {
    const request = createMockRequest({ name: 'Sierra Nevada 2026' });
    const response = await PATCH_TRIP(request as any, createMockParams('1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.name).toBe('Sierra Nevada 2026');
    expect(capturedUpdateData).toEqual({ tripId: 1, name: 'Sierra Nevada 2026' });
  });

  it('should return 404 for non-existent trip', async () => {
    const request = createMockRequest({ name: 'Test' });
    const response = await PATCH_TRIP(request as any, createMockParams('999'));

    expect(response.status).toBe(404);
  });

  it('should return 400 for invalid ID', async () => {
    const request = createMockRequest({ name: 'Test' });
    const response = await PATCH_TRIP(request as any, createMockParams('abc'));

    expect(response.status).toBe(400);
  });

  it('should return 400 for empty name', async () => {
    const request = createMockRequest({ name: '' });
    const response = await PATCH_TRIP(request as any, createMockParams('1'));

    expect(response.status).toBe(400);
  });

  it('should return 400 when name is omitted', async () => {
    const request = createMockRequest({});
    const response = await PATCH_TRIP(request as any, createMockParams('1'));

    expect(response.status).toBe(400);
  });
});

// ============================
// DELETE /api/trips/[id]
// ============================
describe('DELETE /api/trips/[id]', () => {
  beforeEach(() => {
    capturedDeleteId = null;
  });

  it('should delete an existing trip', async () => {
    const request = createMockRequest({});
    const response = await DELETE_TRIP(request as any, createMockParams('1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.deleted).toBe(true);
    expect(capturedDeleteId).toBe(1);
  });

  it('should return 404 for non-existent trip', async () => {
    const request = createMockRequest({});
    const response = await DELETE_TRIP(request as any, createMockParams('999'));

    expect(response.status).toBe(404);
  });

  it('should return 400 for invalid ID', async () => {
    const request = createMockRequest({});
    const response = await DELETE_TRIP(request as any, createMockParams('abc'));

    expect(response.status).toBe(400);
  });
});

// ============================
// GET /api/trips/categories
// ============================
describe('GET /api/trips/categories', () => {
  it('should return Viajes subcategories', async () => {
    const response = await GET_TRIP_CATEGORIES();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(2);
    expect(data.data[0].name).toBe('Hotel');
    expect(data.data[1].name).toBe('Gasolina');
    expect(data.data[0].parentCategoryId).toBe(5);
  });
});
