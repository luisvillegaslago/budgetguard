/**
 * BudgetGuard Skydiving Dropzones API
 * GET /api/skydiving/jumps/dropzones - Get distinct dropzone names for the current user
 */

import { getDistinctDropzones } from '@/services/database/SkydiveRepository';
import { withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async () => {
  const dropzones = await getDistinctDropzones();

  return { data: dropzones };
}, 'GET /api/skydiving/jumps/dropzones');
