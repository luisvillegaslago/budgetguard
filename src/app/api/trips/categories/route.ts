/**
 * BudgetGuard Trip Categories API
 * GET /api/trips/categories - Get subcategories under "Viajes" parent
 */

import { getTripCategories } from '@/services/database/TripRepository';
import { withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async () => {
  const categories = await getTripCategories();

  return { data: categories };
}, 'GET /api/trips/categories');
