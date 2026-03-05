/**
 * Integration Tests: Subcategory Summary API
 * Tests GET /api/summary/subcategories?month=YYYY-MM&categoryId=N
 */

import type { SubcategorySummary } from '@/types/finance';

const mockSubcategories: SubcategorySummary[] = [
  {
    parentCategoryId: 1,
    subcategoryId: 10,
    subcategoryName: 'Internet',
    subcategoryIcon: 'wifi',
    subcategoryColor: '#EF4444',
    isSubcategory: true,
    totalCents: 4500,
    transactionCount: 1,
  },
  {
    parentCategoryId: 1,
    subcategoryId: 11,
    subcategoryName: 'Luz',
    subcategoryIcon: 'zap',
    subcategoryColor: '#EF4444',
    isSubcategory: true,
    totalCents: 8200,
    transactionCount: 1,
  },
  {
    parentCategoryId: 1,
    subcategoryId: 1,
    subcategoryName: 'Vivienda',
    subcategoryIcon: 'home',
    subcategoryColor: '#EF4444',
    isSubcategory: false,
    totalCents: 3000,
    transactionCount: 2,
  },
];

jest.mock('@/services/database/TransactionRepository', () => ({
  getSubcategorySummary: jest.fn(async (_month: string, _parentCategoryId: number) => mockSubcategories),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { GET } from '@/app/api/summary/subcategories/route';

function createMockRequest(url: string): { url: string } {
  return { url };
}

describe('GET /api/summary/subcategories', () => {
  it('should return subcategory breakdown for a parent category', async () => {
    const request = createMockRequest('http://localhost:3000/api/summary/subcategories?month=2025-01&categoryId=1');
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(3);
    expect(data.data[0].subcategoryName).toBe('Internet');
    expect(data.data[1].subcategoryName).toBe('Luz');
    // Third entry is "General" (transactions on parent directly)
    expect(data.data[2].isSubcategory).toBe(false);
  });

  it('should return 400 when categoryId is missing', async () => {
    const request = createMockRequest('http://localhost:3000/api/summary/subcategories?month=2025-01');
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('categoryId');
  });

  it('should return 400 for invalid month format', async () => {
    const request = createMockRequest('http://localhost:3000/api/summary/subcategories?month=invalid&categoryId=1');
    const response = await GET(request as any);

    expect(response.status).toBe(400);
  });

  it('should return 400 for negative categoryId', async () => {
    const request = createMockRequest('http://localhost:3000/api/summary/subcategories?month=2025-01&categoryId=-1');
    const response = await GET(request as any);

    expect(response.status).toBe(400);
  });

  it('should return 400 for non-numeric categoryId', async () => {
    const request = createMockRequest('http://localhost:3000/api/summary/subcategories?month=2025-01&categoryId=abc');
    const response = await GET(request as any);

    expect(response.status).toBe(400);
  });

  it('should call repository with correct parameters', async () => {
    const request = createMockRequest('http://localhost:3000/api/summary/subcategories?month=2025-03&categoryId=4');
    await GET(request as any);

    const { getSubcategorySummary } = require('@/services/database/TransactionRepository');
    expect(getSubcategorySummary).toHaveBeenCalledWith('2025-03', 4);
  });
});
