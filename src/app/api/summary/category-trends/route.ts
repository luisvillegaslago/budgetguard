/**
 * BudgetGuard Category Trends API
 * GET /api/summary/category-trends - Per-category expense totals across a month range
 */

import { getCategoryTrends } from '@/services/database/TransactionRepository';
import { withApiHandler } from '@/utils/apiHandler';
import { resolveTrendRangeFromParams } from '@/utils/trendRange';

export const GET = withApiHandler(async (request) => {
  const { searchParams } = new URL(request.url);

  const range = await resolveTrendRangeFromParams(searchParams);
  if (!('fromMonth' in range)) return range; // 400 NextResponse

  const trends = await getCategoryTrends(range.fromMonth, range.toMonth);

  return { data: trends };
}, 'GET /api/summary/category-trends');
