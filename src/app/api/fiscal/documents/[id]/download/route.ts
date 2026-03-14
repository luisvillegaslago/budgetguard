/**
 * GET /api/fiscal/documents/[id]/download — Authenticated download proxy
 * Streams the document from Vercel Blob (private), never exposing the blob URL to the client.
 */

import { NextResponse } from 'next/server';
import { getDocumentBlobUrl } from '@/services/database/FiscalDocumentRepository';
import { notFound, parseIdParam, withApiHandler } from '@/utils/apiHandler';
import { fetchBlob } from '@/utils/blobFetch';

export const GET = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const documentId = parseIdParam(id);
  if (typeof documentId !== 'number') return documentId;

  const doc = await getDocumentBlobUrl(documentId);
  if (!doc) return notFound('Document not found');

  const blobResponse = await fetchBlob(doc.blobUrl);
  if (!blobResponse.ok) {
    return NextResponse.json({ success: false, error: 'Failed to fetch document' }, { status: 502 });
  }

  return new NextResponse(blobResponse.body, {
    status: 200,
    headers: {
      'Content-Type': doc.contentType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.fileName)}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}, 'GET /api/fiscal/documents/[id]/download');
