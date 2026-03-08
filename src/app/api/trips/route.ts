/**
 * BudgetGuard Trips API
 * GET /api/trips - List all trips with summary data
 * POST /api/trips - Create a new trip
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { AuthError } from '@/libs/auth';
import { validateRequest } from '@/schemas/transaction';
import { CreateTripSchema } from '@/schemas/trip';
import { createTrip, getAllTrips } from '@/services/database/TripRepository';

export async function GET() {
  try {
    const trips = await getAllTrips();

    return NextResponse.json({
      success: true,
      data: trips,
      meta: { count: trips.length },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('GET /api/trips error:', error);
    return NextResponse.json({ success: false, error: 'Error al obtener viajes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateRequest(CreateTripSchema, body);

    if (!validation.success) {
      return NextResponse.json({ success: false, errors: validation.errors }, { status: 400 });
    }

    const trip = await createTrip(validation.data.name);

    return NextResponse.json({ success: true, data: trip }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('POST /api/trips error:', error);
    return NextResponse.json({ success: false, error: 'Error al crear viaje' }, { status: 500 });
  }
}
