/**
 * Shared API error extraction utility.
 * Used by frontend hooks to extract a meaningful error key from API responses.
 */

import type { ApiResponse } from '@/types/finance';

/**
 * Extract an error key from an API response, falling back to the provided key.
 * The returned string is an i18n key that the frontend translates via t().
 */
export function extractApiErrorKey(errorData: ApiResponse<never>, fallbackKey: string): string {
  if (errorData.error) return errorData.error;
  if (errorData.errors) {
    const messages = Object.values(errorData.errors).flat();
    if (messages.length > 0) return messages.join('. ');
  }
  return fallbackKey;
}
