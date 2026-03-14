/**
 * GET /api/fiscal/documents/[id]/download — Authenticated download proxy
 * Streams the document from Vercel Blob (private), never exposing the blob URL to the client.
 * Uses getDownloadUrl() to get a time-limited signed URL for private blobs.
 */

import { getDownloadUrl } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { getDocumentBlobUrl } from '@/services/database/FiscalDocumentRepository';
import { notFound, parseIdParam, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const documentId = parseIdParam(id);
  if (typeof documentId !== 'number') return documentId;

  const doc = await getDocumentBlobUrl(documentId);
  if (!doc) return notFound('Document not found');

  // Get a signed download URL for the private blob
  const signedUrl = await getDownloadUrl(doc.blobUrl);

  // Fetch from Vercel Blob using signed URL and stream to client
  const blobResponse = await fetch(signedUrl);
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
