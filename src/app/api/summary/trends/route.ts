/**
 * BudgetGuard Summary Trends API
 * GET /api/summary/trends - Get multi-month income/expense/balance trends (from SQL views)
 */

import { getMonthlyTrends } from '@/services/database/TransactionRepository';
import { withApiHandler } from '@/utils/apiHandler';
import { resolveTrendRangeFromParams } from '@/utils/trendRange';

export const GET = withApiHandler(async (request) => {
  const { searchParams } = new URL(request.url);

  const range = await resolveTrendRangeFromParams(searchParams);
  if (!('fromMonth' in range)) return range; // 400 NextResponse

  const trends = await getMonthlyTrends(range.fromMonth, range.toMonth);

  return { data: trends };
}, 'GET /api/summary/trends');
