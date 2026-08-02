/**
 * Vision failure → HTTP response
 * Shared by the OCR endpoints so a provider failure always answers 502 with a
 * code the upload UI understands. Anything that is not a VisionApiError is our
 * own fault and must reach withApiHandler's 500 path instead.
 */

import { NextResponse } from 'next/server';
import { OCR_ERROR_CODE, VISION_FAILURE } from '@/constants/finance';
import type { VisionApiError } from '@/services/ocr/anthropicVision';

const BAD_GATEWAY = 502;

interface VisionErrorOptions {
  /** Code returned when the provider failed for any reason other than credits */
  fallbackCode: string;
  /** Code returned when the model answered with something unusable */
  invalidResponseCode?: string;
  /** Prefix for the server log line */
  logLabel: string;
}

export function visionFailureResponse(error: VisionApiError, options: VisionErrorOptions): NextResponse {
  // biome-ignore lint/suspicious/noConsole: OCR error logging
  console.error(`${options.logLabel} (${error.reason}):`, error.message);

  const errorCode =
    error.reason === VISION_FAILURE.CREDITS_EXHAUSTED
      ? OCR_ERROR_CODE.API_CREDITS_EXHAUSTED
      : error.reason === VISION_FAILURE.INVALID_RESPONSE
        ? (options.invalidResponseCode ?? options.fallbackCode)
        : options.fallbackCode;

  return NextResponse.json({ success: false, error: errorCode }, { status: BAD_GATEWAY });
}
