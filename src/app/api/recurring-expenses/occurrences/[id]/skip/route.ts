/**
 * BudgetGuard Skip Occurrence API
 * POST /api/recurring-expenses/occurrences/[id]/skip
 * Marks an occurrence as skipped (no transaction created)
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { skipOccurrence } from '@/services/database/RecurringExpenseRepository';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const occurrenceId = Number(id);

    if (Number.isNaN(occurrenceId) || occurrenceId <= 0) {
      return NextResponse.json({ success: false, error: 'ID inválido' }, { status: 400 });
    }

    const skipped = await skipOccurrence(occurrenceId);

    if (!skipped) {
      return NextResponse.json({ success: false, error: 'Ocurrencia no encontrada o ya procesada' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('POST /api/recurring-expenses/occurrences/[id]/skip error:', error);
    return NextResponse.json({ success: false, error: 'Error al omitir ocurrencia' }, { status: 500 });
  }
}
