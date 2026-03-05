/**
 * Unit Tests: Trip Zod Schemas
 * Tests validation for CreateTripSchema, UpdateTripSchema,
 * CreateTripExpenseSchema, and UpdateTripExpenseSchema
 */

import { CreateTripExpenseSchema, CreateTripSchema, UpdateTripExpenseSchema, UpdateTripSchema } from '@/schemas/trip';

// ============================
// CreateTripSchema
// ============================
describe('CreateTripSchema', () => {
  it('should accept a valid trip name', () => {
    const result = CreateTripSchema.safeParse({ name: 'Sierra Nevada 2025' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Sierra Nevada 2025');
    }
  });

  it('should reject empty name', () => {
    const result = CreateTripSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('should reject missing name', () => {
    const result = CreateTripSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject name longer than 100 characters', () => {
    const result = CreateTripSchema.safeParse({ name: 'A'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('should accept name with exactly 100 characters', () => {
    const result = CreateTripSchema.safeParse({ name: 'A'.repeat(100) });
    expect(result.success).toBe(true);
  });

  it('should accept name with 1 character', () => {
    const result = CreateTripSchema.safeParse({ name: 'X' });
    expect(result.success).toBe(true);
  });
});

// ============================
// UpdateTripSchema
// ============================
describe('UpdateTripSchema', () => {
  it('should accept a valid name update', () => {
    const result = UpdateTripSchema.safeParse({ name: 'Madrid Weekend' });
    expect(result.success).toBe(true);
  });

  it('should accept empty object (name is optional)', () => {
    const result = UpdateTripSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should reject empty name when provided', () => {
    const result = UpdateTripSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('should reject name longer than 100 characters', () => {
    const result = UpdateTripSchema.safeParse({ name: 'B'.repeat(101) });
    expect(result.success).toBe(false);
  });
});

// ============================
// CreateTripExpenseSchema
// ============================
describe('CreateTripExpenseSchema', () => {
  const validExpense = {
    categoryId: 15,
    amount: 120.5,
    description: 'Hotel 2 noches',
    transactionDate: '2025-10-15',
    isShared: false,
  };

  it('should accept valid trip expense', () => {
    const result = CreateTripExpenseSchema.safeParse(validExpense);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.categoryId).toBe(15);
      expect(result.data.amount).toBe(120.5);
      expect(result.data.isShared).toBe(false);
    }
  });

  it('should default isShared to false', () => {
    const { isShared, ...withoutShared } = validExpense;
    const result = CreateTripExpenseSchema.safeParse(withoutShared);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isShared).toBe(false);
    }
  });

  it('should default description to empty string', () => {
    const { description, ...withoutDesc } = validExpense;
    const result = CreateTripExpenseSchema.safeParse(withoutDesc);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe('');
    }
  });

  it('should reject negative amount', () => {
    const result = CreateTripExpenseSchema.safeParse({ ...validExpense, amount: -10 });
    expect(result.success).toBe(false);
  });

  it('should reject zero amount', () => {
    const result = CreateTripExpenseSchema.safeParse({ ...validExpense, amount: 0 });
    expect(result.success).toBe(false);
  });

  it('should reject missing categoryId', () => {
    const { categoryId, ...withoutCategory } = validExpense;
    const result = CreateTripExpenseSchema.safeParse(withoutCategory);
    expect(result.success).toBe(false);
  });

  it('should reject missing amount', () => {
    const { amount, ...withoutAmount } = validExpense;
    const result = CreateTripExpenseSchema.safeParse(withoutAmount);
    expect(result.success).toBe(false);
  });

  it('should reject missing transactionDate', () => {
    const { transactionDate, ...withoutDate } = validExpense;
    const result = CreateTripExpenseSchema.safeParse(withoutDate);
    expect(result.success).toBe(false);
  });

  it('should reject invalid transactionDate', () => {
    const result = CreateTripExpenseSchema.safeParse({ ...validExpense, transactionDate: 'not-a-date' });
    expect(result.success).toBe(false);
  });

  it('should reject description longer than 255 characters', () => {
    const result = CreateTripExpenseSchema.safeParse({
      ...validExpense,
      description: 'X'.repeat(256),
    });
    expect(result.success).toBe(false);
  });

  it('should accept description with exactly 255 characters', () => {
    const result = CreateTripExpenseSchema.safeParse({
      ...validExpense,
      description: 'X'.repeat(255),
    });
    expect(result.success).toBe(true);
  });

  it('should reject non-integer categoryId', () => {
    const result = CreateTripExpenseSchema.safeParse({ ...validExpense, categoryId: 1.5 });
    expect(result.success).toBe(false);
  });

  it('should reject negative categoryId', () => {
    const result = CreateTripExpenseSchema.safeParse({ ...validExpense, categoryId: -1 });
    expect(result.success).toBe(false);
  });
});

// ============================
// UpdateTripExpenseSchema
// ============================
describe('UpdateTripExpenseSchema', () => {
  it('should accept partial update with only amount', () => {
    const result = UpdateTripExpenseSchema.safeParse({ amount: 200 });
    expect(result.success).toBe(true);
  });

  it('should accept partial update with only isShared', () => {
    const result = UpdateTripExpenseSchema.safeParse({ isShared: true });
    expect(result.success).toBe(true);
  });

  it('should accept partial update with only categoryId', () => {
    const result = UpdateTripExpenseSchema.safeParse({ categoryId: 16 });
    expect(result.success).toBe(true);
  });

  it('should accept empty object (all fields optional)', () => {
    const result = UpdateTripExpenseSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should still reject negative amount when provided', () => {
    const result = UpdateTripExpenseSchema.safeParse({ amount: -5 });
    expect(result.success).toBe(false);
  });

  it('should still reject zero amount when provided', () => {
    const result = UpdateTripExpenseSchema.safeParse({ amount: 0 });
    expect(result.success).toBe(false);
  });
});
