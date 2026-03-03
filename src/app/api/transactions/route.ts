/**
 * BudgetGuard Transactions API
 * GET /api/transactions - List transactions for a month
 * POST /api/transactions - Create a new transaction
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
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

    const { amount, ...rest } = validation.data;

    // Convert euros to cents for storage
    const transaction = await createTransaction({
      ...rest,
      amountCents: eurosToCents(amount),
      description: rest.description ?? undefined,
    });

    return NextResponse.json({ success: true, data: transaction }, { status: 201 });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('POST /api/transactions error:', error);
    return NextResponse.json({ success: false, error: 'Error al crear transaccion' }, { status: 500 });
  }
}
