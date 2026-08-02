/**
 * POST /api/fiscal/documents/detect-modelo — Detect the AEAT modelo from an upload
 * Runs Claude Vision on the uploaded file and returns the detected metadata.
 * Does NOT persist anything (no Blob, no DB) — the UI uses it to pre-fill the
 * upload form before the real upload happens.
 */

import { API_ERROR } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import { VisionApiError } from '@/services/ocr/anthropicVision';
import { detectModelo } from '@/services/ocr/ModeloDetector';
import { validationError, withApiHandler } from '@/utils/apiHandler';
import { visionFailureResponse } from '@/utils/visionErrorResponse';

export const POST = withApiHandler(async (request) => {
  // Scope the route to an authenticated user even though nothing is persisted
  await getUserIdOrThrow();

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return validationError({ file: [API_ERROR.FISCAL.FILE_REQUIRED] });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    // The vision bridge resolves the media type from the file's own bytes and
    // rejects unsupported formats with a ValidationError (400)
    const detected = await detectModelo(buffer, file.type, file.name);

    return { data: detected };
  } catch (error) {
    if (!(error instanceof VisionApiError)) throw error;

    return visionFailureResponse(error, {
      fallbackCode: API_ERROR.FISCAL.DETECTION_FAILED,
      logLabel: '[OCR] Modelo detection failed',
    });
  }
}, 'POST /api/fiscal/documents/detect-modelo');
