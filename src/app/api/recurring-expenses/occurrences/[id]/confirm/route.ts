/**
 * BudgetGuard Confirm Occurrence API
 * POST /api/recurring-expenses/occurrences/[id]/confirm
 * Creates a real transaction and marks the occurrence as confirmed
 */

import { ConfirmOccurrenceSchema } from '@/schemas/recurring-expense';
import { validateRequest } from '@/schemas/transaction';
import { confirmOccurrence } from '@/services/database/RecurringExpenseRepository';
import { parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';
import { eurosToCents } from '@/utils/money';

export const POST = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const occurrenceId = parseIdParam(id);
  if (typeof occurrenceId !== 'number') return occurrenceId;

  const body = await request.json().catch(() => ({}));
  const validation = validateRequest(ConfirmOccurrenceSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const modifiedAmountCents = validation.data.modifiedAmount ? eurosToCents(validation.data.modifiedAmount) : undefined;

  const occurrence = await confirmOccurrence(occurrenceId, modifiedAmountCents);

  return { data: occurrence };
}, 'POST /api/recurring-expenses/occurrences/[id]/confirm');
