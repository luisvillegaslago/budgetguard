/**
 * BudgetGuard Skydiving Stats API
 * GET /api/skydiving/stats - Get aggregated skydiving statistics
 */

import { NextResponse } from 'next/server';
import { AuthError } from '@/libs/auth';
import { getSkydiveStats } from '@/services/database/SkydiveRepository';

export async function GET() {
  try {
    const stats = await getSkydiveStats();

    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('GET /api/skydiving/stats error:', error);
    return NextResponse.json({ success: false, error: 'Error loading stats' }, { status: 500 });
  }
}
