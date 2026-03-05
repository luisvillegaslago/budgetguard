import { RECURRING_FREQUENCY } from '@/constants/finance';
import {
  ConfirmOccurrenceSchema,
  CreateRecurringExpenseSchema,
  UpdateRecurringExpenseSchema,
} from '@/schemas/recurring-expense';

describe('CreateRecurringExpenseSchema', () => {
  const validMonthly = {
    categoryId: 1,
    amount: 450,
    frequency: RECURRING_FREQUENCY.MONTHLY,
    dayOfMonth: 1,
    startDate: '2026-01-01',
  };

  const validWeekly = {
    categoryId: 1,
    amount: 50,
    frequency: RECURRING_FREQUENCY.WEEKLY,
    dayOfWeek: 1,
    startDate: '2026-01-01',
  };

  const validYearly = {
    categoryId: 1,
    amount: 120,
    frequency: RECURRING_FREQUENCY.YEARLY,
    dayOfMonth: 15,
    monthOfYear: 6,
    startDate: '2026-01-01',
  };

  it('should validate a valid monthly expense', () => {
    const result = CreateRecurringExpenseSchema.safeParse(validMonthly);
    expect(result.success).toBe(true);
  });

  it('should validate a valid weekly expense', () => {
    const result = CreateRecurringExpenseSchema.safeParse(validWeekly);
    expect(result.success).toBe(true);
  });

  it('should validate a valid yearly expense', () => {
    const result = CreateRecurringExpenseSchema.safeParse(validYearly);
    expect(result.success).toBe(true);
  });

  it('should reject monthly without dayOfMonth', () => {
    const result = CreateRecurringExpenseSchema.safeParse({
      ...validMonthly,
      dayOfMonth: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const dayOfMonthError = result.error.issues.find((i) => i.path.includes('dayOfMonth'));
      expect(dayOfMonthError).toBeDefined();
    }
  });

  it('should reject weekly without dayOfWeek', () => {
    const result = CreateRecurringExpenseSchema.safeParse({
      ...validWeekly,
      dayOfWeek: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const dayOfWeekError = result.error.issues.find((i) => i.path.includes('dayOfWeek'));
      expect(dayOfWeekError).toBeDefined();
    }
  });

  it('should reject yearly without monthOfYear', () => {
    const result = CreateRecurringExpenseSchema.safeParse({
      ...validYearly,
      monthOfYear: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const monthError = result.error.issues.find((i) => i.path.includes('monthOfYear'));
      expect(monthError).toBeDefined();
    }
  });

  it('should reject yearly without dayOfMonth', () => {
    const result = CreateRecurringExpenseSchema.safeParse({
      ...validYearly,
      dayOfMonth: null,
    });
    expect(result.success).toBe(false);
  });

  it('should reject negative amount', () => {
    const result = CreateRecurringExpenseSchema.safeParse({
      ...validMonthly,
      amount: -10,
    });
    expect(result.success).toBe(false);
  });

  it('should reject zero amount', () => {
    const result = CreateRecurringExpenseSchema.safeParse({
      ...validMonthly,
      amount: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid frequency', () => {
    const result = CreateRecurringExpenseSchema.safeParse({
      ...validMonthly,
      frequency: 'daily',
    });
    expect(result.success).toBe(false);
  });

  it('should reject dayOfWeek out of range', () => {
    const result = CreateRecurringExpenseSchema.safeParse({
      ...validWeekly,
      dayOfWeek: 7,
    });
    expect(result.success).toBe(false);
  });

  it('should reject dayOfMonth out of range', () => {
    const result = CreateRecurringExpenseSchema.safeParse({
      ...validMonthly,
      dayOfMonth: 32,
    });
    expect(result.success).toBe(false);
  });

  it('should reject monthOfYear out of range', () => {
    const result = CreateRecurringExpenseSchema.safeParse({
      ...validYearly,
      monthOfYear: 13,
    });
    expect(result.success).toBe(false);
  });

  it('should accept optional description', () => {
    const result = CreateRecurringExpenseSchema.safeParse({
      ...validMonthly,
      description: 'Monthly rent',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe('Monthly rent');
    }
  });

  it('should accept optional endDate', () => {
    const result = CreateRecurringExpenseSchema.safeParse({
      ...validMonthly,
      endDate: '2027-01-01',
    });
    expect(result.success).toBe(true);
  });

  it('should default isShared to false', () => {
    const result = CreateRecurringExpenseSchema.safeParse(validMonthly);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isShared).toBe(false);
    }
  });

  it('should allow weekly with dayOfWeek=0 (Sunday)', () => {
    const result = CreateRecurringExpenseSchema.safeParse({
      ...validWeekly,
      dayOfWeek: 0,
    });
    expect(result.success).toBe(true);
  });
});

describe('UpdateRecurringExpenseSchema', () => {
  it('should accept partial updates', () => {
    const result = UpdateRecurringExpenseSchema.safeParse({ amount: 500 });
    expect(result.success).toBe(true);
  });

  it('should accept empty object', () => {
    const result = UpdateRecurringExpenseSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept isActive field', () => {
    const result = UpdateRecurringExpenseSchema.safeParse({ isActive: false });
    expect(result.success).toBe(true);
  });

  it('should reject invalid amount', () => {
    const result = UpdateRecurringExpenseSchema.safeParse({ amount: -5 });
    expect(result.success).toBe(false);
  });
});

describe('ConfirmOccurrenceSchema', () => {
  it('should accept empty object', () => {
    const result = ConfirmOccurrenceSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept modified amount', () => {
    const result = ConfirmOccurrenceSchema.safeParse({ modifiedAmount: 500 });
    expect(result.success).toBe(true);
  });

  it('should reject negative modified amount', () => {
    const result = ConfirmOccurrenceSchema.safeParse({ modifiedAmount: -10 });
    expect(result.success).toBe(false);
  });
});
