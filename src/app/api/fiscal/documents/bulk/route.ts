/**
 * POST /api/fiscal/documents/bulk — Bulk upload multiple documents
 * Accepts multipart/form-data with multiple files + JSON metadata array
 */

import { put } from '@vercel/blob';
import { getUserIdOrThrow } from '@/libs/auth';
import { BulkUploadItemSchema } from '@/schemas/fiscal-document';
import { bulkCreateDocuments, type CreateDocumentInput } from '@/services/database/FiscalDocumentRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';
import { parseDocumentFilename } from '@/utils/fiscalFileParser';

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
    return validationError({ files: ['At least one file is required'] });
  }

  // Parse optional metadata overrides
  const metadataJson = formData.get('metadata') as string | null;
  const metadataOverrides: Record<string, unknown>[] = metadataJson ? JSON.parse(metadataJson) : [];

  const results: BulkUploadResult[] = [];
  const validInputs: CreateDocumentInput[] = [];
  const uploadedBlobs: { url: string; fileName: string }[] = [];

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

        // Upload to Vercel Blob
        const pathname = `fiscal/${userId}/${validation.data.fiscalYear}/${file.name}`;
        const blob = await put(pathname, file, { access: 'private', addRandomSuffix: true });
        uploadedBlobs.push({ url: blob.url, fileName: file.name });

        validInputs.push({
          documentType: validation.data.documentType,
          modeloType: validation.data.modeloType ?? null,
          fiscalYear: validation.data.fiscalYear,
          fiscalQuarter: validation.data.fiscalQuarter ?? null,
          status: validation.data.status,
          blobUrl: blob.url,
          blobPathname: blob.pathname,
          fileName: file.name,
          fileSizeBytes: file.size,
          contentType: file.type || 'application/octet-stream',
          taxAmountCents: null,
          transactionId: null,
          transactionGroupId: null,
          companyId: null,
          description: validation.data.description ?? null,
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

  // Bulk insert valid documents
  if (validInputs.length > 0) {
    const created = await bulkCreateDocuments(validInputs);
    created.forEach((doc) => {
      results.push({ fileName: doc.fileName, success: true, documentId: doc.documentId });
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
