/**
 * Typed API errors
 *
 * Repositories and services throw these instead of plain `Error` when the fault
 * belongs to the caller (bad input, missing resource). `withApiHandler` maps them
 * to the matching HTTP status, so user faults never surface as a logged 500.
 * Every instance carries an i18n key from `API_ERROR` — never a raw message.
 */

/** Base class for errors that map to a specific HTTP status instead of 500. */
abstract class ApiError extends Error {
  /** i18n key from `API_ERROR`, returned to the client as `{ error }` */
  readonly errorKey: string;

  constructor(errorKey: string, detail?: string) {
    super(detail ?? errorKey);
    this.errorKey = errorKey;
  }
}

/** The requested resource does not exist (or belongs to another user) → 404 */
export class NotFoundError extends ApiError {
  constructor(errorKey: string, detail?: string) {
    super(errorKey, detail);
    this.name = 'NotFoundError';
  }
}

/** The request is well-formed but not applicable to the resource state → 400 */
export class ValidationError extends ApiError {
  constructor(errorKey: string, detail?: string) {
    super(errorKey, detail);
    this.name = 'ValidationError';
  }
}
