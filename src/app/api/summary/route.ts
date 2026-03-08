/**
 * BudgetGuard Summary API
 * GET /api/summary - Get monthly summary (from SQL views)
 */

import { NextResponse } from 'next/server';
import { MONTH_FORMAT_REGEX } from '@/constants/finance';
import { getMonthlySummary } from '@/services/database/TransactionRepository';
import { withApiHandler } from '@/utils/apiHandler';
import { getCurrentMonth } from '@/utils/helpers';

export const GET = withApiHandler(async (request) => {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month') ?? getCurrentMonth();

  if (!MONTH_FORMAT_REGEX.test(month)) {
    return NextResponse.json({ success: false, error: 'Formato de mes invalido. Usa YYYY-MM' }, { status: 400 });
  }

  const summary = await getMonthlySummary(month);

  return { data: summary };
}, 'GET /api/summary');
