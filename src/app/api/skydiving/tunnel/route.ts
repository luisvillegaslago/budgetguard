/**
 * BudgetGuard Tunnel Sessions API
 * GET /api/skydiving/tunnel - List all tunnel sessions
 * POST /api/skydiving/tunnel - Create a new tunnel session
 */

import { SKYDIVE_CATEGORY } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import { CreateTunnelSessionSchema } from '@/schemas/skydive';
import { validateRequest } from '@/schemas/transaction';
import {
  createTunnelSession,
  findSkydiveSubcategoryId,
  getAllTunnelSessions,
} from '@/services/database/SkydiveRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';
import { eurosToCents } from '@/utils/money';

export const GET = withApiHandler(async (request) => {
  const { searchParams } = request.nextUrl;
  const year = searchParams.get('year');
  const location = searchParams.get('location');
  const page = searchParams.get('page');
  const limit = searchParams.get('limit');

  const filters = {
    ...(year ? { year: Number(year) } : {}),
    ...(location ? { location } : {}),
    ...(page ? { page: Number(page) } : {}),
    ...(limit ? { limit: Number(limit) } : {}),
  };

  const result = await getAllTunnelSessions(filters);

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
}, 'GET /api/skydiving/tunnel');

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const validation = validateRequest(CreateTunnelSessionSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const { price, durationMin, ...rest } = validation.data;
  const priceCents = price != null ? eurosToCents(price) : null;

  let categoryId: number | null = null;
  if (priceCents != null && priceCents > 0) {
    const userId = await getUserIdOrThrow();
    categoryId = await findSkydiveSubcategoryId(SKYDIVE_CATEGORY.SUBCATEGORY.TUNNEL, userId);
  }

  const session = await createTunnelSession({
    ...rest,
    durationSec: Math.round(durationMin * 60),
    priceCents,
    categoryId,
  });

  return { data: session, status: 201 };
}, 'POST /api/skydiving/tunnel');
