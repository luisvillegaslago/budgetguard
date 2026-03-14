/**
 * GET /api/fiscal/documents/[id] — Document metadata (no blobUrl)
 * PATCH /api/fiscal/documents/[id] — Update document status
 * DELETE /api/fiscal/documents/[id] — Delete document + blob
 */

import { del } from '@vercel/blob';
import { FiscalDocumentStatusSchema } from '@/schemas/fiscal-document';
import { validateRequest } from '@/schemas/transaction';
import { deleteDocument, getDocumentById, updateDocumentStatus } from '@/services/database/FiscalDocumentRepository';
import { notFound, parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const documentId = parseIdParam(id);
  if (typeof documentId !== 'number') return documentId;

  const document = await getDocumentById(documentId);
  if (!document) return notFound('Document not found');

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
  if (!document) return notFound('Document not found');

  return { data: document };
}, 'PATCH /api/fiscal/documents/[id]');

export const DELETE = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const documentId = parseIdParam(id);
  if (typeof documentId !== 'number') return documentId;

  const blobUrl = await deleteDocument(documentId);
  if (!blobUrl) return notFound('Document not found');

  // Delete from Vercel Blob
  await del(blobUrl);

  return { data: { deleted: true } };
}, 'DELETE /api/fiscal/documents/[id]');
