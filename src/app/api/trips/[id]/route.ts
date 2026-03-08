/**
 * BudgetGuard Trips API - Single Resource
 * GET /api/trips/[id] - Get trip with full details
 * PATCH /api/trips/[id] - Update trip name
 * DELETE /api/trips/[id] - Delete trip and all linked transactions
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { AuthError } from '@/libs/auth';
import { validateRequest } from '@/schemas/transaction';
import { UpdateTripSchema } from '@/schemas/trip';
import { deleteTrip, getTripById, updateTrip } from '@/services/database/TripRepository';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const tripId = Number.parseInt(id, 10);

    if (Number.isNaN(tripId)) {
      return NextResponse.json({ success: false, error: 'ID invalido' }, { status: 400 });
    }

    const trip = await getTripById(tripId);

    if (!trip) {
      return NextResponse.json({ success: false, error: 'Viaje no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: trip });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('GET /api/trips/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Error al obtener viaje' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const tripId = Number.parseInt(id, 10);

    if (Number.isNaN(tripId)) {
      return NextResponse.json({ success: false, error: 'ID invalido' }, { status: 400 });
    }

    const body = await request.json();
    const validation = validateRequest(UpdateTripSchema, body);

    if (!validation.success) {
      return NextResponse.json({ success: false, errors: validation.errors }, { status: 400 });
    }

    if (!validation.data.name) {
      return NextResponse.json({ success: false, error: 'Nombre requerido' }, { status: 400 });
    }

    const trip = await updateTrip(tripId, validation.data.name);

    if (!trip) {
      return NextResponse.json({ success: false, error: 'Viaje no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: trip });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('PATCH /api/trips/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Error al actualizar viaje' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const tripId = Number.parseInt(id, 10);

    if (Number.isNaN(tripId)) {
      return NextResponse.json({ success: false, error: 'ID invalido' }, { status: 400 });
    }

    const deleted = await deleteTrip(tripId);

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Viaje no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('DELETE /api/trips/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Error al eliminar viaje' }, { status: 500 });
  }
}
