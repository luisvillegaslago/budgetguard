/**
 * BudgetGuard Transaction API - Single Resource
 * GET /api/transactions/[id] - Get a transaction
 * PUT /api/transactions/[id] - Update a transaction
 * DELETE /api/transactions/[id] - Delete a transaction
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { SHARED_EXPENSE } from '@/constants/finance';
import { CreateTransactionSchema, validateRequest } from '@/schemas/transaction';
import {
  cleanupOrphanedGroup,
  deleteTransaction,
  getTransactionById,
  updateTransaction,
} from '@/services/database/TransactionRepository';
import { eurosToCents } from '@/utils/money';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const transactionId = Number.parseInt(id, 10);

    if (Number.isNaN(transactionId)) {
      return NextResponse.json({ success: false, error: 'ID invalido' }, { status: 400 });
    }

    const transaction = await getTransactionById(transactionId);

    if (!transaction) {
      return NextResponse.json({ success: false, error: 'Transaccion no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: transaction });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('GET /api/transactions/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Error al obtener transaccion' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const transactionId = Number.parseInt(id, 10);

    if (Number.isNaN(transactionId)) {
      return NextResponse.json({ success: false, error: 'ID invalido' }, { status: 400 });
    }

    const body = await request.json();

    // Use partial schema for updates
    const validation = validateRequest(CreateTransactionSchema.partial(), body);

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
      // isShared changed but amount didn't — need to recalculate from existing transaction
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
      return NextResponse.json({ success: false, error: 'Transaccion no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: transaction });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('PUT /api/transactions/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Error al actualizar transaccion' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const transactionId = Number.parseInt(id, 10);

    if (Number.isNaN(transactionId)) {
      return NextResponse.json({ success: false, error: 'ID invalido' }, { status: 400 });
    }

    // Check if transaction belongs to a group before deleting (for orphan cleanup)
    const existing = await getTransactionById(transactionId);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Transaccion no encontrada' }, { status: 404 });
    }

    const deleted = await deleteTransaction(transactionId);

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Transaccion no encontrada' }, { status: 404 });
    }

    // Clean up orphaned group if this transaction belonged to one
    if (existing.transactionGroupId) {
      await cleanupOrphanedGroup(existing.transactionGroupId);
    }

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('DELETE /api/transactions/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Error al eliminar transaccion' }, { status: 500 });
  }
}
