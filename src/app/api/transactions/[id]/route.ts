/**
 * BudgetGuard Transaction API - Single Resource
 * GET /api/transactions/[id] - Get a transaction
 * PUT /api/transactions/[id] - Update a transaction
 * DELETE /api/transactions/[id] - Delete a transaction
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { CreateTransactionSchema, validateRequest } from '@/schemas/transaction';
import { deleteTransaction, getTransactionById, updateTransaction } from '@/services/database/TransactionRepository';
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

    const { amount, ...rest } = validation.data;

    const updateData: Parameters<typeof updateTransaction>[1] = {
      ...rest,
      description: rest.description ?? undefined,
    };

    // Convert euros to cents if amount is provided
    if (amount !== undefined) {
      updateData.amountCents = eurosToCents(amount);
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

    const deleted = await deleteTransaction(transactionId);

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Transaccion no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('DELETE /api/transactions/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Error al eliminar transaccion' }, { status: 500 });
  }
}
