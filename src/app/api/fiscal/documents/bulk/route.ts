/**
 * POST /api/fiscal/documents/bulk — Bulk upload multiple documents
 * Accepts multipart/form-data with multiple files + JSON metadata array
 */

import { put } from '@vercel/blob';
import { API_ERROR, FISCAL_DOCUMENT_TYPE } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import { BulkUploadItemSchema } from '@/schemas/fiscal-document';
import { bulkCreateDocuments, type CreateDocumentInput } from '@/services/database/FiscalDocumentRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';
import { buildModeloFileName, parseDocumentFilename } from '@/utils/fiscalFileParser';

interface BulkUploadResult {
  fileName: string;
  success: boolean;
  error?: string;
  documentId?: number;
}

export const POST = withApiHandler(async (request) => {
  const userId = await getUserIdOrThrow();
  const formData = await request.formData();

  // Collect files
  const files: File[] = [];
  formData.getAll('files').forEach((entry) => {
    if (entry instanceof File) files.push(entry);
  });

  if (files.length === 0) {
    return validationError({ files: [API_ERROR.FISCAL.FILE_REQUIRED] });
  }

  // Parse optional metadata overrides
  const metadataJson = formData.get('metadata') as string | null;
  const metadataOverrides: Record<string, unknown>[] = metadataJson ? JSON.parse(metadataJson) : [];

  const results: BulkUploadResult[] = [];
  const validEntries: { input: CreateDocumentInput; originalFileName: string }[] = [];

  // Process each file
  await Promise.all(
    files.map(async (file, index) => {
      try {
        // Auto-detect metadata from filename, merge with overrides
        const parsed = parseDocumentFilename(file.name);
        const override = metadataOverrides[index] || {};
        const merged = { ...parsed, ...override };

        // Apply defaults for missing year
        if (!merged.fiscalYear) {
          merged.fiscalYear = new Date().getFullYear();
        }

        // Validate
        const validation = BulkUploadItemSchema.safeParse(merged);
        if (!validation.success) {
          results.push({ fileName: file.name, success: false, error: validation.error.message });
          return;
        }

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

        validEntries.push({
          originalFileName: file.name,
          input: {
            documentType: validation.data.documentType,
            modeloType: validation.data.modeloType ?? null,
            fiscalYear: validation.data.fiscalYear,
            fiscalQuarter: validation.data.fiscalQuarter ?? null,
            status: validation.data.status,
            blobUrl: blob.url,
            blobPathname: blob.pathname,
            fileName: finalFileName,
            fileSizeBytes: file.size,
            contentType: file.type || 'application/octet-stream',
            taxAmountCents: null,
            transactionId: null,
            transactionGroupId: null,
            companyId: null,
            description: validation.data.description ?? null,
          },
        });
      } catch (err) {
        results.push({
          fileName: file.name,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }),
  );

  // Bulk insert valid documents (bulkCreateDocuments preserves input order)
  if (validEntries.length > 0) {
    const created = await bulkCreateDocuments(validEntries.map((e) => e.input));
    created.forEach((doc, i) => {
      results.push({
        fileName: validEntries[i]?.originalFileName ?? doc.fileName,
        success: true,
        documentId: doc.documentId,
      });
    });
  }

  return {
    data: {
      results,
      total: files.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    },
  };
}, 'POST /api/fiscal/documents/bulk');
