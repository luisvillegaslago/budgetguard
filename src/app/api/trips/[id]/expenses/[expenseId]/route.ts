/**
 * BudgetGuard Trip Expense API - Single Resource
 * PUT /api/trips/[id]/expenses/[expenseId] - Update a trip expense
 * DELETE /api/trips/[id]/expenses/[expenseId] - Delete a trip expense
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { SHARED_EXPENSE } from '@/constants/finance';
import { AuthError } from '@/libs/auth';
import { validateRequest } from '@/schemas/transaction';
import { UpdateTripExpenseSchema } from '@/schemas/trip';
import { deleteTransaction, getTransactionById, updateTransaction } from '@/services/database/TransactionRepository';
import { eurosToCents } from '@/utils/money';

interface RouteParams {
  params: Promise<{ id: string; expenseId: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { expenseId } = await params;
    const transactionId = Number.parseInt(expenseId, 10);

    if (Number.isNaN(transactionId)) {
      return NextResponse.json({ success: false, error: 'ID invalido' }, { status: 400 });
    }

    const body = await request.json();
    const validation = validateRequest(UpdateTripExpenseSchema, body);

    if (!validation.success) {
      return NextResponse.json({ success: false, errors: validation.errors }, { status: 400 });
    }

    const { amount, isShared, ...rest } = validation.data;

    const updateData: Parameters<typeof updateTransaction>[1] = {
      ...rest,
      description: rest.description ?? undefined,
    };

    // Convert euros to cents if amount is provided, applying shared expense halving
    if (amount !== undefined) {
      const fullAmountCents = eurosToCents(amount);
      const sharedDivisor = isShared ? SHARED_EXPENSE.DIVISOR : SHARED_EXPENSE.DEFAULT_DIVISOR;

      updateData.amountCents = isShared ? Math.ceil(fullAmountCents / sharedDivisor) : fullAmountCents;
      updateData.originalAmountCents = isShared ? fullAmountCents : null;
      updateData.sharedDivisor = sharedDivisor;
    } else if (isShared !== undefined) {
      // isShared changed but amount didn't — recalculate from existing
      const existing = await getTransactionById(transactionId);
      if (existing) {
        const baseAmount = existing.originalAmountCents ?? existing.amountCents;
        const sharedDivisor = isShared ? SHARED_EXPENSE.DIVISOR : SHARED_EXPENSE.DEFAULT_DIVISOR;
        updateData.amountCents = isShared ? Math.ceil(baseAmount / sharedDivisor) : baseAmount;
        updateData.originalAmountCents = isShared ? baseAmount : null;
        updateData.sharedDivisor = sharedDivisor;
      }
    }

    const transaction = await updateTransaction(transactionId, updateData);

    if (!transaction) {
      return NextResponse.json({ success: false, error: 'Gasto no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: transaction });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('PUT /api/trips/[id]/expenses/[expenseId] error:', error);
    return NextResponse.json({ success: false, error: 'Error al actualizar gasto' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { expenseId } = await params;
    const transactionId = Number.parseInt(expenseId, 10);

    if (Number.isNaN(transactionId)) {
      return NextResponse.json({ success: false, error: 'ID invalido' }, { status: 400 });
    }

    const deleted = await deleteTransaction(transactionId);

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Gasto no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('DELETE /api/trips/[id]/expenses/[expenseId] error:', error);
    return NextResponse.json({ success: false, error: 'Error al eliminar gasto' }, { status: 500 });
  }
}
