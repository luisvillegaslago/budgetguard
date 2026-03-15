/**
 * API Route Handler Wrapper
 * Eliminates boilerplate try/catch, AuthError handling, and error logging
 * across all API routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { API_ERROR } from '@/constants/finance';
import { AuthError } from '@/libs/auth';

type NextRouteParams = { params: Promise<Record<string, string | undefined>> };

type ApiHandlerResult = NextResponse | { data: unknown; status?: number; meta?: Record<string, unknown> };

type ApiHandler = (request: NextRequest, context: NextRouteParams) => Promise<ApiHandlerResult>;

// Default empty context for routes that don't use params (e.g. list endpoints)
const EMPTY_CONTEXT: NextRouteParams = { params: Promise.resolve({}) };

/**
 * Wrap an API route handler with standard error handling.
 *
 * The handler can return either:
 * - A NextResponse directly (for custom status codes, validation errors, 404s)
 * - An object `{ data, status?, meta? }` which gets wrapped in `{ success: true, data, meta? }`
 *
 * AuthError is automatically caught and returns 401.
 * Unhandled errors are logged and return 500.
 *
 * @param handler - The route handler logic
 * @param routeLabel - Label for error logging (e.g. "GET /api/categories")
 */
export function withApiHandler(handler: ApiHandler, routeLabel: string) {
  return async (request?: NextRequest, context?: NextRouteParams): Promise<NextResponse> => {
    try {
      // Use provided request or create a minimal placeholder for no-arg handlers
      const req = request ?? ({ url: 'http://localhost', nextUrl: new URL('http://localhost') } as NextRequest);
      const result = await handler(req, context ?? EMPTY_CONTEXT);

      // If result doesn't have a `data` property, it's a NextResponse (pass through).
      // Plain result objects always have `{ data, status?, meta? }`.
      if (!('data' in result)) {
        return result as NextResponse;
      }

      const body: Record<string, unknown> = { success: true, data: result.data };
      if (result.meta) {
        body.meta = result.meta;
      }

      return NextResponse.json(body, { status: result.status ?? 200 });
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json({ error: API_ERROR.UNAUTHORIZED }, { status: 401 });
      }
      // biome-ignore lint/suspicious/noConsole: Centralized error logging for API routes
      console.error(`${routeLabel} error:`, error);
      return NextResponse.json({ success: false, error: API_ERROR.INTERNAL }, { status: 500 });
    }
  };
}

/**
 * Parse a route parameter ID and return it as a number.
 * Returns a 400 NextResponse if the ID is invalid.
 * Use `typeof result === 'number'` to check for success.
 */
export function parseIdParam(id: string | undefined): number | NextResponse {
  if (!id) {
    return NextResponse.json({ success: false, error: API_ERROR.INVALID_ID }, { status: 400 });
  }
  const parsed = Number.parseInt(id, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return NextResponse.json({ success: false, error: API_ERROR.INVALID_ID }, { status: 400 });
  }
  return parsed;
}

/**
 * Return a 404 response with a message.
 */
export function notFound(message: string): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status: 404 });
}

/**
 * Return a 400 response with validation errors.
 */
export function validationError(errors: unknown): NextResponse {
  return NextResponse.json({ success: false, errors }, { status: 400 });
}

/**
 * Return a 409 Conflict response.
 */
export function conflict(error: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ success: false, error, ...extra }, { status: 409 });
}
