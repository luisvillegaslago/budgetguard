/**
 * BudgetGuard Transaction Groups API
 * POST /api/transaction-groups - Create a group of linked transactions
 */

import { SHARED_EXPENSE } from '@/constants/finance';
import { CreateTransactionGroupSchema, validateRequest } from '@/schemas/transaction';
import { createTransactionGroup } from '@/services/database/TransactionRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';
import { eurosToCents } from '@/utils/money';

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const validation = validateRequest(CreateTransactionGroupSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const { items, isShared, description, transactionDate, type } = validation.data;
  const sharedDivisor = isShared ? SHARED_EXPENSE.DIVISOR : SHARED_EXPENSE.DEFAULT_DIVISOR;

  // Convert each item's amount from euros to cents, applying shared halving
  const itemsWithCents = items.map((item) => {
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

  const transactions = await createTransactionGroup({
    description,
    transactionDate,
    type,
    sharedDivisor,
    items: itemsWithCents,
  });

  return { data: transactions, status: 201 };
}, 'POST /api/transaction-groups');
