/**
 * Shared Zod helpers for form/request schemas.
 */

import { z } from 'zod';

/**
 * Required positive number whose i18n message also covers the "empty form field
 * coerced to NaN" case. Without required_error/invalid_type_error, an empty
 * numeric input (NaN) fails the base `z.number()` check and the UI leaks Zod's
 * default "Expected number, received nan" instead of the translated message.
 */
export function requiredPositiveNumber(messageKey: string) {
  return z.number({ required_error: messageKey, invalid_type_error: messageKey }).positive(messageKey);
}

/** Same as {@link requiredPositiveNumber} but for integer ids/counters. */
export function requiredPositiveInt(messageKey: string) {
  return z.number({ required_error: messageKey, invalid_type_error: messageKey }).int().positive(messageKey);
}
