/**
 * BudgetGuard Sync Compare API
 * GET /api/sync/compare - Compare local and remote databases
 * Dev-only: Returns 403 in production
 */

import { NextResponse } from 'next/server';
import { API_ERROR } from '@/constants/finance';
import { computeDiff } from '@/services/database/SyncService';

export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: API_ERROR.VALIDATION.NOT_AVAILABLE_IN_PROD }, { status: 403 });
  }

  try {
    const result = await computeDiff();
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('GET /api/sync/compare error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
