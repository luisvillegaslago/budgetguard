/**
 * BudgetGuard Skip Occurrence API
 * POST /api/recurring-expenses/occurrences/[id]/skip
 * Marks an occurrence as skipped (no transaction created)
 */

import { API_ERROR } from '@/constants/finance';
import { skipOccurrence } from '@/services/database/RecurringExpenseRepository';
import { conflict, notFound, parseIdParam, withApiHandler } from '@/utils/apiHandler';

export const POST = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const occurrenceId = parseIdParam(id);
  if (typeof occurrenceId !== 'number') return occurrenceId;

  try {
    const skipped = await skipOccurrence(occurrenceId);
    if (!skipped) return notFound(API_ERROR.NOT_FOUND.OCCURRENCE);
    return { data: { skipped: true } };
  } catch (error) {
    if (error instanceof Error && error.message === API_ERROR.CONFLICT.FUTURE_OCCURRENCE) {
      return conflict(API_ERROR.CONFLICT.FUTURE_OCCURRENCE);
    }
    throw error;
  }
}, 'POST /api/recurring-expenses/occurrences/[id]/skip');
