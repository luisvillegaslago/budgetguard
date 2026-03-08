/**
 * BudgetGuard Skydiving Jump Import API
 * POST /api/skydiving/jumps/import - Bulk import jumps from CSV data
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { ImportJumpRow } from '@/schemas/skydive';
import { ImportJumpRowSchema } from '@/schemas/skydive';
import { bulkCreateJumps } from '@/services/database/SkydiveRepository';
import { withApiHandler } from '@/utils/apiHandler';

const ImportBodySchema = z.object({
  rows: z.array(z.unknown()).min(1, 'At least one row is required'),
});

export const POST = withApiHandler(async (request) => {
  const body = await request.json();

  const bodyValidation = ImportBodySchema.safeParse(body);
  if (!bodyValidation.success) {
    return NextResponse.json(
      { success: false, error: bodyValidation.error.issues[0]?.message ?? 'Invalid body' },
      { status: 400 },
    );
  }

  const { rows } = bodyValidation.data;
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

  return {
    data: {
      ...importResult,
      validationErrors: errors,
    },
  };
}, 'POST /api/skydiving/jumps/import');
