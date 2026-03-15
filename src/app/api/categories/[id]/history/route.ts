/**
 * BudgetGuard Category History API
 * GET /api/categories/[id]/history?range=1y - Get category transaction history
 */

import type { DateRangePreset } from '@/constants/finance';
import { API_ERROR, DATE_RANGE_PRESET } from '@/constants/finance';
import { CategoryHistoryFiltersSchema, validateRequest } from '@/schemas/transaction';
import { getCategoryById } from '@/services/database/CategoryRepository';
import { getCategoryHistorySummary, getCategoryHistoryTransactions } from '@/services/database/TransactionRepository';
import type { CategoryHistoryMonth } from '@/types/finance';
import { notFound, parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';

/**
 * Resolve a date range preset to concrete from/to dates
 */
function resolveRange(range: DateRangePreset): { dateFrom: Date; dateTo: Date } {
  const dateTo = new Date();
  dateTo.setHours(23, 59, 59, 999);

  const dateFrom = new Date();
  dateFrom.setHours(0, 0, 0, 0);

  switch (range) {
    case DATE_RANGE_PRESET.THREE_MONTHS:
      dateFrom.setMonth(dateFrom.getMonth() - 3);
      break;
    case DATE_RANGE_PRESET.SIX_MONTHS:
      dateFrom.setMonth(dateFrom.getMonth() - 6);
      break;
    case DATE_RANGE_PRESET.ONE_YEAR:
      dateFrom.setFullYear(dateFrom.getFullYear() - 1);
      break;
    case DATE_RANGE_PRESET.ALL:
      dateFrom.setFullYear(2020, 0, 1);
      break;
  }

  return { dateFrom, dateTo };
}

export const GET = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const categoryId = parseIdParam(id);
  if (typeof categoryId !== 'number') return categoryId;

  const searchParams = Object.fromEntries(request.nextUrl.searchParams);
  const validation = validateRequest(CategoryHistoryFiltersSchema, searchParams);
  if (!validation.success) return validationError(validation.errors);

  const { range = DATE_RANGE_PRESET.ONE_YEAR } = validation.data;
  const { dateFrom, dateTo } = resolveRange(range);

  const category = await getCategoryById(categoryId);
  if (!category) return notFound(API_ERROR.NOT_FOUND.CATEGORY);

  const [summary, transactions] = await Promise.all([
    getCategoryHistorySummary(categoryId, dateFrom, dateTo),
    getCategoryHistoryTransactions(categoryId, dateFrom, dateTo),
  ]);

  // Group transactions by month using .reduce()
  const months = transactions.reduce<CategoryHistoryMonth[]>((acc, transaction) => {
    const monthKey = transaction.transactionDate.substring(0, 7);
    const existingMonth = acc.find((m) => m.month === monthKey);

    if (existingMonth) {
      existingMonth.transactions.push(transaction);
      existingMonth.totalCents += transaction.amountCents;
      existingMonth.transactionCount += 1;
    } else {
      acc.push({
        month: monthKey,
        totalCents: transaction.amountCents,
        transactionCount: 1,
        transactions: [transaction],
      });
    }

    return acc;
  }, []);

  return {
    data: {
      category,
      dateFrom: dateFrom.toISOString().split('T')[0],
      dateTo: dateTo.toISOString().split('T')[0],
      summary,
      months,
    },
  };
}, 'GET /api/categories/[id]/history');
