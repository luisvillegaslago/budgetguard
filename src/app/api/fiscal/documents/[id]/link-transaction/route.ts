/**
 * POST /api/fiscal/documents/[id]/link-transaction
 * Creates a transaction and links it to the fiscal document, then updates the document's
 * TaxAmountCents with the confirmed amount.
 *
 * A document that is already linked (the OCR extract auto-links on a match) answers 409 unless the
 * body carries replaceExistingLink: creating on top of a correct match books the same invoice twice
 * in the 303/130, while a wrong match still has to be replaceable.
 */

import { API_ERROR, SHARED_EXPENSE, VAT_DEDUCTION_INHERITS_IRPF } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import { LinkTransactionSchema } from '@/schemas/fiscal-document';
import { validateRequest } from '@/schemas/transaction';
import {
  getDocumentById,
  linkTransaction,
  updateDocumentAfterLink,
} from '@/services/database/FiscalDocumentRepository';
import { createTransaction } from '@/services/database/TransactionRepository';
import { conflict, notFound, parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';

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

  const isAlreadyLinked = document.transactionId != null || document.transactionGroupId != null;
  if (isAlreadyLinked && data.replaceExistingLink !== true) {
    return conflict(API_ERROR.CONFLICT.DOCUMENT_ALREADY_LINKED);
  }

  const isShared = data.isShared ?? false;
  const sharedDivisor = isShared ? SHARED_EXPENSE.DIVISOR : SHARED_EXPENSE.DEFAULT_DIVISOR;

  // amountCents is the full invoice amount — divide for shared expenses (same as POST /api/transactions)
  const effectiveAmount = isShared ? Math.ceil(data.amountCents / sharedDivisor) : data.amountCents;

  // createTransaction checks that categoryId and companyId are the caller's own before inserting,
  // which also covers the companyId written onto the document below.
  const transaction = await createTransaction({
    categoryId: data.categoryId,
    amountCents: effectiveAmount,
    description: data.description ?? undefined,
    transactionDate: new Date(data.transactionDate),
    type: data.type,
    sharedDivisor,
    originalAmountCents: isShared ? data.amountCents : null,
    vatPercent: data.vatPercent ?? null,
    deductionPercent: data.deductionPercent ?? null,
    vatDeductionPercent: data.vatDeductionPercent ?? VAT_DEDUCTION_INHERITS_IRPF,
    vendorName: data.vendorName ?? null,
    invoiceNumber: data.invoiceNumber ?? null,
    companyId: data.companyId ?? null,
  });

  // Link and update document with the full invoice amount (TaxAmountCents = invoice total)
  await linkTransaction(documentId, transaction.transactionId);
  const quarter = data.transactionDate ? Math.ceil((new Date(data.transactionDate).getUTCMonth() + 1) / 3) : null;
  await updateDocumentAfterLink(documentId, data.amountCents, quarter, data.companyId ?? null);

  return {
    data: {
      transactionId: transaction.transactionId,
      documentId,
    },
  };
}, 'POST /api/fiscal/documents/[id]/link-transaction');
