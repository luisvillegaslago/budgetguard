/**
 * BudgetGuard Deferral API - Single Resource
 * GET    /api/fiscal/deferrals/[id] - The resolution, its ANEXO I rebuilt from the booked
 *                                     movements, and the verdict on whether they still agree
 * PUT    /api/fiscal/deferrals/[id] - Update the header (an omitted field keeps its stored value)
 * DELETE /api/fiscal/deferrals/[id] - Delete the resolution and its still-pending instalments
 */

import { API_ERROR, VALIDATION_KEY } from '@/constants/finance';
import { quarterMatchesModelo, UpdateDeferralSchema } from '@/schemas/deferral';
import { validateRequest } from '@/schemas/transaction';
import {
  deleteDeferral,
  getDeferralById,
  getDeferralFracciones,
  updateDeferral,
} from '@/services/database/DeferralRepository';
import type { DeferralUpdateInput } from '@/types/finance';
import { notFound, parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';
import { verifyDeferral } from '@/utils/deferral';

export const GET = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const deferralId = parseIdParam(id);
  if (typeof deferralId !== 'number') return deferralId;

  const deferral = await getDeferralById(deferralId);
  if (!deferral) return notFound(API_ERROR.NOT_FOUND.DEFERRAL);

  // ANEXO I is never stored twice: it is rebuilt by adding the movements of each fracción back up,
  // so the table shown is the one the user is actually going to pay. Verifying it here is therefore
  // a real check and not a tautology — an edited movement makes its own fracción stop reconciling.
  const fracciones = await getDeferralFracciones(deferralId);
  const verdict = verifyDeferral({ ...deferral, fracciones });

  return { data: { deferral, fracciones, verdict } };
}, 'GET /api/fiscal/deferrals/[id]');

export const PUT = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const deferralId = parseIdParam(id);
  if (typeof deferralId !== 'number') return deferralId;

  const body = await request.json();
  const validation = validateRequest(UpdateDeferralSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const current = await getDeferralById(deferralId);
  if (!current) return notFound(API_ERROR.NOT_FOUND.DEFERRAL);

  const { interestStartDate, ...rest } = validation.data;

  // The schema's rule only sees the payload, so `{ fiscalQuarter: 2 }` on a Modelo 390 reaches here
  // unchallenged. Re-check it against the values the row will actually hold, or CK_Deferrals_Quarter
  // answers with a 500 instead of a field error.
  const mergedModelo = rest.modeloType ?? current.modeloType;
  const mergedQuarter = rest.fiscalQuarter === undefined ? current.fiscalQuarter : rest.fiscalQuarter;
  if (!quarterMatchesModelo(mergedModelo, mergedQuarter)) {
    return validationError({ fiscalQuarter: [VALIDATION_KEY.QUARTERLY_MISMATCH] });
  }

  // Undefined stays undefined: the repository skips it and the stored value survives.
  const updateData: DeferralUpdateInput = { ...rest };
  if (interestStartDate !== undefined) updateData.interestStartDate = interestStartDate.toISOString().split('T')[0]!;

  const deferral = await updateDeferral(deferralId, updateData);
  if (!deferral) return notFound(API_ERROR.NOT_FOUND.DEFERRAL);

  return { data: deferral };
}, 'PUT /api/fiscal/deferrals/[id]');

export const DELETE = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const deferralId = parseIdParam(id);
  if (typeof deferralId !== 'number') return deferralId;

  // Only the pending instalments go with it. One already marked paid is money that left the
  // account, and a wrong import does not undo a payment — those rows stay, keeping their fracción
  // number and their part, with "DeferralID" nulled by the FK.
  const { deleted, removedMovements } = await deleteDeferral(deferralId);
  if (!deleted) return notFound(API_ERROR.NOT_FOUND.DEFERRAL);

  return { data: { deleted, removedMovements } };
}, 'DELETE /api/fiscal/deferrals/[id]');
