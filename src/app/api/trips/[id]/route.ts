/**
 * BudgetGuard Trips API - Single Resource
 * GET /api/trips/[id] - Get trip with full details
 * PATCH /api/trips/[id] - Update trip (name, dates)
 * DELETE /api/trips/[id] - Delete trip and all linked transactions
 */

import { API_ERROR } from '@/constants/finance';
import { validateRequest } from '@/schemas/transaction';
import { UpdateTripSchema } from '@/schemas/trip';
import { deleteTrip, getTripById, updateTrip } from '@/services/database/TripRepository';
import { notFound, parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const tripId = parseIdParam(id);
  if (typeof tripId !== 'number') return tripId;

  const trip = await getTripById(tripId);
  if (!trip) return notFound(API_ERROR.NOT_FOUND.TRIP);

  return { data: trip };
}, 'GET /api/trips/[id]');

export const PATCH = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const tripId = parseIdParam(id);
  if (typeof tripId !== 'number') return tripId;

  const body = await request.json();
  const validation = validateRequest(UpdateTripSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const updateParams: { name?: string; startDate?: string; endDate?: string } = {};

  if (validation.data.name) updateParams.name = validation.data.name;
  if (validation.data.startDate) updateParams.startDate = validation.data.startDate.toISOString().split('T')[0] ?? '';
  if (validation.data.endDate) updateParams.endDate = validation.data.endDate.toISOString().split('T')[0] ?? '';

  if (Object.keys(updateParams).length === 0) {
    return validationError({ _: [API_ERROR.VALIDATION.NAME_REQUIRED] });
  }

  const trip = await updateTrip(tripId, updateParams);
  if (!trip) return notFound(API_ERROR.NOT_FOUND.TRIP);

  return { data: trip };
}, 'PATCH /api/trips/[id]');

export const DELETE = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const tripId = parseIdParam(id);
  if (typeof tripId !== 'number') return tripId;

  const deleted = await deleteTrip(tripId);
  if (!deleted) return notFound(API_ERROR.NOT_FOUND.TRIP);

  return { data: { deleted: true } };
}, 'DELETE /api/trips/[id]');
