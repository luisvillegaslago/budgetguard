/**
 * POST /api/fiscal/documents/[id]/link-transaction
 * Atomic operation: creates a transaction AND links it to the fiscal document.
 * Updates the document's TaxAmountCents with the confirmed amount.
 */

import type { TransactionType } from '@/constants/finance';
import { API_ERROR, SHARED_EXPENSE } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import { LinkTransactionSchema } from '@/schemas/fiscal-document';
import { validateRequest } from '@/schemas/transaction';
import {
  getDocumentById,
  linkTransaction,
  updateDocumentAfterLink,
} from '@/services/database/FiscalDocumentRepository';
import { createTransaction } from '@/services/database/TransactionRepository';
import { notFound, parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';

export const POST = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const documentId = parseIdParam(id);
  if (typeof documentId !== 'number') return documentId;

  await getUserIdOrThrow();
  const document = await getDocumentById(documentId);
  if (!document) return notFound(API_ERROR.NOT_FOUND.DOCUMENT);

  const body = await request.json();
  const validation = validateRequest(LinkTransactionSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const data = validation.data;
  const isShared = data.isShared ?? false;

  // Create transaction
  const transaction = await createTransaction({
    categoryId: data.categoryId,
    amountCents: data.amountCents,
    description: data.description ?? undefined,
    transactionDate: new Date(data.transactionDate),
    type: data.type as TransactionType,
    sharedDivisor: isShared ? SHARED_EXPENSE.DIVISOR : SHARED_EXPENSE.DEFAULT_DIVISOR,
    originalAmountCents: isShared ? data.amountCents * SHARED_EXPENSE.DIVISOR : null,
    vatPercent: data.vatPercent ?? null,
    deductionPercent: data.deductionPercent ?? null,
    vendorName: data.vendorName ?? null,
    invoiceNumber: data.invoiceNumber ?? null,
    companyId: data.companyId ?? null,
  });

  // Link and update document with confirmed amount
  await linkTransaction(documentId, transaction.transactionId);

  // Store the invoice total (original pre-÷2 amount) as TaxAmountCents
  const invoiceAmount = isShared ? data.amountCents * SHARED_EXPENSE.DIVISOR : data.amountCents;
  const quarter = data.transactionDate ? Math.ceil((new Date(data.transactionDate).getUTCMonth() + 1) / 3) : null;
  await updateDocumentAfterLink(documentId, invoiceAmount, quarter, data.companyId ?? null);

  return {
    data: {
      transactionId: transaction.transactionId,
      documentId,
    },
  };
}, 'POST /api/fiscal/documents/[id]/link-transaction');
