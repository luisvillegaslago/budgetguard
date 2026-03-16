/**
 * BudgetGuard Transaction Status API
 * PATCH /api/transactions/[id]/status - Quick status update (mark as paid/pending/cancelled)
 */

import { API_ERROR } from '@/constants/finance';
import { UpdateTransactionStatusSchema, validateRequest } from '@/schemas/transaction';
import { updateTransactionStatus } from '@/services/database/TransactionRepository';
import { notFound, parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';

export const PATCH = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const transactionId = parseIdParam(id);
  if (typeof transactionId !== 'number') return transactionId;

  const body = await request.json();
  const validation = validateRequest(UpdateTransactionStatusSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const transaction = await updateTransactionStatus(transactionId, validation.data.status);
  if (!transaction) return notFound(API_ERROR.NOT_FOUND.TRANSACTION);

  return { data: transaction };
}, 'PATCH /api/transactions/[id]/status');
