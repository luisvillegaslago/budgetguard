/**
 * Unit Tests: Category Tree Building and Schema Validation
 * Tests buildCategoryTree logic and CreateCategorySchema with new fields
 */

import { CreateCategorySchema } from '@/schemas/transaction';
import type { Category } from '@/types/finance';

/**
 * Replicates buildCategoryTree from CategoryRepository
 * Extracted here for pure unit testing without DB mocks
 */
function buildCategoryTree(categories: Category[]): Category[] {
  const parents = categories.filter((c) => c.parentCategoryId === null);
  const children = categories.filter((c) => c.parentCategoryId !== null);

  return parents.map((parent) => ({
    ...parent,
    subcategories: children
      .filter((c) => c.parentCategoryId === parent.categoryId)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }));
}

const makeCategory = (overrides: Partial<Category> & Pick<Category, 'categoryId' | 'name'>): Category => ({
  type: 'expense',
  icon: null,
  color: null,
  sortOrder: 0,
  isActive: true,
  parentCategoryId: null,
  defaultShared: false,
  defaultVatPercent: null,
  defaultDeductionPercent: null,
  ...overrides,
});

describe('buildCategoryTree', () => {
  it('should group subcategories under their parent', () => {
    const flat: Category[] = [
      makeCategory({ categoryId: 1, name: 'Vivienda', sortOrder: 1 }),
      makeCategory({ categoryId: 2, name: 'Salir', sortOrder: 2 }),
      makeCategory({ categoryId: 10, name: 'Internet', parentCategoryId: 1, sortOrder: 1 }),
      makeCategory({ categoryId: 11, name: 'Luz', parentCategoryId: 1, sortOrder: 2 }),
      makeCategory({ categoryId: 20, name: 'Comida', parentCategoryId: 2, sortOrder: 1 }),
    ];

    const tree = buildCategoryTree(flat);

    expect(tree).toHaveLength(2);
    expect(tree[0]!.name).toBe('Vivienda');
    expect(tree[0]!.subcategories).toHaveLength(2);
    expect(tree[0]!.subcategories![0]!.name).toBe('Internet');
    expect(tree[0]!.subcategories![1]!.name).toBe('Luz');

    expect(tree[1]!.name).toBe('Salir');
    expect(tree[1]!.subcategories).toHaveLength(1);
    expect(tree[1]!.subcategories![0]!.name).toBe('Comida');
  });

  it('should return empty subcategories for parents without children', () => {
    const flat: Category[] = [
      makeCategory({ categoryId: 1, name: 'Vivienda' }),
      makeCategory({ categoryId: 2, name: 'Transporte' }),
    ];

    const tree = buildCategoryTree(flat);

    expect(tree).toHaveLength(2);
    expect(tree[0]!.subcategories).toEqual([]);
    expect(tree[1]!.subcategories).toEqual([]);
  });

  it('should handle empty input', () => {
    const tree = buildCategoryTree([]);
    expect(tree).toEqual([]);
  });

  it('should sort subcategories by sortOrder', () => {
    const flat: Category[] = [
      makeCategory({ categoryId: 1, name: 'Parent' }),
      makeCategory({ categoryId: 10, name: 'Third', parentCategoryId: 1, sortOrder: 3 }),
      makeCategory({ categoryId: 11, name: 'First', parentCategoryId: 1, sortOrder: 1 }),
      makeCategory({ categoryId: 12, name: 'Second', parentCategoryId: 1, sortOrder: 2 }),
    ];

    const tree = buildCategoryTree(flat);
    const subcats = tree[0]!.subcategories!;

    expect(subcats[0]!.name).toBe('First');
    expect(subcats[1]!.name).toBe('Second');
    expect(subcats[2]!.name).toBe('Third');
  });

  it('should not include orphaned children (children without matching parent)', () => {
    const flat: Category[] = [
      makeCategory({ categoryId: 1, name: 'Parent' }),
      makeCategory({ categoryId: 10, name: 'Orphan', parentCategoryId: 999, sortOrder: 1 }),
    ];

    const tree = buildCategoryTree(flat);

    expect(tree).toHaveLength(1);
    expect(tree[0]!.subcategories).toEqual([]);
  });

  it('should preserve parent properties (defaultShared, icon, color)', () => {
    const flat: Category[] = [
      makeCategory({ categoryId: 1, name: 'Vivienda', defaultShared: true, icon: 'home', color: '#EF4444' }),
      makeCategory({ categoryId: 10, name: 'Internet', parentCategoryId: 1, defaultShared: true }),
    ];

    const tree = buildCategoryTree(flat);

    expect(tree[0]!.defaultShared).toBe(true);
    expect(tree[0]!.icon).toBe('home');
    expect(tree[0]!.color).toBe('#EF4444');
    expect(tree[0]!.subcategories![0]!.defaultShared).toBe(true);
  });

  it('should handle only subcategories (no parents) — returns empty', () => {
    const flat: Category[] = [
      makeCategory({ categoryId: 10, name: 'Internet', parentCategoryId: 1 }),
      makeCategory({ categoryId: 11, name: 'Luz', parentCategoryId: 1 }),
    ];

    const tree = buildCategoryTree(flat);
    expect(tree).toEqual([]);
  });
});

describe('CreateCategorySchema — New Fields', () => {
  it('should accept parentCategoryId', () => {
    const result = CreateCategorySchema.safeParse({
      name: 'Internet',
      type: 'expense',
      parentCategoryId: 1,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parentCategoryId).toBe(1);
    }
  });

  it('should accept null parentCategoryId', () => {
    const result = CreateCategorySchema.safeParse({
      name: 'Vivienda',
      type: 'expense',
      parentCategoryId: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parentCategoryId).toBeNull();
    }
  });

  it('should default parentCategoryId to undefined when not provided', () => {
    const result = CreateCategorySchema.safeParse({
      name: 'Vivienda',
      type: 'expense',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parentCategoryId).toBeUndefined();
    }
  });

  it('should accept defaultShared: true', () => {
    const result = CreateCategorySchema.safeParse({
      name: 'Internet',
      type: 'expense',
      defaultShared: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultShared).toBe(true);
    }
  });

  it('should default defaultShared to false when not provided', () => {
    const result = CreateCategorySchema.safeParse({
      name: 'Transporte',
      type: 'expense',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultShared).toBe(false);
    }
  });

  it('should reject negative parentCategoryId', () => {
    const result = CreateCategorySchema.safeParse({
      name: 'Test',
      type: 'expense',
      parentCategoryId: -1,
    });

    expect(result.success).toBe(false);
  });

  it('should reject zero parentCategoryId', () => {
    const result = CreateCategorySchema.safeParse({
      name: 'Test',
      type: 'expense',
      parentCategoryId: 0,
    });

    expect(result.success).toBe(false);
  });

  it('should reject non-integer parentCategoryId', () => {
    const result = CreateCategorySchema.safeParse({
      name: 'Test',
      type: 'expense',
      parentCategoryId: 1.5,
    });

    expect(result.success).toBe(false);
  });
});
