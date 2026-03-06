/**
 * Integration Tests: Categories CRUD API
 * Tests GET/PUT/DELETE /api/categories/[id]
 * Tests includeInactive support on GET /api/categories
 */

import type { Category } from '@/types/finance';

const mockCategory: Category = {
  categoryId: 1,
  name: 'Vivienda',
  type: 'expense',
  icon: 'home',
  color: '#EF4444',
  sortOrder: 1,
  isActive: true,
  parentCategoryId: null,
  defaultShared: true,
  defaultVatPercent: null,
  defaultDeductionPercent: null,
};

const mockInactiveCategory: Category = {
  ...mockCategory,
  categoryId: 5,
  name: 'Inactiva',
  isActive: false,
};

let capturedUpdateData: { id: number; data: Record<string, unknown> } | null = null;

jest.mock('@/services/database/CategoryRepository', () => ({
  getCategoryById: jest.fn(async (id: number) => {
    if (id === 1) return mockCategory;
    if (id === 5) return mockInactiveCategory;
    return null;
  }),
  updateCategory: jest.fn(async (id: number, data: Record<string, unknown>) => {
    capturedUpdateData = { id, data };
    if (id === 999) return null;
    return { ...mockCategory, ...data, categoryId: id };
  }),
  deleteCategory: jest.fn(async (id: number) => id !== 999),
  getCategoryTransactionCount: jest.fn(async (id: number) => {
    if (id === 10) return 5; // Has transactions
    return 0;
  }),
  getCategoryChildrenCount: jest.fn(async (id: number) => {
    if (id === 20) return 3; // Has subcategories
    return 0;
  }),
  getCategories: jest.fn(async () => [mockCategory]),
  getCategoriesHierarchical: jest.fn(async () => [{ ...mockCategory, subcategories: [] }]),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { DELETE as DELETE_SINGLE, GET as GET_SINGLE, PUT } from '@/app/api/categories/[id]/route';
import { GET as GET_LIST } from '@/app/api/categories/route';

function createMockRequest(
  url: string,
  body?: Record<string, unknown>,
): { url: string; json: () => Promise<Record<string, unknown>> } {
  return {
    url,
    json: async () => body ?? {},
  };
}

function createMockParams(id: string): { params: Promise<{ id: string }> } {
  return {
    params: Promise.resolve({ id }),
  };
}

// ── GET /api/categories/[id] ──

describe('GET /api/categories/[id]', () => {
  it('should return a category by ID', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories/1');
    const response = await GET_SINGLE(request as never, createMockParams('1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.categoryId).toBe(1);
    expect(data.data.name).toBe('Vivienda');
  });

  it('should return 404 for non-existent category', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories/999');
    const response = await GET_SINGLE(request as never, createMockParams('999'));

    expect(response.status).toBe(404);
  });

  it('should return 400 for invalid ID', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories/abc');
    const response = await GET_SINGLE(request as never, createMockParams('abc'));

    expect(response.status).toBe(400);
  });
});

// ── PUT /api/categories/[id] ──

describe('PUT /api/categories/[id]', () => {
  beforeEach(() => {
    capturedUpdateData = null;
  });

  it('should update category name', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories/1', {
      name: 'Vivienda Actualizada',
    });
    const response = await PUT(request as never, createMockParams('1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(capturedUpdateData!.id).toBe(1);
    expect(capturedUpdateData!.data.name).toBe('Vivienda Actualizada');
  });

  it('should update defaultShared field', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories/1', {
      defaultShared: false,
    });
    const response = await PUT(request as never, createMockParams('1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(capturedUpdateData!.data.defaultShared).toBe(false);
  });

  it('should update isActive to deactivate a category', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories/1', {
      isActive: false,
    });
    const response = await PUT(request as never, createMockParams('1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(capturedUpdateData!.data.isActive).toBe(false);
  });

  it('should update multiple fields at once', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories/1', {
      name: 'Updated',
      icon: 'car',
      color: '#3B82F6',
      sortOrder: 5,
    });
    const response = await PUT(request as never, createMockParams('1'));

    expect(response.status).toBe(200);
    expect(capturedUpdateData!.data.name).toBe('Updated');
    expect(capturedUpdateData!.data.icon).toBe('car');
    expect(capturedUpdateData!.data.color).toBe('#3B82F6');
    expect(capturedUpdateData!.data.sortOrder).toBe(5);
  });

  it('should return 404 for non-existent category', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories/999', {
      name: 'Test',
    });
    const response = await PUT(request as never, createMockParams('999'));

    expect(response.status).toBe(404);
  });

  it('should return 400 for invalid ID', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories/abc', {
      name: 'Test',
    });
    const response = await PUT(request as never, createMockParams('abc'));

    expect(response.status).toBe(400);
  });

  it('should return 400 for invalid color format', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories/1', {
      color: 'not-a-hex',
    });
    const response = await PUT(request as never, createMockParams('1'));

    expect(response.status).toBe(400);
  });

  it('should accept null values for icon and color', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories/1', {
      icon: null,
      color: null,
    });
    const response = await PUT(request as never, createMockParams('1'));

    expect(response.status).toBe(200);
    expect(capturedUpdateData!.data.icon).toBeNull();
    expect(capturedUpdateData!.data.color).toBeNull();
  });
});

