/**
 * BudgetGuard Skydiving Categories API
 * GET /api/skydiving/categories - Get Paracaidismo subcategories
 */

import { getSkydiveCategories } from '@/services/database/SkydiveRepository';
import { withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async () => {
  const categories = await getSkydiveCategories();

  return { data: categories };
}, 'GET /api/skydiving/categories');
