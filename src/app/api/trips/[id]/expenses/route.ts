/**
 * BudgetGuard Trip Expenses API
 * POST /api/trips/[id]/expenses - Add an expense to a trip
 */

import { SHARED_EXPENSE, TRANSACTION_TYPE } from '@/constants/finance';
import { validateRequest } from '@/schemas/transaction';
import { CreateTripExpenseSchema } from '@/schemas/trip';
import { createTransaction } from '@/services/database/TransactionRepository';
import { getTripById } from '@/services/database/TripRepository';
import { notFound, parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';
import { eurosToCents } from '@/utils/money';

export const POST = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const tripId = parseIdParam(id);
  if (typeof tripId !== 'number') return tripId;

  const trip = await getTripById(tripId);
  if (!trip) return notFound('Viaje no encontrado');

  const body = await request.json();
  const validation = validateRequest(CreateTripExpenseSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const { amount, isShared, ...rest } = validation.data;

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

  return { data: transaction, status: 201 };
}, 'POST /api/trips/[id]/expenses');
