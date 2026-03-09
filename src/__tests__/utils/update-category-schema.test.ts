/**
 * Unit Tests: UpdateCategorySchema Validation
 * Tests partial update validation — type and parentCategoryId are immutable
 */

import { TRANSACTION_TYPE } from '@/constants/finance';
import { UpdateCategorySchema } from '@/schemas/transaction';

describe('UpdateCategorySchema', () => {
  it('should accept empty object (no fields to update)', () => {
    const result = UpdateCategorySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept name update', () => {
    const result = UpdateCategorySchema.safeParse({ name: 'Updated Name' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Updated Name');
    }
  });

  it('should accept isActive: false to deactivate', () => {
    const result = UpdateCategorySchema.safeParse({ isActive: false });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(false);
    }
  });

  it('should accept isActive: true to reactivate', () => {
    const result = UpdateCategorySchema.safeParse({ isActive: true });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
    }
  });

  it('should accept defaultShared update', () => {
    const result = UpdateCategorySchema.safeParse({ defaultShared: true });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultShared).toBe(true);
    }
  });

  it('should accept icon as string', () => {
    const result = UpdateCategorySchema.safeParse({ icon: 'car' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.icon).toBe('car');
    }
  });

  it('should accept icon as null', () => {
    const result = UpdateCategorySchema.safeParse({ icon: null });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.icon).toBeNull();
    }
  });

  it('should accept valid hex color', () => {
    const result = UpdateCategorySchema.safeParse({ color: '#3B82F6' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.color).toBe('#3B82F6');
    }
  });

  it('should accept color as null', () => {
    const result = UpdateCategorySchema.safeParse({ color: null });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.color).toBeNull();
    }
  });

  it('should reject invalid hex color', () => {
    const result = UpdateCategorySchema.safeParse({ color: 'not-a-color' });
    expect(result.success).toBe(false);
  });

  it('should reject 3-digit hex color', () => {
    const result = UpdateCategorySchema.safeParse({ color: '#F00' });
    expect(result.success).toBe(false);
  });

  it('should accept sortOrder as integer', () => {
    const result = UpdateCategorySchema.safeParse({ sortOrder: 5 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortOrder).toBe(5);
    }
  });

  it('should reject sortOrder as non-integer', () => {
    const result = UpdateCategorySchema.safeParse({ sortOrder: 1.5 });
    expect(result.success).toBe(false);
  });

  it('should reject empty name', () => {
    const result = UpdateCategorySchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('should reject name longer than 100 characters', () => {
    const result = UpdateCategorySchema.safeParse({ name: 'A'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('should accept multiple fields at once', () => {
    const result = UpdateCategorySchema.safeParse({
      name: 'Updated',
      icon: 'home',
      color: '#EF4444',
      sortOrder: 3,
      isActive: true,
      defaultShared: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Updated');
      expect(result.data.icon).toBe('home');
      expect(result.data.color).toBe('#EF4444');
      expect(result.data.sortOrder).toBe(3);
      expect(result.data.isActive).toBe(true);
      expect(result.data.defaultShared).toBe(true);
    }
  });

  it('should strip unknown fields (type is immutable)', () => {
    const result = UpdateCategorySchema.safeParse({
      name: 'Updated',
      type: TRANSACTION_TYPE.INCOME,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Updated');
      // type should be stripped — not present in UpdateCategorySchema
      expect('type' in result.data).toBe(false);
    }
  });

  it('should strip parentCategoryId (immutable)', () => {
    const result = UpdateCategorySchema.safeParse({
      name: 'Updated',
      parentCategoryId: 5,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect('parentCategoryId' in result.data).toBe(false);
    }
  });

  it('should reject icon longer than 50 characters', () => {
    const result = UpdateCategorySchema.safeParse({ icon: 'A'.repeat(51) });
    expect(result.success).toBe(false);
  });
});
