/**
 * BudgetGuard Transaction Group Utilities
 * Shared logic for computing grouped-transaction line items in cents,
 * including the shared-expense halving and balanced rounding adjustment.
 * Reused by both the create (POST) and update (PATCH) routes.
 */

import { SHARED_EXPENSE } from '@/constants/finance';
import { eurosToCents } from '@/utils/money';

export interface GroupItemInput {
  categoryId: number;
  amount: number;
}

export interface GroupItemCents {
  categoryId: number;
  amountCents: number;
  originalAmountCents: number | null;
}

/**
 * Convert each item's euro amount to cents, applying shared halving when needed.
 * For shared expenses, the original (full) amount is preserved and a balanced
 * rounding adjustment ensures the sum of halved items equals the halved total.
 */
export function computeGroupItemsCents(
  items: GroupItemInput[],
  isShared = false,
): { sharedDivisor: number; items: GroupItemCents[] } {
  const sharedDivisor = isShared ? SHARED_EXPENSE.DIVISOR : SHARED_EXPENSE.DEFAULT_DIVISOR;

  const itemsWithCents: GroupItemCents[] = items.map((item) => {
    const fullCents = eurosToCents(item.amount);
    const effectiveCents = isShared ? Math.ceil(fullCents / sharedDivisor) : fullCents;
    return {
      categoryId: item.categoryId,
      amountCents: effectiveCents,
      originalAmountCents: isShared ? fullCents : null,
    };
  });

  // Balanced rounding adjustment for shared expenses:
  // Ensure sum of individual halved items equals halved total
  if (isShared && itemsWithCents.length > 1) {
    const totalFullCents = itemsWithCents.reduce(
      (sum, item) => sum + (item.originalAmountCents ?? item.amountCents),
      0,
    );
    const expectedHalvedTotal = Math.ceil(totalFullCents / sharedDivisor);
    const actualHalvedTotal = itemsWithCents.reduce((sum, item) => sum + item.amountCents, 0);
    const diff = actualHalvedTotal - expectedHalvedTotal;

    // Adjust the last item to absorb the rounding difference
    if (diff !== 0) {
      const lastItem = itemsWithCents[itemsWithCents.length - 1];
      if (lastItem) {
        lastItem.amountCents = lastItem.amountCents - diff;
      }
    }
  }

  return { sharedDivisor, items: itemsWithCents };
}
