/**
 * BudgetGuard Skydiving Jump Import API
 * POST /api/skydiving/jumps/import - Bulk import jumps from CSV data
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { AuthError } from '@/libs/auth';
import type { ImportJumpRow } from '@/schemas/skydive';
import { ImportJumpRowSchema } from '@/schemas/skydive';
import { bulkCreateJumps } from '@/services/database/SkydiveRepository';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rows: unknown[] = body.rows;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ success: false, error: 'No rows provided' }, { status: 400 });
    }

    const validRows: ImportJumpRow[] = [];
    const errors: Array<{ row: number; error: string }> = [];

    rows.forEach((row, index) => {
      const result = ImportJumpRowSchema.safeParse(row);
      if (result.success) {
        validRows.push(result.data);
      } else {
        errors.push({ row: index, error: result.error.issues[0]?.message ?? 'Invalid row' });
      }
    });

    const importResult = await bulkCreateJumps(validRows);

    return NextResponse.json({
      success: true,
      data: {
        ...importResult,
        validationErrors: errors,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('POST /api/skydiving/jumps/import error:', error);
    return NextResponse.json({ success: false, error: 'Error importing jumps' }, { status: 500 });
  }
}
