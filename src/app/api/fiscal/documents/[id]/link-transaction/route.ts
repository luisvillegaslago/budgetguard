/**
 * POST /api/fiscal/documents/[id]/link-transaction
 * Atomic operation: creates a transaction AND links it to the fiscal document.
 * Avoids intermediate states where the transaction exists but isn't linked.
 */

import type { TransactionType } from '@/constants/finance';
import { SHARED_EXPENSE } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import { LinkTransactionSchema } from '@/schemas/fiscal-document';
import { validateRequest } from '@/schemas/transaction';
import { getDocumentById, linkTransaction } from '@/services/database/FiscalDocumentRepository';
import { createTransaction } from '@/services/database/TransactionRepository';
import { notFound, parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';

export const POST = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const documentId = parseIdParam(id);
  if (typeof documentId !== 'number') return documentId;

  // Verify document exists and belongs to user
  await getUserIdOrThrow();
  const document = await getDocumentById(documentId);
  if (!document) return notFound('Document not found');

  const body = await request.json();
  const validation = validateRequest(LinkTransactionSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const data = validation.data;

  // Create transaction
  const transaction = await createTransaction({
    categoryId: data.categoryId,
    amountCents: data.amountCents,
    description: data.description ?? undefined,
    transactionDate: new Date(data.transactionDate),
    type: data.type as TransactionType,
    sharedDivisor: data.isShared ? SHARED_EXPENSE.DIVISOR : SHARED_EXPENSE.DEFAULT_DIVISOR,
    originalAmountCents: data.isShared ? data.amountCents * SHARED_EXPENSE.DIVISOR : null,
    vatPercent: data.vatPercent ?? null,
    deductionPercent: data.deductionPercent ?? null,
    vendorName: data.vendorName ?? null,
    invoiceNumber: data.invoiceNumber ?? null,
    companyId: data.companyId ?? null,
  });

  // Link transaction to document
  await linkTransaction(documentId, transaction.transactionId);

  return {
    data: {
      transactionId: transaction.transactionId,
      documentId,
    },
  };
}, 'POST /api/fiscal/documents/[id]/link-transaction');
