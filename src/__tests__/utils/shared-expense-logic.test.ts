/**
 * Unit Tests: Shared Expense Halving Logic
 * Tests the Math.ceil rounding behavior for shared expenses
 * and Zod schema validation with isShared field
 */

import { SHARED_EXPENSE, TRANSACTION_TYPE } from '@/constants/finance';
import { CreateTransactionSchema } from '@/schemas/transaction';
import { eurosToCents } from '@/utils/money';

/**
 * Replicates the server-side halving logic from the API route
 * for unit-testable verification
 */
function calculateSharedAmount(
  amountEuros: number,
  isShared: boolean,
): {
  effectiveAmountCents: number;
  originalAmountCents: number | null;
  sharedDivisor: number;
} {
  const fullAmountCents = eurosToCents(amountEuros);
  const sharedDivisor = isShared ? SHARED_EXPENSE.DIVISOR : SHARED_EXPENSE.DEFAULT_DIVISOR;

  const effectiveAmountCents = isShared ? Math.ceil(fullAmountCents / sharedDivisor) : fullAmountCents;

  return {
    effectiveAmountCents,
    originalAmountCents: isShared ? fullAmountCents : null,
    sharedDivisor,
  };
}

describe('Shared Expense Halving Logic', () => {
  describe('calculateSharedAmount', () => {
    it('should not halve when not shared', () => {
      const result = calculateSharedAmount(100, false);

      expect(result.effectiveAmountCents).toBe(10000);
      expect(result.originalAmountCents).toBeNull();
      expect(result.sharedDivisor).toBe(1);
    });

    it('should halve even amounts exactly', () => {
      const result = calculateSharedAmount(100, true);

      expect(result.effectiveAmountCents).toBe(5000);
      expect(result.originalAmountCents).toBe(10000);
      expect(result.sharedDivisor).toBe(2);
    });

    it('should use Math.ceil for odd cents (5.01 → 251)', () => {
      const result = calculateSharedAmount(5.01, true);

      // 5.01 → 501 cents → 501/2 = 250.5 → ceil = 251
      expect(result.effectiveAmountCents).toBe(251);
      expect(result.originalAmountCents).toBe(501);
    });

    it('should use Math.ceil for 1 cent (0.01 → 1)', () => {
      const result = calculateSharedAmount(0.01, true);

      // 0.01 → 1 cent → 1/2 = 0.5 → ceil = 1
      expect(result.effectiveAmountCents).toBe(1);
      expect(result.originalAmountCents).toBe(1);
    });

    it('should handle 0.03 → ceil(3/2) = 2', () => {
      const result = calculateSharedAmount(0.03, true);

      expect(result.effectiveAmountCents).toBe(2);
      expect(result.originalAmountCents).toBe(3);
    });

    it('should handle large amounts (1234.57)', () => {
      const result = calculateSharedAmount(1234.57, true);

      // 1234.57 → 123457 cents → 123457/2 = 61728.5 → ceil = 61729
      expect(result.effectiveAmountCents).toBe(61729);
      expect(result.originalAmountCents).toBe(123457);
    });

    it('should ensure user part is never less than original/2', () => {
      // Property: ceil(n/2) >= n/2 always
      const testAmounts = [0.01, 0.03, 0.99, 1.01, 5.55, 99.99, 1000.01];

      testAmounts.forEach((amount) => {
        const result = calculateSharedAmount(amount, true);
        const halfOriginal = result.originalAmountCents! / 2;

        expect(result.effectiveAmountCents).toBeGreaterThanOrEqual(halfOriginal);
      });
    });

    it('should ensure effective + effective covers original (no negative discrepancy)', () => {
      // Property: 2 * ceil(n/2) >= n
      const testAmounts = [0.01, 0.03, 5.01, 99.99, 1234.57];

      testAmounts.forEach((amount) => {
        const result = calculateSharedAmount(amount, true);
        const twoPartsSum = result.effectiveAmountCents * 2;

        expect(twoPartsSum).toBeGreaterThanOrEqual(result.originalAmountCents!);
      });
    });

    it('should never overshoot by more than 1 cent', () => {
      // Property: 2 * ceil(n/2) - n <= 1
      const testAmounts = [0.01, 0.03, 5.01, 99.99, 1234.57];

      testAmounts.forEach((amount) => {
        const result = calculateSharedAmount(amount, true);
        const overshoot = result.effectiveAmountCents * 2 - result.originalAmountCents!;

        expect(overshoot).toBeLessThanOrEqual(1);
      });
    });
  });
});

describe('Zod Schema — isShared field', () => {
  it('should accept isShared: true', () => {
    const result = CreateTransactionSchema.safeParse({
      categoryId: 1,
      amount: 100,
      transactionDate: '2025-01-15',
      type: TRANSACTION_TYPE.EXPENSE,
      isShared: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isShared).toBe(true);
    }
  });

  it('should accept isShared: false', () => {
    const result = CreateTransactionSchema.safeParse({
      categoryId: 1,
      amount: 100,
      transactionDate: '2025-01-15',
      type: TRANSACTION_TYPE.EXPENSE,
      isShared: false,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isShared).toBe(false);
    }
  });

  it('should default isShared to false when not provided', () => {
    const result = CreateTransactionSchema.safeParse({
      categoryId: 1,
      amount: 100,
      transactionDate: '2025-01-15',
      type: TRANSACTION_TYPE.EXPENSE,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isShared).toBe(false);
    }
  });
});
