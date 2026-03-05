/**
 * BudgetGuard Recurring Expenses [id] API
 * GET /api/recurring-expenses/[id] - Get single recurring expense
 * PUT /api/recurring-expenses/[id] - Update recurring expense
 * DELETE /api/recurring-expenses/[id] - Soft-delete (deactivate)
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { SHARED_EXPENSE } from '@/constants/finance';
import { UpdateRecurringExpenseSchema } from '@/schemas/recurring-expense';
import { validateRequest } from '@/schemas/transaction';
import {
  deleteRecurringExpense,
  getRecurringExpenseById,
  updateRecurringExpense,
} from '@/services/database/RecurringExpenseRepository';
import { eurosToCents } from '@/utils/money';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const recurringExpenseId = Number(id);

    if (Number.isNaN(recurringExpenseId) || recurringExpenseId <= 0) {
      return NextResponse.json({ success: false, error: 'ID inválido' }, { status: 400 });
    }

    const expense = await getRecurringExpenseById(recurringExpenseId);

    if (!expense) {
      return NextResponse.json({ success: false, error: 'Gasto recurrente no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: expense });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('GET /api/recurring-expenses/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Error al obtener gasto recurrente' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const recurringExpenseId = Number(id);

    if (Number.isNaN(recurringExpenseId) || recurringExpenseId <= 0) {
      return NextResponse.json({ success: false, error: 'ID inválido' }, { status: 400 });
    }

    const body = await request.json();
    const validation = validateRequest(UpdateRecurringExpenseSchema, body);

    if (!validation.success) {
      return NextResponse.json({ success: false, errors: validation.errors }, { status: 400 });
    }

    const { amount, isShared, ...rest } = validation.data;

    // Build update data
    const updateData: Parameters<typeof updateRecurringExpense>[1] = { ...rest };

    if (amount !== undefined) {
      const fullAmountCents = eurosToCents(amount);
      const shared = isShared ?? false;
      const sharedDivisor = shared ? SHARED_EXPENSE.DIVISOR : SHARED_EXPENSE.DEFAULT_DIVISOR;

      updateData.amountCents = shared ? Math.ceil(fullAmountCents / sharedDivisor) : fullAmountCents;
      updateData.originalAmountCents = shared ? fullAmountCents : null;
      updateData.sharedDivisor = sharedDivisor;
    }

    const expense = await updateRecurringExpense(recurringExpenseId, updateData);

    if (!expense) {
      return NextResponse.json({ success: false, error: 'Gasto recurrente no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: expense });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('PUT /api/recurring-expenses/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Error al actualizar gasto recurrente' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const recurringExpenseId = Number(id);

    if (Number.isNaN(recurringExpenseId) || recurringExpenseId <= 0) {
      return NextResponse.json({ success: false, error: 'ID inválido' }, { status: 400 });
    }

    const deleted = await deleteRecurringExpense(recurringExpenseId);

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Gasto recurrente no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('DELETE /api/recurring-expenses/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Error al eliminar gasto recurrente' }, { status: 500 });
  }
}
