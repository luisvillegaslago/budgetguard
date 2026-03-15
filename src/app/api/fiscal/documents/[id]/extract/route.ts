/**
 * POST /api/fiscal/documents/[id]/extract — Run OCR on a fiscal document
 * Downloads from Vercel Blob, runs Claude Vision, returns extracted data.
 * Does NOT persist extracted data — the UI uses it to pre-fill the confirmation modal.
 * Auto-match with transactions happens here; linking happens in link-transaction endpoint.
 */

import { NextResponse } from 'next/server';
import {
  findMatchingTransaction,
  findMatchingTransactionGroup,
  getDocumentBlobUrl,
  getDocumentById,
  linkTransaction,
  linkTransactionGroup,
  updateDocumentAfterLink,
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

  try {
    // Download document from blob storage
    const blobInfo = await getDocumentBlobUrl(documentId);
    if (!blobInfo) return notFound('Document blob not found');

    const blobResponse = await fetchBlob(blobInfo.blobUrl);
    if (!blobResponse.ok) {
      return NextResponse.json({ success: false, error: 'extraction_failed' }, { status: 502 });
    }

    const buffer = Buffer.from(await blobResponse.arrayBuffer());

    // Run OCR — returns extracted data without persisting
    const extractedData = await extractFromDocument(buffer, blobInfo.contentType, blobInfo.fileName);

    // Auto-match: try single transaction, then group
    let matchedTransactionId: number | null = null;
    let matchedGroupId: number | null = null;

    if (extractedData.date && extractedData.totalAmountCents) {
      matchedTransactionId = await findMatchingTransaction(extractedData.totalAmountCents, extractedData.date);
      if (matchedTransactionId) {
        await linkTransaction(documentId, matchedTransactionId);
        const quarter = Math.ceil((new Date(extractedData.date).getUTCMonth() + 1) / 3);
        await updateDocumentAfterLink(documentId, extractedData.totalAmountCents, quarter, null);
        // biome-ignore lint/suspicious/noConsole: OCR match logging
        console.log(`[OCR] Auto-linked document ${documentId} → transaction ${matchedTransactionId}`);
      } else {
        matchedGroupId = await findMatchingTransactionGroup(
          extractedData.totalAmountCents,
          extractedData.date,
          document.companyId,
        );
        if (matchedGroupId) {
          await linkTransactionGroup(documentId, matchedGroupId);
          const quarter = Math.ceil((new Date(extractedData.date).getUTCMonth() + 1) / 3);
          await updateDocumentAfterLink(documentId, extractedData.totalAmountCents, quarter, null);
          // biome-ignore lint/suspicious/noConsole: OCR match logging
          console.log(`[OCR] Auto-linked document ${documentId} → group ${matchedGroupId}`);
        }
      }
    }

    return {
      data: extractedData,
      meta: {
        ...(matchedTransactionId ? { matchedTransactionId } : {}),
        ...(matchedGroupId ? { matchedGroupId } : {}),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    // biome-ignore lint/suspicious/noConsole: OCR error logging
    console.error(`[OCR] Extraction failed for document ${documentId}:`, message);

    let errorCode = 'extraction_failed';
    if (message.includes('credit balance')) errorCode = 'api_credits_exhausted';
    else if (message.includes('validation failed') || message.includes('totalAmountEuros'))
      errorCode = 'unrecognizable_amount';

    return NextResponse.json({ success: false, error: errorCode }, { status: 502 });
  }
}, 'POST /api/fiscal/documents/[id]/extract');
