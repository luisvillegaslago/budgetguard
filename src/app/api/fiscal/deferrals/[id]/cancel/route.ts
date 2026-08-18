/**
 * BudgetGuard Deferral Cancellation API
 * GET  /api/fiscal/deferrals/[id]/cancel - What cancelling would do: the fracciones that would be
 *                                          cancelled and those that would be kept, with their totals
 * POST /api/fiscal/deferrals/[id]/cancel - Do it: every fracción movement still pending becomes
 *                                          cancelled, in one transaction
 *
 * The GET is deliberately the same URL as the POST: it is the preview OF THIS ACTION, not a view of
 * the resolution (that is GET /api/fiscal/deferrals/[id]), and keeping them together is what stops
 * the confirmation dialog and the write drifting apart.
 *
 * There is no payload on either: cancelling takes no options. Which movements are touched is
 * decided by their own status, never by the request — so there is nothing to validate and no
 * schema to keep in step.
 *
 * Failures are mapped by withApiHandler: AuthError → 401, NotFoundError → 404 (no such resolution
 * for this user), ConflictError → 409 (nothing left to cancel — a second cancellation, or a
 * resolution already paid off in full).
 */

import { cancelDeferral, previewDeferralCancellation } from '@/services/DeferralCancellationService';
import { parseIdParam, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const deferralId = parseIdParam(id);
  if (typeof deferralId !== 'number') return deferralId;

  const preview = await previewDeferralCancellation(deferralId);
  return { data: preview };
}, 'GET /api/fiscal/deferrals/[id]/cancel');

export const POST = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const deferralId = parseIdParam(id);
  if (typeof deferralId !== 'number') return deferralId;

  // Nothing is deleted here: the pending instalments become TRANSACTION_STATUS.CANCELLED, which
  // every summary and every fiscal view already filters out, and the paid ones are left alone.
  const result = await cancelDeferral(deferralId);
  return { data: result };
}, 'POST /api/fiscal/deferrals/[id]/cancel');
