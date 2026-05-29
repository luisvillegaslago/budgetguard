/**
 * BudgetGuard Transaction Groups API
 * POST /api/transaction-groups - Create a group of linked transactions
 */

import { CreateTransactionGroupSchema, validateRequest } from '@/schemas/transaction';
import { createTransactionGroup } from '@/services/database/TransactionRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';
import { computeGroupItemsCents } from '@/utils/transactionGroup';

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const validation = validateRequest(CreateTransactionGroupSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const { items, isShared, description, transactionDate, type } = validation.data;
  const { sharedDivisor, items: itemsWithCents } = computeGroupItemsCents(items, isShared);

  const transactions = await createTransactionGroup({
    description,
    transactionDate,
    type,
    sharedDivisor,
    items: itemsWithCents,
  });

  return { data: transactions, status: 201 };
}, 'POST /api/transaction-groups');
