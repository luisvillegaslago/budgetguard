/**
 * BudgetGuard Tunnel Session Detail API
 * PUT /api/skydiving/tunnel/[id] - Update tunnel session
 * DELETE /api/skydiving/tunnel/[id] - Delete tunnel session
 */

import { API_ERROR } from '@/constants/finance';
import { UpdateTunnelSessionSchema } from '@/schemas/skydive';
import { validateRequest } from '@/schemas/transaction';
import { deleteTunnelSession, updateTunnelSession } from '@/services/database/SkydiveRepository';
import { notFound, parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';
import { eurosToCents } from '@/utils/money';

export const PUT = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const sessionId = parseIdParam(id);
  if (typeof sessionId !== 'number') return sessionId;

  const body = await request.json();
  const validation = validateRequest(UpdateTunnelSessionSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const { price, durationMin, ...rest } = validation.data;
  const payload = {
    ...rest,
    ...(durationMin !== undefined ? { durationSec: Math.round(durationMin * 60) } : {}),
    ...(price !== undefined ? { priceCents: price != null ? eurosToCents(price) : null } : {}),
  };
  const session = await updateTunnelSession(sessionId, payload);
  if (!session) return notFound(API_ERROR.NOT_FOUND.TUNNEL_SESSION);

  return { data: session };
}, 'PUT /api/skydiving/tunnel/[id]');

export const DELETE = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const sessionId = parseIdParam(id);
  if (typeof sessionId !== 'number') return sessionId;

  await deleteTunnelSession(sessionId);

  return { data: { deleted: true } };
}, 'DELETE /api/skydiving/tunnel/[id]');
