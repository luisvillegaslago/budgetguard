/**
 * BudgetGuard Recurring Expenses [id] API
 * GET /api/recurring-expenses/[id] - Get single recurring expense
 * PUT /api/recurring-expenses/[id] - Update recurring expense
 * DELETE /api/recurring-expenses/[id] - Soft-delete (deactivate)
 */

import { API_ERROR, SHARED_EXPENSE } from '@/constants/finance';
import { UpdateRecurringExpenseSchema } from '@/schemas/recurring-expense';
import { validateRequest } from '@/schemas/transaction';
import {
  deleteRecurringExpense,
  getRecurringExpenseById,
  hardDeleteRecurringExpense,
  updateRecurringExpense,
} from '@/services/database/RecurringExpenseRepository';
import { notFound, parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';
import { eurosToCents } from '@/utils/money';

export const GET = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const recurringExpenseId = parseIdParam(id);
  if (typeof recurringExpenseId !== 'number') return recurringExpenseId;

  const expense = await getRecurringExpenseById(recurringExpenseId);
  if (!expense) return notFound(API_ERROR.NOT_FOUND.RECURRING_EXPENSE);

  return { data: expense };
}, 'GET /api/recurring-expenses/[id]');

export const PUT = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const recurringExpenseId = parseIdParam(id);
  if (typeof recurringExpenseId !== 'number') return recurringExpenseId;

  const body = await request.json();
  const validation = validateRequest(UpdateRecurringExpenseSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const { amount, isShared, ...rest } = validation.data;

  const updateData: Parameters<typeof updateRecurringExpense>[1] = { ...rest };

  if (amount !== undefined) {
    const fullAmountCents = eurosToCents(amount);
    const shared = isShared ?? false;
    const sharedDivisor = shared ? SHARED_EXPENSE.DIVISOR : SHARED_EXPENSE.DEFAULT_DIVISOR;

    updateData.amountCents = shared ? Math.ceil(fullAmountCents / sharedDivisor) : fullAmountCents;
    updateData.originalAmountCents = shared ? fullAmountCents : null;
    updateData.sharedDivisor = sharedDivisor;
  }

  const expense = await updateRecurringExpense(recurringExpenseId, updateData);
  if (!expense) return notFound(API_ERROR.NOT_FOUND.RECURRING_EXPENSE);

  return { data: expense };
}, 'PUT /api/recurring-expenses/[id]');

export const DELETE = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const recurringExpenseId = parseIdParam(id);
  if (typeof recurringExpenseId !== 'number') return recurringExpenseId;

  const { searchParams } = new URL(request.url);
  const permanent = searchParams.get('permanent') === 'true';

  const deleted = permanent
    ? await hardDeleteRecurringExpense(recurringExpenseId)
    : await deleteRecurringExpense(recurringExpenseId);

  if (!deleted) return notFound(API_ERROR.NOT_FOUND.RECURRING_EXPENSE);

  return { data: { deleted: true } };
}, 'DELETE /api/recurring-expenses/[id]');
