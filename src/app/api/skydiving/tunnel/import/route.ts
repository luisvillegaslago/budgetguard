/**
 * BudgetGuard Tunnel Session Import API
 * POST /api/skydiving/tunnel/import - Bulk import tunnel sessions from CSV data
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SKYDIVE_CATEGORY } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import type { ImportTunnelRow } from '@/schemas/skydive';
import { ImportTunnelRowSchema } from '@/schemas/skydive';
import { bulkCreateTunnelSessions, findSkydiveSubcategoryId } from '@/services/database/SkydiveRepository';
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
  const tunnelCategoryId = await findSkydiveSubcategoryId(SKYDIVE_CATEGORY.SUBCATEGORY.TUNNEL, userId);

  const importResult = await bulkCreateTunnelSessions(validRows, tunnelCategoryId);

  return {
    data: {
      ...importResult,
      validationErrors: errors,
    },
  };
}, 'POST /api/skydiving/tunnel/import');
