/**
 * BudgetGuard Recurring Expenses [id] API
 * GET /api/recurring-expenses/[id] - Get single recurring expense
 * PUT /api/recurring-expenses/[id] - Update recurring expense
 * DELETE /api/recurring-expenses/[id] - Soft-delete (deactivate)
 */

import { API_ERROR, END_CONDITION, SHARED_EXPENSE } from '@/constants/finance';
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
import { computeEndDateFromOccurrences, extractRecurrenceFields } from '@/utils/recurring';

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

  const { amount, isShared, endCondition, occurrenceCount, ...rest } = validation.data;

  const updateData: Parameters<typeof updateRecurringExpense>[1] = { ...rest };

  if (amount !== undefined) {
    const fullAmountCents = eurosToCents(amount);
    const shared = isShared ?? false;
    const sharedDivisor = shared ? SHARED_EXPENSE.DIVISOR : SHARED_EXPENSE.DEFAULT_DIVISOR;

    updateData.amountCents = shared ? Math.ceil(fullAmountCents / sharedDivisor) : fullAmountCents;
    updateData.originalAmountCents = shared ? fullAmountCents : null;
    updateData.sharedDivisor = sharedDivisor;
  }

  // Derive recurrence fields if startDate or frequency changed
  if (rest.startDate || rest.frequency) {
    const existing = await getRecurringExpenseById(recurringExpenseId);
    if (existing) {
      const startDateStr = rest.startDate ? rest.startDate.toISOString().split('T')[0]! : existing.startDate;
      const frequency = rest.frequency ?? existing.frequency;
      const recurrenceFields = extractRecurrenceFields(startDateStr, frequency);
      Object.assign(updateData, recurrenceFields);
    }
  }

  // Compute endDate from end condition
  if (endCondition !== undefined) {
    if (endCondition === END_CONDITION.NEVER) {
      updateData.endDate = null;
    } else if (endCondition === END_CONDITION.AFTER_OCCURRENCES && occurrenceCount) {
      const existing = await getRecurringExpenseById(recurringExpenseId);
      if (existing) {
        const startDateStr = rest.startDate ? rest.startDate.toISOString().split('T')[0]! : existing.startDate;
        const frequency = rest.frequency ?? existing.frequency;
        const endDateStr = computeEndDateFromOccurrences(startDateStr, frequency, occurrenceCount);
        updateData.endDate = new Date(endDateStr);
      }
    }
    // ON_DATE: endDate comes from rest.endDate (already in updateData)
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
