/**
 * BudgetGuard Transaction Groups API
 * POST /api/transaction-groups - Create a group of linked transactions
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { SHARED_EXPENSE } from '@/constants/finance';
import { AuthError } from '@/libs/auth';
import { CreateTransactionGroupSchema, validateRequest } from '@/schemas/transaction';
import { createTransactionGroup } from '@/services/database/TransactionRepository';
import { eurosToCents } from '@/utils/money';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateRequest(CreateTransactionGroupSchema, body);

    if (!validation.success) {
      return NextResponse.json({ success: false, errors: validation.errors }, { status: 400 });
    }

    const { items, isShared, description, transactionDate, type } = validation.data;
    const sharedDivisor = isShared ? SHARED_EXPENSE.DIVISOR : SHARED_EXPENSE.DEFAULT_DIVISOR;

    // Convert each item's amount from euros to cents, applying shared halving
    // Use balanced rounding: calculate total first, then adjust last item so sum matches exactly
    const itemsWithCents = items.map((item) => {
      const fullCents = eurosToCents(item.amount);
      const effectiveCents = isShared ? Math.ceil(fullCents / sharedDivisor) : fullCents;
      return {
        categoryId: item.categoryId,
        amountCents: effectiveCents,
        originalAmountCents: isShared ? fullCents : null,
      };
    });

    // Balanced rounding adjustment for shared expenses:
    // Ensure sum of individual halved items equals halved total
    if (isShared && itemsWithCents.length > 1) {
      const totalFullCents = itemsWithCents.reduce(
        (sum, item) => sum + (item.originalAmountCents ?? item.amountCents),
        0,
      );
      const expectedHalvedTotal = Math.ceil(totalFullCents / sharedDivisor);
      const actualHalvedTotal = itemsWithCents.reduce((sum, item) => sum + item.amountCents, 0);
      const diff = actualHalvedTotal - expectedHalvedTotal;

      // Adjust the last item to absorb the rounding difference
      if (diff !== 0) {
        const lastItem = itemsWithCents[itemsWithCents.length - 1];
        if (lastItem) {
          lastItem.amountCents = lastItem.amountCents - diff;
        }
      }
    }

    const transactions = await createTransactionGroup({
      description,
      transactionDate,
      type,
      sharedDivisor,
      items: itemsWithCents,
    });

    return NextResponse.json({ success: true, data: transactions }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('POST /api/transaction-groups error:', error);
    return NextResponse.json({ success: false, error: 'Error al crear grupo de transacciones' }, { status: 500 });
  }
}
