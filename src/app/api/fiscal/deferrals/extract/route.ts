/**
 * POST /api/fiscal/deferrals/extract — Read an AEAT resolución de aplazamiento/fraccionamiento
 *
 * Runs Claude Vision over the uploaded letter and returns its header plus every row of ANEXO I,
 * amounts already in cents. Persists NOTHING — no Blob, no database — so a bad reading costs a
 * retry and never a cleanup; the import wizard uses the answer to pre-fill its confirm screen, and
 * only the confirmed payload reaches POST /api/fiscal/deferrals.
 *
 * Vision rather than the PDF text layer on purpose: these letters print each AEAT label two lines
 * away from its own value, and reading that has already produced a misreading in this project.
 * See src/services/ocr/DeferralExtractor.ts.
 */

import { API_ERROR } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import { VisionApiError } from '@/services/ocr/anthropicVision';
import { extractDeferral } from '@/services/ocr/DeferralExtractor';
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
    // The vision bridge resolves the media type from the file's own bytes and rejects unsupported
    // formats with a ValidationError (400). A truncated answer surfaces as INVALID_RESPONSE rather
    // than as a half-read ANEXO I, which is why the extractor raises the token ceiling.
    const extracted = await extractDeferral(buffer, file.type, file.name);

    return { data: extracted };
  } catch (error) {
    if (!(error instanceof VisionApiError)) throw error;

    return visionFailureResponse(error, {
      fallbackCode: API_ERROR.FISCAL.DEFERRAL_EXTRACTION_FAILED,
      logLabel: '[OCR] Deferral extraction failed',
    });
  }
}, 'POST /api/fiscal/deferrals/extract');
