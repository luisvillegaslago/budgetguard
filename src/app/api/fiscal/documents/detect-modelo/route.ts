/**
 * POST /api/fiscal/documents/detect-modelo — Detect the AEAT modelo from an upload
 * Runs Claude Vision on the uploaded file and returns the detected metadata.
 * Does NOT persist anything (no Blob, no DB) — the UI uses it to pre-fill the
 * upload form before the real upload happens.
 */

import { NextResponse } from 'next/server';
import { API_ERROR } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import { detectModelo } from '@/services/ocr/ModeloDetector';
import { validationError, withApiHandler } from '@/utils/apiHandler';

export const POST = withApiHandler(async (request) => {
  // Scope the route to an authenticated user even though nothing is persisted
  await getUserIdOrThrow();

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return validationError({ file: [API_ERROR.FISCAL.FILE_REQUIRED] });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const detected = await detectModelo(buffer, file.type || 'application/octet-stream', file.name);

    return { data: detected };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    // biome-ignore lint/suspicious/noConsole: OCR error logging
    console.error('[OCR] Modelo detection failed:', message);

    let errorCode: string = API_ERROR.FISCAL.DETECTION_FAILED;
    if (message.includes('credit balance')) errorCode = 'api_credits_exhausted';

    return NextResponse.json({ success: false, error: errorCode }, { status: 502 });
  }
}, 'POST /api/fiscal/documents/detect-modelo');
