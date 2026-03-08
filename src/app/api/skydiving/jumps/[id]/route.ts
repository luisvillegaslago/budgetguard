/**
 * BudgetGuard Skydiving Jump Detail API
 * GET /api/skydiving/jumps/[id] - Get single jump
 * PUT /api/skydiving/jumps/[id] - Update jump
 * DELETE /api/skydiving/jumps/[id] - Delete jump
 */

import { UpdateJumpSchema } from '@/schemas/skydive';
import { validateRequest } from '@/schemas/transaction';
import { deleteJump, getJumpById, updateJump } from '@/services/database/SkydiveRepository';
import { notFound, parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const jumpId = parseIdParam(id);
  if (typeof jumpId !== 'number') return jumpId;

  const jump = await getJumpById(jumpId);
  if (!jump) return notFound('Jump not found');

  return { data: jump };
}, 'GET /api/skydiving/jumps/[id]');

export const PUT = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const jumpId = parseIdParam(id);
  if (typeof jumpId !== 'number') return jumpId;

  const body = await request.json();
  const validation = validateRequest(UpdateJumpSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const jump = await updateJump(jumpId, validation.data);
  if (!jump) return notFound('Jump not found');

  return { data: jump };
}, 'PUT /api/skydiving/jumps/[id]');

export const DELETE = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const jumpId = parseIdParam(id);
  if (typeof jumpId !== 'number') return jumpId;

  await deleteJump(jumpId);

  return { data: { deleted: true } };
}, 'DELETE /api/skydiving/jumps/[id]');
