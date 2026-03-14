/**
 * Fetch a private Vercel Blob.
 * Uses getDownloadUrl() for signed URLs on Vercel, falls back to Authorization header locally.
 */

import { getDownloadUrl } from '@vercel/blob';

export async function fetchBlob(blobUrl: string): Promise<Response> {
  // Try signed URL first (works on Vercel)
  const signedUrl = await getDownloadUrl(blobUrl);
  const response = await fetch(signedUrl);
  if (response.ok) return response;

  // Fallback: direct fetch with Authorization header (works locally)
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    const authResponse = await fetch(blobUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (authResponse.ok) return authResponse;
  }

  return response;
}
