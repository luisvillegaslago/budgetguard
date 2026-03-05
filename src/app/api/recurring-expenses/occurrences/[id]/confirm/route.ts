/**
 * BudgetGuard Confirm Occurrence API
 * POST /api/recurring-expenses/occurrences/[id]/confirm
 * Creates a real transaction and marks the occurrence as confirmed
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ConfirmOccurrenceSchema } from '@/schemas/recurring-expense';
import { validateRequest } from '@/schemas/transaction';
import { confirmOccurrence } from '@/services/database/RecurringExpenseRepository';
import { eurosToCents } from '@/utils/money';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const occurrenceId = Number(id);

    if (Number.isNaN(occurrenceId) || occurrenceId <= 0) {
      return NextResponse.json({ success: false, error: 'ID inválido' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const validation = validateRequest(ConfirmOccurrenceSchema, body);

    if (!validation.success) {
      return NextResponse.json({ success: false, errors: validation.errors }, { status: 400 });
    }

    const modifiedAmountCents = validation.data.modifiedAmount
      ? eurosToCents(validation.data.modifiedAmount)
      : undefined;

    const occurrence = await confirmOccurrence(occurrenceId, modifiedAmountCents);

    return NextResponse.json({ success: true, data: occurrence });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al confirmar ocurrencia';
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('POST /api/recurring-expenses/occurrences/[id]/confirm error:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
