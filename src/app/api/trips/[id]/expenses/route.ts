/**
 * BudgetGuard Trip Expenses API
 * POST /api/trips/[id]/expenses - Add an expense to a trip
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { SHARED_EXPENSE, TRANSACTION_TYPE } from '@/constants/finance';
import { AuthError } from '@/libs/auth';
import { validateRequest } from '@/schemas/transaction';
import { CreateTripExpenseSchema } from '@/schemas/trip';
import { createTransaction } from '@/services/database/TransactionRepository';
import { getTripById } from '@/services/database/TripRepository';
import { eurosToCents } from '@/utils/money';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const tripId = Number.parseInt(id, 10);

    if (Number.isNaN(tripId)) {
      return NextResponse.json({ success: false, error: 'ID invalido' }, { status: 400 });
    }

    // Verify trip exists
    const trip = await getTripById(tripId);
    if (!trip) {
      return NextResponse.json({ success: false, error: 'Viaje no encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const validation = validateRequest(CreateTripExpenseSchema, body);

    if (!validation.success) {
      return NextResponse.json({ success: false, errors: validation.errors }, { status: 400 });
    }

    const { amount, isShared, ...rest } = validation.data;

    // Convert euros to cents for storage
    const fullAmountCents = eurosToCents(amount);
    const sharedDivisor = isShared ? SHARED_EXPENSE.DIVISOR : SHARED_EXPENSE.DEFAULT_DIVISOR;
    const effectiveAmount = isShared ? Math.ceil(fullAmountCents / sharedDivisor) : fullAmountCents;

    const transaction = await createTransaction({
      ...rest,
      amountCents: effectiveAmount,
      originalAmountCents: isShared ? fullAmountCents : null,
      sharedDivisor,
      type: TRANSACTION_TYPE.EXPENSE,
      description: rest.description ?? undefined,
      tripId,
    });

    return NextResponse.json({ success: true, data: transaction }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('POST /api/trips/[id]/expenses error:', error);
    return NextResponse.json({ success: false, error: 'Error al crear gasto de viaje' }, { status: 500 });
  }
}
