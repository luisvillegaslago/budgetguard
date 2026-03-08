/**
 * BudgetGuard Categories API
 * GET /api/categories - List all categories
 * POST /api/categories - Create a new category
 */

import { CreateCategorySchema, validateRequest } from '@/schemas/transaction';
import { createCategory, getCategories, getCategoriesHierarchical } from '@/services/database/CategoryRepository';
import type { TransactionType } from '@/types/finance';
import { validationError, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async (request) => {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') as TransactionType | null;
  const hierarchical = searchParams.get('hierarchical') === 'true';
  const includeInactive = searchParams.get('includeInactive') === 'true';

  const categories = hierarchical
    ? await getCategoriesHierarchical(type ?? undefined, includeInactive)
    : await getCategories(type ?? undefined, includeInactive);

  return { data: categories };
}, 'GET /api/categories');

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const validation = validateRequest(CreateCategorySchema, body);

  if (!validation.success) {
    return validationError(validation.errors);
  }

  const category = await createCategory(validation.data);

  return { data: category, status: 201 };
}, 'POST /api/categories');
