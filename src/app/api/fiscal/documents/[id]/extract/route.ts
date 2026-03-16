/**
 * POST /api/fiscal/documents/[id]/extract — Run OCR on a fiscal document
 * Downloads from Vercel Blob, runs Claude Vision, returns extracted data.
 * Does NOT persist extracted data — the UI uses it to pre-fill the confirmation modal.
 * Auto-match with transactions happens here; linking happens in link-transaction endpoint.
 */

import { NextResponse } from 'next/server';
import { API_ERROR } from '@/constants/finance';
import type { Locale } from '@/libs/i18n';
import { DEFAULT_LOCALE, isValidLocale } from '@/libs/i18n';
import {
  findMatchingTransaction,
  findMatchingTransactionGroup,
  getDocumentBlobUrl,
  getDocumentById,
  linkTransaction,
  linkTransactionGroup,
  updateDocumentAfterLink,
  updateDocumentOcrFields,
} from '@/services/database/FiscalDocumentRepository';
import { extractFromDocument } from '@/services/ocr/DocumentExtractor';
import { notFound, parseIdParam, withApiHandler } from '@/utils/apiHandler';
import { fetchBlob } from '@/utils/blobFetch';

export const POST = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const documentId = parseIdParam(id);
  if (typeof documentId !== 'number') return documentId;

  const document = await getDocumentById(documentId);
  if (!document) return notFound(API_ERROR.NOT_FOUND.DOCUMENT);

  const localeParam = new URL(request.url).searchParams.get('locale') ?? '';
  const validatedLocale: Locale = isValidLocale(localeParam) ? localeParam : DEFAULT_LOCALE;

  try {
    // Download document from blob storage
    const blobInfo = await getDocumentBlobUrl(documentId);
    if (!blobInfo) return notFound(API_ERROR.NOT_FOUND.DOCUMENT_BLOB);

    const blobResponse = await fetchBlob(blobInfo.blobUrl);
    if (!blobResponse.ok) {
      return NextResponse.json({ success: false, error: API_ERROR.FISCAL.EXTRACTION_FAILED }, { status: 502 });
    }

    const buffer = Buffer.from(await blobResponse.arrayBuffer());

    // Run OCR — returns extracted data without persisting
    const extractedData = await extractFromDocument(buffer, blobInfo.contentType, blobInfo.fileName, validatedLocale);

    // Store atomic OCR fields (display name computed at query time via SQL)
    await updateDocumentOcrFields(documentId, extractedData.date, extractedData.vendor);

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

    let errorCode: string = API_ERROR.FISCAL.EXTRACTION_FAILED;
    if (message.includes('credit balance')) errorCode = 'api_credits_exhausted';
    else if (message.includes('validation failed') || message.includes('totalAmountEuros'))
      errorCode = 'unrecognizable_amount';

    return NextResponse.json({ success: false, error: errorCode }, { status: 502 });
  }
}, 'POST /api/fiscal/documents/[id]/extract');
