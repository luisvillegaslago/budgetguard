/**
 * GET /api/fiscal/documents — List fiscal documents filtered by year/quarter/type
 * POST /api/fiscal/documents — Upload single document (multipart/form-data)
 */

import { put } from '@vercel/blob';
import { API_ERROR, FISCAL_DOCUMENT_TYPE } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import { FiscalDocumentsFiltersSchema, FiscalDocumentUploadSchema } from '@/schemas/fiscal-document';
import { validateRequest } from '@/schemas/transaction';
import { createDocument, getDocuments } from '@/services/database/FiscalDocumentRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';
import { buildModeloFileName } from '@/utils/fiscalFileParser';

export const GET = withApiHandler(async (request) => {
  const { searchParams } = new URL(request.url);
  const filters = {
    year: searchParams.get('year'),
    quarter: searchParams.get('quarter') || undefined,
    documentType: searchParams.get('documentType') || undefined,
  };

  const validation = validateRequest(FiscalDocumentsFiltersSchema, filters);
  if (!validation.success) return validationError(validation.errors);

  const documents = await getDocuments(validation.data.year, validation.data.quarter, validation.data.documentType);

  return { data: documents };
}, 'GET /api/fiscal/documents');

export const POST = withApiHandler(async (request) => {
  const userId = await getUserIdOrThrow();
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const metadataJson = formData.get('metadata') as string | null;

  if (!file) {
    return validationError({ file: [API_ERROR.FISCAL.FILE_REQUIRED] });
  }

  if (!metadataJson) {
    return validationError({ metadata: [API_ERROR.FISCAL.METADATA_REQUIRED] });
  }

  const metadata = JSON.parse(metadataJson);
  const validation = validateRequest(FiscalDocumentUploadSchema, metadata);
  if (!validation.success) return validationError(validation.errors);

  // Normalize filename for modelos: "130 1T 2026.pdf" / "390 2026.pdf"
  const finalFileName =
    validation.data.documentType === FISCAL_DOCUMENT_TYPE.MODELO
      ? buildModeloFileName(
          validation.data.modeloType ?? null,
          validation.data.fiscalQuarter ?? null,
          validation.data.fiscalYear,
          file.name,
        )
      : file.name;

  // Upload to Vercel Blob
  const pathname = `fiscal/${userId}/${validation.data.fiscalYear}/${finalFileName}`;
  const blob = await put(pathname, file, { access: 'private', addRandomSuffix: true });

  // Insert into DB
  const document = await createDocument({
    documentType: validation.data.documentType,
    modeloType: validation.data.modeloType ?? null,
    fiscalYear: validation.data.fiscalYear,
    fiscalQuarter: validation.data.fiscalQuarter ?? null,
    status: validation.data.status ?? 'pending',
    blobUrl: blob.url,
    blobPathname: blob.pathname,
    fileName: finalFileName,
    fileSizeBytes: file.size,
    contentType: file.type || 'application/octet-stream',
    taxAmountCents: validation.data.taxAmountCents ?? null,
    transactionId: validation.data.transactionId ?? null,
    transactionGroupId: validation.data.transactionGroupId ?? null,
    companyId: validation.data.companyId ?? null,
    description: validation.data.description ?? null,
  });

  return { data: document, status: 201 };
}, 'POST /api/fiscal/documents');
