/**
 * BudgetGuard Tunnel Session Import API
 * POST /api/skydiving/tunnel/import - Bulk import tunnel sessions from CSV data
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { SKYDIVE_CATEGORY } from '@/constants/finance';
import { AuthError, getUserIdOrThrow } from '@/libs/auth';
import type { ImportTunnelRow } from '@/schemas/skydive';
import { ImportTunnelRowSchema } from '@/schemas/skydive';
import { query } from '@/services/database/connection';
import { bulkCreateTunnelSessions } from '@/services/database/SkydiveRepository';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rows: unknown[] = body.rows;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ success: false, error: 'No rows provided' }, { status: 400 });
    }

    const validRows: ImportTunnelRow[] = [];
    const errors: Array<{ row: number; error: string }> = [];

    rows.forEach((row, index) => {
      const result = ImportTunnelRowSchema.safeParse(row);
      if (result.success) {
        validRows.push(result.data);
      } else {
        errors.push({ row: index, error: result.error.issues[0]?.message ?? 'Invalid row' });
      }
    });

    // Find the "Túnel de viento" subcategory to link transactions
    const userId = await getUserIdOrThrow();
    const catResult = await query<{ CategoryID: number }>(
      `SELECT sub."CategoryID"
       FROM "Categories" sub
       INNER JOIN "Categories" parent ON sub."ParentCategoryID" = parent."CategoryID"
       WHERE parent."Name" = $1 AND sub."Name" = 'Túnel de viento'
         AND parent."ParentCategoryID" IS NULL AND sub."UserID" = $2
       LIMIT 1`,
      [SKYDIVE_CATEGORY.NAME, userId],
    );
    const tunnelCategoryId = catResult[0]?.CategoryID ?? null;

    const importResult = await bulkCreateTunnelSessions(validRows, tunnelCategoryId);

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
    console.error('POST /api/skydiving/tunnel/import error:', error);
    return NextResponse.json({ success: false, error: 'Error importing tunnel sessions' }, { status: 500 });
  }
}
