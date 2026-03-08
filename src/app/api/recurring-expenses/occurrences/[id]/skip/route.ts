/**
 * BudgetGuard Skip Occurrence API
 * POST /api/recurring-expenses/occurrences/[id]/skip
 * Marks an occurrence as skipped (no transaction created)
 */

import { skipOccurrence } from '@/services/database/RecurringExpenseRepository';
import { notFound, parseIdParam, withApiHandler } from '@/utils/apiHandler';

export const POST = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const occurrenceId = parseIdParam(id);
  if (typeof occurrenceId !== 'number') return occurrenceId;

  const skipped = await skipOccurrence(occurrenceId);
  if (!skipped) return notFound('Ocurrencia no encontrada o ya procesada');

  return { data: { skipped: true } };
}, 'POST /api/recurring-expenses/occurrences/[id]/skip');
