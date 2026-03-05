/**
 * BudgetGuard Pending Occurrences API
 * GET /api/recurring-expenses/pending - Get all pending occurrences (retroactive)
 */

import { NextResponse } from 'next/server';
import { getAllPendingOccurrences } from '@/services/database/RecurringExpenseRepository';

export async function GET() {
  try {
    const summary = await getAllPendingOccurrences();

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('GET /api/recurring-expenses/pending error:', error);
    return NextResponse.json({ success: false, error: 'Error al obtener ocurrencias pendientes' }, { status: 500 });
  }
}