// ── DELETE /api/categories/[id] ──

describe('DELETE /api/categories/[id]', () => {
  it('should delete a category with no references', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories/1');
    const response = await DELETE_SINGLE(request as never, createMockParams('1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.deleted).toBe(true);
  });

  it('should return 409 when category has transactions', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories/10');
    const response = await DELETE_SINGLE(request as never, createMockParams('10'));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.success).toBe(false);
    expect(data.error).toBe('has-transactions');
    expect(data.count).toBe(5);
  });

  it('should return 409 when category has subcategories', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories/20');
    const response = await DELETE_SINGLE(request as never, createMockParams('20'));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.success).toBe(false);
    expect(data.error).toBe('has-subcategories');
    expect(data.count).toBe(3);
  });

  it('should return 400 for invalid ID', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories/abc');
    const response = await DELETE_SINGLE(request as never, createMockParams('abc'));

    expect(response.status).toBe(400);
  });

  it('should return 404 for non-existent category', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories/999');
    const response = await DELETE_SINGLE(request as never, createMockParams('999'));

    expect(response.status).toBe(404);
  });

  it('should check transactions before subcategories', async () => {
    // Category 10 has transactions — should get 409 with has-transactions, not check children
    const request = createMockRequest('http://localhost:3000/api/categories/10');
    const response = await DELETE_SINGLE(request as never, createMockParams('10'));
    const data = await response.json();

    expect(data.error).toBe('has-transactions');
  });
});

// ── GET /api/categories?includeInactive=true ──

describe('GET /api/categories — includeInactive support', () => {
  it('should pass includeInactive=false by default', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories');
    await GET_LIST(request as never);

    const { getCategories } = require('@/services/database/CategoryRepository');
    expect(getCategories).toHaveBeenCalledWith(undefined, false);
  });

  it('should pass includeInactive=true when param is set', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories?includeInactive=true');
    await GET_LIST(request as never);

    const { getCategories } = require('@/services/database/CategoryRepository');
    expect(getCategories).toHaveBeenCalledWith(undefined, true);
  });

  it('should pass includeInactive=true to hierarchical query', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories?hierarchical=true&includeInactive=true');
    await GET_LIST(request as never);

    const { getCategoriesHierarchical } = require('@/services/database/CategoryRepository');
    expect(getCategoriesHierarchical).toHaveBeenCalledWith(undefined, true);
  });

  it('should combine type filter with includeInactive', async () => {
    const request = createMockRequest('http://localhost:3000/api/categories?type=expense&includeInactive=true');
    await GET_LIST(request as never);

    const { getCategories } = require('@/services/database/CategoryRepository');
    expect(getCategories).toHaveBeenCalledWith('expense', true);
  });
});
