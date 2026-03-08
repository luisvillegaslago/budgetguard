/**
 * BudgetGuard Category API - Single Resource
 * GET /api/categories/[id] - Get a category
 * PUT /api/categories/[id] - Update a category
 * DELETE /api/categories/[id] - Delete a category
 */

import { UpdateCategorySchema, validateRequest } from '@/schemas/transaction';
import {
  deleteCategory,
  getCategoryById,
  getCategoryChildrenCount,
  getCategoryTransactionCount,
  updateCategory,
} from '@/services/database/CategoryRepository';
import { conflict, notFound, parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const categoryId = parseIdParam(id);
  if (typeof categoryId !== 'number') return categoryId;

  const category = await getCategoryById(categoryId);
  if (!category) return notFound('Categoria no encontrada');

  return { data: category };
}, 'GET /api/categories/[id]');

export const PUT = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const categoryId = parseIdParam(id);
  if (typeof categoryId !== 'number') return categoryId;

  const body = await request.json();
  const validation = validateRequest(UpdateCategorySchema, body);
  if (!validation.success) return validationError(validation.errors);

  const category = await updateCategory(categoryId, validation.data);
  if (!category) return notFound('Categoria no encontrada');

  return { data: category };
}, 'PUT /api/categories/[id]');

export const DELETE = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const categoryId = parseIdParam(id);
  if (typeof categoryId !== 'number') return categoryId;

  const transactionCount = await getCategoryTransactionCount(categoryId);
  if (transactionCount > 0) {
    return conflict('has-transactions', { count: transactionCount });
  }

  const childrenCount = await getCategoryChildrenCount(categoryId);
  if (childrenCount > 0) {
    return conflict('has-subcategories', { count: childrenCount });
  }

  const deleted = await deleteCategory(categoryId);
  if (!deleted) return notFound('Categoria no encontrada');

  return { data: { deleted: true } };
}, 'DELETE /api/categories/[id]');
