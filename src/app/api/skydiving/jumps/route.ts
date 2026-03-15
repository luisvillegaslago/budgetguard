/**
 * BudgetGuard Skydiving Jumps API
 * GET /api/skydiving/jumps - List all jumps
 * POST /api/skydiving/jumps - Create a new jump
 */

import { SKYDIVE_CATEGORY } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import { CreateJumpSchema } from '@/schemas/skydive';
import { validateRequest } from '@/schemas/transaction';
import { createJump, findSkydiveSubcategoryId, getAllJumps } from '@/services/database/SkydiveRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async (request) => {
  const { searchParams } = request.nextUrl;
  const year = searchParams.get('year');
  const dropzone = searchParams.get('dropzone');
  const page = searchParams.get('page');
  const limit = searchParams.get('limit');

  const filters = {
    ...(year ? { year: Number(year) } : {}),
    ...(dropzone ? { dropzone } : {}),
    ...(page ? { page: Number(page) } : {}),
    ...(limit ? { limit: Number(limit) } : {}),
  };

  const result = await getAllJumps(filters);

  return {
    data: result.items,
    meta: {
      count: result.items.length,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    },
  };
}, 'GET /api/skydiving/jumps');

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const validation = validateRequest(CreateJumpSchema, body);
  if (!validation.success) return validationError(validation.errors);

  let categoryId: number | null = null;
  if (validation.data.priceCents != null && validation.data.priceCents > 0) {
    const userId = await getUserIdOrThrow();
    categoryId = await findSkydiveSubcategoryId(SKYDIVE_CATEGORY.SUBCATEGORY.JUMPS, userId);
  }

  const jump = await createJump({ ...validation.data, categoryId });

  return { data: jump, status: 201 };
}, 'POST /api/skydiving/jumps');
