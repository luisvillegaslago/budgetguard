/**
 * BudgetGuard Company Transactions API
 * GET /api/companies/[id]/transactions?range=1y - Get all transactions for a company
 */

import type { DateRangePreset } from '@/constants/finance';
import { API_ERROR, DATE_RANGE_PRESET } from '@/constants/finance';
import { CategoryHistoryFiltersSchema, validateRequest } from '@/schemas/transaction';
import { getCompanyById } from '@/services/database/CompanyRepository';
import { getCompanyTransactions, getCompanyTransactionsSummary } from '@/services/database/TransactionRepository';
import type { CategoryHistoryMonth } from '@/types/finance';
import { notFound, parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';

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
  const companyId = parseIdParam(id);
  if (typeof companyId !== 'number') return companyId;

  const searchParams = Object.fromEntries(request.nextUrl.searchParams);
  const validation = validateRequest(CategoryHistoryFiltersSchema, searchParams);
  if (!validation.success) return validationError(validation.errors);

  const { range = DATE_RANGE_PRESET.ONE_YEAR } = validation.data;
  const { dateFrom, dateTo } = resolveRange(range);

  const company = await getCompanyById(companyId);
  if (!company) return notFound(API_ERROR.NOT_FOUND.COMPANY);

  const [summary, transactions] = await Promise.all([
    getCompanyTransactionsSummary(companyId, dateFrom, dateTo),
    getCompanyTransactions(companyId, dateFrom, dateTo),
  ]);

  // Group transactions by month
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
      company,
      dateFrom: dateFrom.toISOString().split('T')[0],
      dateTo: dateTo.toISOString().split('T')[0],
      summary,
      months,
    },
  };
}, 'GET /api/companies/[id]/transactions');
