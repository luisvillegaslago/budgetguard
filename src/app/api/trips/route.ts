/**
 * BudgetGuard Trips API
 * GET /api/trips - List all trips with summary data
 * POST /api/trips - Create a new trip
 */

import { validateRequest } from '@/schemas/transaction';
import { CreateTripSchema } from '@/schemas/trip';
import { createTrip, getAllTrips } from '@/services/database/TripRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async () => {
  const trips = await getAllTrips();

  return { data: trips, meta: { count: trips.length } };
}, 'GET /api/trips');

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const validation = validateRequest(CreateTripSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const trip = await createTrip(
    validation.data.name,
    validation.data.startDate.toISOString().split('T')[0] ?? '',
    validation.data.endDate.toISOString().split('T')[0] ?? '',
  );

  return { data: trip, status: 201 };
}, 'POST /api/trips');
