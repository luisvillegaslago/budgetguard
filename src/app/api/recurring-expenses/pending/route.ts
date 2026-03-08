/**
 * BudgetGuard Pending Occurrences API
 * GET /api/recurring-expenses/pending - Get all pending occurrences (retroactive)
 */

import { getAllPendingOccurrences } from '@/services/database/RecurringExpenseRepository';
import { withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async () => {
  const summary = await getAllPendingOccurrences();

  return { data: summary };
}, 'GET /api/recurring-expenses/pending');
