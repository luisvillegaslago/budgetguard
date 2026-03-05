/**
 * BudgetGuard Recurring Expenses API
 * GET /api/recurring-expenses - List recurring expense rules
 * POST /api/recurring-expenses - Create a new recurring expense rule
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { SHARED_EXPENSE } from '@/constants/finance';
import { CreateRecurringExpenseSchema } from '@/schemas/recurring-expense';
import { validateRequest } from '@/schemas/transaction';
import { createRecurringExpense, getRecurringExpenses } from '@/services/database/RecurringExpenseRepository';
import { eurosToCents } from '@/utils/money';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isActiveParam = searchParams.get('isActive');

    const filters = isActiveParam !== null ? { isActive: isActiveParam === 'true' } : undefined;

    const expenses = await getRecurringExpenses(filters);

    return NextResponse.json({
      success: true,
      data: expenses,
      meta: { count: expenses.length },
    });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('GET /api/recurring-expenses error:', error);
    return NextResponse.json({ success: false, error: 'Error al obtener gastos recurrentes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateRequest(CreateRecurringExpenseSchema, body);

    if (!validation.success) {
      return NextResponse.json({ success: false, errors: validation.errors }, { status: 400 });
    }

    const { amount, isShared, ...rest } = validation.data;

    const fullAmountCents = eurosToCents(amount);
    const sharedDivisor = isShared ? SHARED_EXPENSE.DIVISOR : SHARED_EXPENSE.DEFAULT_DIVISOR;
    const effectiveAmount = isShared ? Math.ceil(fullAmountCents / sharedDivisor) : fullAmountCents;

    const expense = await createRecurringExpense({
      ...rest,
      amountCents: effectiveAmount,
      originalAmountCents: isShared ? fullAmountCents : null,
      sharedDivisor,
      description: rest.description ?? undefined,
    });

    return NextResponse.json({ success: true, data: expense }, { status: 201 });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('POST /api/recurring-expenses error:', error);
    return NextResponse.json({ success: false, error: 'Error al crear gasto recurrente' }, { status: 500 });
  }
}
