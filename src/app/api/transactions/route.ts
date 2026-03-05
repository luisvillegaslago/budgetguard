/**
 * BudgetGuard Transactions API
 * GET /api/transactions - List transactions for a month
 * POST /api/transactions - Create a new transaction
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { SHARED_EXPENSE } from '@/constants/finance';
import { CreateTransactionSchema, TransactionFiltersSchema, validateRequest } from '@/schemas/transaction';
import { createTransaction, getTransactionsByMonth } from '@/services/database/TransactionRepository';
import { getCurrentMonth } from '@/utils/helpers';
import { eurosToCents } from '@/utils/money';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const filters = {
      month: searchParams.get('month') ?? undefined,
      type: searchParams.get('type') ?? undefined,
      categoryId: searchParams.get('categoryId') ?? undefined,
    };

    const validation = validateRequest(TransactionFiltersSchema, filters);
    if (!validation.success) {
      return NextResponse.json({ success: false, errors: validation.errors }, { status: 400 });
    }

    const month = validation.data.month ?? getCurrentMonth();
    const transactions = await getTransactionsByMonth(month, {
      type: validation.data.type,
      categoryId: validation.data.categoryId,
    });

    return NextResponse.json({
      success: true,
      data: transactions,
      meta: { month, count: transactions.length },
    });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('GET /api/transactions error:', error);
    return NextResponse.json({ success: false, error: 'Error al obtener transacciones' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateRequest(CreateTransactionSchema, body);

    if (!validation.success) {
      return NextResponse.json({ success: false, errors: validation.errors }, { status: 400 });
    }

    const { amount, isShared, ...rest } = validation.data;

    // Convert euros to cents for storage
    const fullAmountCents = eurosToCents(amount);
    const sharedDivisor = isShared ? SHARED_EXPENSE.DIVISOR : SHARED_EXPENSE.DEFAULT_DIVISOR;

    // Math.ceil ensures user's part covers the rounding (101 → 51, not 50)
    const effectiveAmount = isShared ? Math.ceil(fullAmountCents / sharedDivisor) : fullAmountCents;

    const transaction = await createTransaction({
      ...rest,
      amountCents: effectiveAmount,
      originalAmountCents: isShared ? fullAmountCents : null,
      sharedDivisor,
      description: rest.description ?? undefined,
    });

    return NextResponse.json({ success: true, data: transaction }, { status: 201 });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('POST /api/transactions error:', error);
    return NextResponse.json({ success: false, error: 'Error al crear transaccion' }, { status: 500 });
  }
}
