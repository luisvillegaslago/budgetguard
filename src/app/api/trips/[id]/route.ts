/**
 * BudgetGuard Trips API - Single Resource
 * GET /api/trips/[id] - Get trip with full details
 * PATCH /api/trips/[id] - Update trip name
 * DELETE /api/trips/[id] - Delete trip and all linked transactions
 */

import { NextResponse } from 'next/server';
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

  if (!validation.data.name) {
    return NextResponse.json({ success: false, error: 'Nombre requerido' }, { status: 400 });
  }

  const trip = await updateTrip(tripId, validation.data.name);
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
