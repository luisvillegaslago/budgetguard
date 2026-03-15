/**
 * GET /api/fiscal/documents/[id] — Document metadata (no blobUrl)
 * PATCH /api/fiscal/documents/[id] — Update document status
 * DELETE /api/fiscal/documents/[id] — Delete document + blob
 */

import { del } from '@vercel/blob';
import { API_ERROR } from '@/constants/finance';
import { FiscalDocumentStatusSchema } from '@/schemas/fiscal-document';
import { validateRequest } from '@/schemas/transaction';
import { deleteDocument, getDocumentById, updateDocumentStatus } from '@/services/database/FiscalDocumentRepository';
import { deleteTransaction } from '@/services/database/TransactionRepository';
import { notFound, parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const documentId = parseIdParam(id);
  if (typeof documentId !== 'number') return documentId;

  const document = await getDocumentById(documentId);
  if (!document) return notFound(API_ERROR.NOT_FOUND.DOCUMENT);

  return { data: document };
}, 'GET /api/fiscal/documents/[id]');

export const PATCH = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const documentId = parseIdParam(id);
  if (typeof documentId !== 'number') return documentId;

  const body = await request.json();
  const validation = validateRequest(FiscalDocumentStatusSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const document = await updateDocumentStatus(documentId, validation.data.status);
  if (!document) return notFound(API_ERROR.NOT_FOUND.DOCUMENT);

  return { data: document };
}, 'PATCH /api/fiscal/documents/[id]');

export const DELETE = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const documentId = parseIdParam(id);
  if (typeof documentId !== 'number') return documentId;

  // Check if we should also delete the linked transaction
  const shouldDeleteTransaction = request.nextUrl.searchParams.get('deleteTransaction') === 'true';
  const doc = await getDocumentById(documentId);
  if (!doc) return notFound(API_ERROR.NOT_FOUND.DOCUMENT);

  // Delete linked transaction if requested
  if (shouldDeleteTransaction && doc.transactionId) {
    await deleteTransaction(doc.transactionId);
  }

  const blobUrl = await deleteDocument(documentId);
  if (!blobUrl) return notFound(API_ERROR.NOT_FOUND.DOCUMENT);

  await del(blobUrl);

  return { data: { deleted: true, transactionDeleted: shouldDeleteTransaction && !!doc.transactionId } };
}, 'DELETE /api/fiscal/documents/[id]');
