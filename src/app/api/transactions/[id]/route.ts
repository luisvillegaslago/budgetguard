/**
 * BudgetGuard Transaction API - Single Resource
 * GET /api/transactions/[id] - Get a transaction
 * PUT /api/transactions/[id] - Update a transaction
 * DELETE /api/transactions/[id] - Delete a transaction
 */

import { SHARED_EXPENSE } from '@/constants/finance';
import { CreateTransactionSchema, validateRequest } from '@/schemas/transaction';
import { syncDocumentWithTransaction, unlinkTransactionDocuments } from '@/services/database/FiscalDocumentRepository';
import {
  cleanupOrphanedGroup,
  deleteTransaction,
  getTransactionById,
  updateTransaction,
} from '@/services/database/TransactionRepository';
import { notFound, parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';
import { eurosToCents } from '@/utils/money';

export const GET = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const transactionId = parseIdParam(id);
  if (typeof transactionId !== 'number') return transactionId;

  const transaction = await getTransactionById(transactionId);
  if (!transaction) return notFound('Transaccion no encontrada');

  return { data: transaction };
}, 'GET /api/transactions/[id]');

export const PUT = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const transactionId = parseIdParam(id);
  if (typeof transactionId !== 'number') return transactionId;

  const body = await request.json();
  const validation = validateRequest(CreateTransactionSchema.partial(), body);
  if (!validation.success) return validationError(validation.errors);

  const { amount, isShared, vatPercent, deductionPercent, vendorName, invoiceNumber, ...rest } = validation.data;

  const updateData: Parameters<typeof updateTransaction>[1] = {
    ...rest,
    description: rest.description ?? undefined,
  };

  // Pass fiscal fields if provided
  if (vatPercent !== undefined) updateData.vatPercent = vatPercent ?? null;
  if (deductionPercent !== undefined) updateData.deductionPercent = deductionPercent ?? null;
  if (vendorName !== undefined) updateData.vendorName = vendorName ?? null;
  if (invoiceNumber !== undefined) updateData.invoiceNumber = invoiceNumber ?? null;

  // Convert euros to cents if amount is provided, applying shared expense halving
  if (amount !== undefined) {
    const fullAmountCents = eurosToCents(amount);
    const sharedDivisor = isShared ? SHARED_EXPENSE.DIVISOR : SHARED_EXPENSE.DEFAULT_DIVISOR;

    updateData.amountCents = isShared ? Math.ceil(fullAmountCents / sharedDivisor) : fullAmountCents;
    updateData.originalAmountCents = isShared ? fullAmountCents : null;
    updateData.sharedDivisor = sharedDivisor;
  } else if (isShared !== undefined) {
    // isShared changed but amount didn't — need to recalculate from existing transaction
    const existing = await getTransactionById(transactionId);
    if (existing) {
      const baseAmount = existing.originalAmountCents ?? existing.amountCents;
      const sharedDivisor = isShared ? SHARED_EXPENSE.DIVISOR : SHARED_EXPENSE.DEFAULT_DIVISOR;
      updateData.amountCents = isShared ? Math.ceil(baseAmount / sharedDivisor) : baseAmount;
      updateData.originalAmountCents = isShared ? baseAmount : null;
      updateData.sharedDivisor = sharedDivisor;
    }
  }

  const transaction = await updateTransaction(transactionId, updateData);
  if (!transaction) return notFound('Transaccion no encontrada');

  // Sync linked fiscal document if transaction has one
  if (transaction.fiscalDocumentId != null) {
    await syncDocumentWithTransaction(transactionId, transaction.amountCents, transaction.originalAmountCents);
  }

  return { data: transaction };
}, 'PUT /api/transactions/[id]');

export const DELETE = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const transactionId = parseIdParam(id);
  if (typeof transactionId !== 'number') return transactionId;

  // Check if transaction belongs to a group before deleting (for orphan cleanup)
  const existing = await getTransactionById(transactionId);
  if (!existing) return notFound('Transaccion no encontrada');

  // Unlink fiscal documents before deleting
  if (existing.fiscalDocumentId != null) {
    await unlinkTransactionDocuments(transactionId);
  }

  const deleted = await deleteTransaction(transactionId);
  if (!deleted) return notFound('Transaccion no encontrada');

  // Clean up orphaned group if this transaction belonged to one
  if (existing.transactionGroupId) {
    await cleanupOrphanedGroup(existing.transactionGroupId);
  }

  return { data: { deleted: true } };
}, 'DELETE /api/transactions/[id]');
