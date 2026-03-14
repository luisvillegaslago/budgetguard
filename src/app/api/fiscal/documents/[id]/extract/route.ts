/**
 * POST /api/fiscal/documents/[id]/extract — Run OCR extraction on a fiscal document
 * Downloads the document from Vercel Blob, sends to Claude Vision, saves result.
 * After extraction, attempts to auto-match:
 *   1. Single transaction (exact or shared ÷2)
 *   2. Transaction group (multiple transactions from same vendor summing to invoice total)
 */

import { NextResponse } from 'next/server';
import { EXTRACTION_STATUS, FISCAL_STATUS } from '@/constants/finance';
import {
  findMatchingTransaction,
  findMatchingTransactionGroup,
  getDocumentBlobUrl,
  getDocumentById,
  linkTransaction,
  linkTransactionGroup,
  updateDocumentPostExtraction,
  updateExtraction,
  updateExtractionStatus,
} from '@/services/database/FiscalDocumentRepository';
import { extractFromDocument } from '@/services/ocr/DocumentExtractor';
import { notFound, parseIdParam, withApiHandler } from '@/utils/apiHandler';
import { fetchBlob } from '@/utils/blobFetch';

export const POST = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const documentId = parseIdParam(id);
  if (typeof documentId !== 'number') return documentId;

  const document = await getDocumentById(documentId);
  if (!document) return notFound('Document not found');

  // Mark as extracting
  await updateExtractionStatus(documentId, EXTRACTION_STATUS.EXTRACTING);

  try {
    // Get signed URL and download document
    const blobInfo = await getDocumentBlobUrl(documentId);
    if (!blobInfo) return notFound('Document blob not found');

    const blobResponse = await fetchBlob(blobInfo.blobUrl);
    if (!blobResponse.ok) {
      await updateExtractionStatus(documentId, EXTRACTION_STATUS.FAILED);
      return { data: null, status: 502 };
    }

    const buffer = Buffer.from(await blobResponse.arrayBuffer());

    // Run OCR extraction
    const extractedData = await extractFromDocument(buffer, blobInfo.contentType, blobInfo.fileName);

    // Save extraction result
    const updated = await updateExtraction(documentId, extractedData, EXTRACTION_STATUS.EXTRACTED);

    // Update status to filed + compute quarter from extracted date
    const extractedQuarter = extractedData.date
      ? Math.ceil((new Date(extractedData.date).getUTCMonth() + 1) / 3)
      : null;
    await updateDocumentPostExtraction(
      documentId,
      FISCAL_STATUS.FILED,
      extractedQuarter,
      extractedData.totalAmountCents,
    );

    // Auto-match: try single transaction first, then group
    let matchedTransactionId: number | null = null;
    let matchedGroupId: number | null = null;

    if (extractedData.date && extractedData.totalAmountCents) {
      // 1. Try single transaction match
      matchedTransactionId = await findMatchingTransaction(extractedData.totalAmountCents, extractedData.date);
      if (matchedTransactionId) {
        await linkTransaction(documentId, matchedTransactionId);
        // biome-ignore lint/suspicious/noConsole: OCR match logging
        console.log(`[OCR] Auto-linked document ${documentId} → transaction ${matchedTransactionId}`);
      } else {
        // 2. Try group match (multiple transactions from same vendor)
        matchedGroupId = await findMatchingTransactionGroup(
          extractedData.totalAmountCents,
          extractedData.date,
          document.companyId,
        );
        if (matchedGroupId) {
          await linkTransactionGroup(documentId, matchedGroupId);
          // biome-ignore lint/suspicious/noConsole: OCR match logging
          console.log(`[OCR] Auto-linked document ${documentId} → group ${matchedGroupId}`);
        } else {
          // biome-ignore lint/suspicious/noConsole: OCR match logging
          console.log(`[OCR] No matching transaction for document ${documentId}`);
        }
      }
    }

    return {
      data: updated,
      meta: {
        ...(matchedTransactionId ? { matchedTransactionId } : {}),
        ...(matchedGroupId ? { matchedGroupId } : {}),
      },
    };
  } catch (error) {
    await updateExtractionStatus(documentId, EXTRACTION_STATUS.FAILED);
    const message = error instanceof Error ? error.message : 'Extraction failed';
    // biome-ignore lint/suspicious/noConsole: OCR error logging
    console.error(`[OCR] Extraction failed for document ${documentId}:`, message);
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}, 'POST /api/fiscal/documents/[id]/extract');
