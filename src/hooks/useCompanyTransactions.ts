/**
 * BudgetGuard Company Transactions Hook
 * TanStack Query hook for fetching all transactions linked to a company
 */

import { useQuery } from '@tanstack/react-query';
import type { DateRangePreset } from '@/constants/finance';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import type { ApiResponse, CategoryHistoryMonth, CategoryHistorySummary, Company } from '@/types/finance';
import { fetchApi } from '@/utils/fetchApi';

interface CompanyTransactionsResponse {
  company: Company;
  dateFrom: string;
  dateTo: string;
  summary: CategoryHistorySummary;
  months: CategoryHistoryMonth[];
}

async function fetchCompanyTransactions(
  companyId: number,
  range: DateRangePreset,
): Promise<CompanyTransactionsResponse> {
  const response = await fetchApi(`${API_ENDPOINT.COMPANIES}/${companyId}/transactions?range=${range}`);

  if (!response.ok) {
    throw new Error('Error loading company transactions');
  }

  const data: ApiResponse<CompanyTransactionsResponse> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Unknown error');
  }

  return data.data;
}

export function useCompanyTransactions(companyId: number, range: DateRangePreset) {
  return useQuery({
    queryKey: [QUERY_KEY.COMPANIES, 'transactions', companyId, range],
    queryFn: () => fetchCompanyTransactions(companyId, range),
    staleTime: CACHE_TIME.FIVE_MINUTES,
    enabled: companyId > 0,
  });
}
