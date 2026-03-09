/**
 * Integration Tests: Categories Hierarchical API
 * Tests GET /api/categories?hierarchical=true
 */

import { TRANSACTION_TYPE } from '@/constants/finance';
import type { Category } from '@/types/finance';

const mockFlatCategories: Category[] = [
  {
    categoryId: 1,
    name: 'Vivienda',
    type: TRANSACTION_TYPE.EXPENSE,
    icon: 'home',
    color: '#EF4444',
    sortOrder: 1,
    isActive: true,
    parentCategoryId: null,
    defaultShared: true,
    defaultVatPercent: null,
    defaultDeductionPercent: null,
  },
  {
    categoryId: 2,
    name: 'Salir',
    type: TRANSACTION_TYPE.EXPENSE,
    icon: 'beer',
    color: '#3B82F6',
    sortOrder: 2,
    isActive: true,
    parentCategoryId: null,
    defaultShared: false,
    defaultVatPercent: null,
    defaultDeductionPercent: null,
  },
  {
    categoryId: 10,
    name: 'Internet',
    type: TRANSACTION_TYPE.EXPENSE,
    icon: 'wifi',
    color: '#EF4444',
    sortOrder: 1,
    isActive: true,
    parentCategoryId: 1,
    defaultShared: true,
    defaultVatPercent: null,
    defaultDeductionPercent: null,
  },
  {
    categoryId: 11,
    name: 'Luz',
    type: TRANSACTION_TYPE.EXPENSE,
    icon: 'zap',
    color: '#EF4444',
    sortOrder: 2,
    isActive: true,
    parentCategoryId: 1,
    defaultShared: true,
    defaultVatPercent: null,
    defaultDeductionPercent: null,
  },
  {
    categoryId: 20,
    name: 'Comida',
    type: TRANSACTION_TYPE.EXPENSE,
    icon: 'utensils',
    color: '#3B82F6',
    sortOrder: 1,
    isActive: true,
    parentCategoryId: 2,
    defaultShared: false,
    defaultVatPercent: null,
    defaultDeductionPercent: null,
  },
];

const mockHierarchicalCategories: Category[] = [
  {
    ...mockFlatCategories[0]!,
    subcategories: [mockFlatCategories[2]!, mockFlatCategories[3]!],
  },
  {
    ...mockFlatCategories[1]!,
    subcategories: [mockFlatCategories[4]!],
  },
];

jest.mock('@/services/database/CategoryRepository', () => ({
  getCategories: jest.fn(async () => mockFlatCategories),
  getCategoriesHierarchical: jest.fn(async () => mockHierarchicalCategories),
  createCategory: jest.fn(async (data: Record<string, unknown>) => ({
    categoryId: 100,
    ...data,
    isActive: true,
    parentCategoryId: data.parentCategoryId ?? null,
    defaultShared: data.defaultShared ?? false,
  })),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { GET, POST } from '@/app/api/categories/route';

function createMockRequest(
  url: string,
  body?: Record<string, unknown>,
): { url: string; json: () => Promise<Record<string, unknown>> } {
  return {
    url,
    json: async () => body ?? {},
  };
}

describe('GET /api/categories', () => {
  it('should return flat categories by default', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories');
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(mockFlatCategories);
  });

  it('should return hierarchical tree when hierarchical=true', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories?hierarchical=true');
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(2);

    // Parent categories should have subcategories
    expect(data.data[0].name).toBe('Vivienda');
    expect(data.data[0].subcategories).toHaveLength(2);
    expect(data.data[0].subcategories[0].name).toBe('Internet');
    expect(data.data[0].subcategories[1].name).toBe('Luz');

    expect(data.data[1].name).toBe('Salir');
    expect(data.data[1].subcategories).toHaveLength(1);
    expect(data.data[1].subcategories[0].name).toBe('Comida');
  });

  it('should pass type filter to hierarchical query', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories?type=expense&hierarchical=true');
    const response = await GET(request as any);

    expect(response.status).toBe(200);

    const { getCategoriesHierarchical } = require('@/services/database/CategoryRepository');
    expect(getCategoriesHierarchical).toHaveBeenCalledWith(TRANSACTION_TYPE.EXPENSE, false);
  });

  it('should not return hierarchical when param is absent', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories?type=expense');
    const response = await GET(request as any);

    expect(response.status).toBe(200);

    const { getCategories } = require('@/services/database/CategoryRepository');
    expect(getCategories).toHaveBeenCalledWith(TRANSACTION_TYPE.EXPENSE, false);
  });
});

describe('POST /api/categories — Subcategory Creation', () => {
  it('should create a subcategory with parentCategoryId', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories', {
      name: 'Garaje',
      type: TRANSACTION_TYPE.EXPENSE,
      icon: 'warehouse',
      color: '#EF4444',
      parentCategoryId: 1,
      defaultShared: true,
    });
    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.parentCategoryId).toBe(1);
    expect(data.data.defaultShared).toBe(true);
  });

  it('should create a parent category without parentCategoryId', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories', {
      name: 'Suscripciones',
      type: TRANSACTION_TYPE.EXPENSE,
    });
    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.data.parentCategoryId).toBeNull();
    expect(data.data.defaultShared).toBe(false);
  });
});
