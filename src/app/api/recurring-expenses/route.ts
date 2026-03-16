/**
 * BudgetGuard Recurring Expenses API
 * GET /api/recurring-expenses - List recurring expense rules
 * POST /api/recurring-expenses - Create a new recurring expense rule
 */

import { END_CONDITION, SHARED_EXPENSE } from '@/constants/finance';
import { CreateRecurringExpenseSchema } from '@/schemas/recurring-expense';
import { validateRequest } from '@/schemas/transaction';
import { createRecurringExpense, getRecurringExpenses } from '@/services/database/RecurringExpenseRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';
import { eurosToCents } from '@/utils/money';
import { computeEndDateFromOccurrences, extractRecurrenceFields } from '@/utils/recurring';

export const GET = withApiHandler(async (request) => {
  const { searchParams } = new URL(request.url);
  const isActiveParam = searchParams.get('isActive');

  const filters = isActiveParam !== null ? { isActive: isActiveParam === 'true' } : undefined;

  const expenses = await getRecurringExpenses(filters);

  return { data: expenses, meta: { count: expenses.length } };
}, 'GET /api/recurring-expenses');

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const validation = validateRequest(CreateRecurringExpenseSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const { amount, isShared, vatPercent, deductionPercent, vendorName, endCondition, occurrenceCount, ...rest } =
    validation.data;

  const fullAmountCents = eurosToCents(amount);
  const sharedDivisor = isShared ? SHARED_EXPENSE.DIVISOR : SHARED_EXPENSE.DEFAULT_DIVISOR;
  const effectiveAmount = isShared ? Math.ceil(fullAmountCents / sharedDivisor) : fullAmountCents;

  // Derive recurrence fields from startDate
  const startDateStr = rest.startDate.toISOString().split('T')[0]!;
  const recurrenceFields = extractRecurrenceFields(startDateStr, rest.frequency);

  // Compute endDate from end condition
  let endDate = rest.endDate;
  if (endCondition === END_CONDITION.NEVER) {
    endDate = null;
  } else if (endCondition === END_CONDITION.AFTER_OCCURRENCES && occurrenceCount) {
    const endDateStr = computeEndDateFromOccurrences(startDateStr, rest.frequency, occurrenceCount);
    endDate = new Date(endDateStr);
  }

  const expense = await createRecurringExpense({
    ...rest,
    ...recurrenceFields,
    endDate,
    amountCents: effectiveAmount,
    originalAmountCents: isShared ? fullAmountCents : null,
    sharedDivisor,
    description: rest.description ?? undefined,
    vatPercent: vatPercent ?? null,
    deductionPercent: deductionPercent ?? null,
    vendorName: vendorName ?? null,
  });

  return { data: expense, status: 201 };
}, 'POST /api/recurring-expenses');
