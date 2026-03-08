/**
 * BudgetGuard Sync Execute API
 * POST /api/sync/execute - Execute database sync (push or pull)
 * Dev-only: Returns 403 in production
 */

import { NextResponse } from 'next/server';
import { SyncExecuteSchema } from '@/schemas/sync';
import { executeSync } from '@/services/database/SyncService';

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  try {
    const body: unknown = await request.json();
    const parsed = SyncExecuteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ success: false, errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { direction, includeDeletes } = parsed.data;
    const result = await executeSync(direction, includeDeletes);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('POST /api/sync/execute error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
