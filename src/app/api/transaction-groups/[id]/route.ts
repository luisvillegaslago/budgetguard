/**
 * BudgetGuard Transaction Groups API - Single Resource
 * DELETE /api/transaction-groups/[id] - Delete a group and all its transactions
 * PATCH /api/transaction-groups/[id] - Update group description/date (propagates to all)
 */

import { API_ERROR } from '@/constants/finance';
import { UpdateTransactionGroupSchema, validateRequest } from '@/schemas/transaction';
import {
  deleteTransactionGroup,
  getTransactionsByGroupId,
  updateTransactionGroup,
} from '@/services/database/TransactionRepository';
import { notFound, parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const groupId = parseIdParam(id);
  if (typeof groupId !== 'number') return groupId;

  const transactions = await getTransactionsByGroupId(groupId);
  if (transactions.length === 0) return notFound(API_ERROR.NOT_FOUND.GROUP);

  return { data: transactions };
}, 'GET /api/transaction-groups/[id]');

export const DELETE = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const groupId = parseIdParam(id);
  if (typeof groupId !== 'number') return groupId;

  const deleted = await deleteTransactionGroup(groupId);
  if (!deleted) return notFound(API_ERROR.NOT_FOUND.GROUP);

  return { data: { deleted: true } };
}, 'DELETE /api/transaction-groups/[id]');

export const PATCH = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const groupId = parseIdParam(id);
  if (typeof groupId !== 'number') return groupId;

  const existing = await getTransactionsByGroupId(groupId);
  if (existing.length === 0) return notFound(API_ERROR.NOT_FOUND.GROUP);

  const body = await request.json();
  const validation = validateRequest(UpdateTransactionGroupSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const transactions = await updateTransactionGroup(groupId, validation.data);

  return { data: transactions };
}, 'PATCH /api/transaction-groups/[id]');
