/**
 * BudgetGuard Trip Expense API - Single Resource
 * PUT /api/trips/[id]/expenses/[expenseId] - Update a trip expense
 * DELETE /api/trips/[id]/expenses/[expenseId] - Delete a trip expense
 */

import { API_ERROR, SHARED_EXPENSE } from '@/constants/finance';
import { validateRequest } from '@/schemas/transaction';
import { UpdateTripExpenseSchema } from '@/schemas/trip';
import { deleteTransaction, getTransactionById, updateTransaction } from '@/services/database/TransactionRepository';
import { notFound, parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';
import { eurosToCents } from '@/utils/money';

export const PUT = withApiHandler(async (request, { params }) => {
  const { expenseId } = await params;
  const transactionId = parseIdParam(expenseId);
  if (typeof transactionId !== 'number') return transactionId;

  const body = await request.json();
  const validation = validateRequest(UpdateTripExpenseSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const { amount, isShared, ...rest } = validation.data;

  const updateData: Parameters<typeof updateTransaction>[1] = {
    ...rest,
    description: rest.description ?? undefined,
  };

  // Convert euros to cents if amount is provided, applying shared expense halving
  if (amount !== undefined) {
    const fullAmountCents = eurosToCents(amount);
    const sharedDivisor = isShared ? SHARED_EXPENSE.DIVISOR : SHARED_EXPENSE.DEFAULT_DIVISOR;

    updateData.amountCents = isShared ? Math.ceil(fullAmountCents / sharedDivisor) : fullAmountCents;
    updateData.originalAmountCents = isShared ? fullAmountCents : null;
    updateData.sharedDivisor = sharedDivisor;
  } else if (isShared !== undefined) {
    // isShared changed but amount didn't — recalculate from existing
    const existing = await getTransactionById(transactionId);
    if (existing) {
      const baseAmount = existing.originalAmountCents ?? existing.amountCents;
      const sharedDivisor = isShared ? SHARED_EXPENSE.DIVISOR : SHARED_EXPENSE.DEFAULT_DIVISOR;
      updateData.amountCents = isShared ? Math.ceil(baseAmount / sharedDivisor) : baseAmount;
      updateData.originalAmountCents = isShared ? baseAmount : null;
      updateData.sharedDivisor = sharedDivisor;
    }
  }

  const transaction = await updateTransaction(transactionId, updateData);
  if (!transaction) return notFound(API_ERROR.NOT_FOUND.EXPENSE);

  return { data: transaction };
}, 'PUT /api/trips/[id]/expenses/[expenseId]');

export const DELETE = withApiHandler(async (_request, { params }) => {
  const { expenseId } = await params;
  const transactionId = parseIdParam(expenseId);
  if (typeof transactionId !== 'number') return transactionId;

  const deleted = await deleteTransaction(transactionId);
  if (!deleted) return notFound(API_ERROR.NOT_FOUND.EXPENSE);

  return { data: { deleted: true } };
}, 'DELETE /api/trips/[id]/expenses/[expenseId]');
