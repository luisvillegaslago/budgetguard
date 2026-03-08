/**
 * BudgetGuard Skydiving Stats API
 * GET /api/skydiving/stats - Get aggregated skydiving statistics
 */

import { getSkydiveStats } from '@/services/database/SkydiveRepository';
import { withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async () => {
  const stats = await getSkydiveStats();

  return { data: stats };
}, 'GET /api/skydiving/stats');
