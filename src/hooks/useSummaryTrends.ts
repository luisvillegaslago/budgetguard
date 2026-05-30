/**
 * BudgetGuard Summary Trends Hooks
 * TanStack Query hook for multi-month trends + a formatted wrapper for charts
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import type {
  ApiResponse,
  FormattedMonthlySummaryTrends,
  FormattedTrendPoint,
  MonthlySummaryTrends,
} from '@/types/finance';
import { fetchApi } from '@/utils/fetchApi';
import { centsToEuros, formatCurrency } from '@/utils/money';

async function fetchSummaryTrends(fromMonth: string, toMonth: string): Promise<MonthlySummaryTrends> {
  const response = await fetchApi(`${API_ENDPOINT.SUMMARY_TRENDS}?fromMonth=${fromMonth}&toMonth=${toMonth}`);

  if (!response.ok) {
    throw new Error('Error al cargar tendencias mensuales');
  }

  const data: ApiResponse<MonthlySummaryTrends> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

/**
 * Hook to fetch multi-month trends (raw cents data)
 */
export function useSummaryTrends(fromMonth: string, toMonth: string) {
  return useQuery({
    queryKey: [QUERY_KEY.SUMMARY_TRENDS, fromMonth, toMonth],
    queryFn: () => fetchSummaryTrends(fromMonth, toMonth),
    staleTime: CACHE_TIME.FIVE_MINUTES,
  });
}

/**
 * Hook that provides formatted trends ready for charts.
 * Transforms cents to euros and computes a running cumulative balance.
 */
export function useFormattedSummaryTrends(fromMonth: string, toMonth: string) {
  const query = useSummaryTrends(fromMonth, toMonth);

  const formatted = useMemo((): FormattedMonthlySummaryTrends | null => {
    if (!query.data) return null;

    let cumulativeCents = 0;
    const points: FormattedTrendPoint[] = query.data.points.map((point) => {
      cumulativeCents += point.balanceCents;

      return {
        month: point.month,
        income: formatCurrency(point.incomeCents),
        incomeValue: centsToEuros(point.incomeCents),
        expense: formatCurrency(point.expenseCents),
        expenseValue: centsToEuros(point.expenseCents),
        balance: formatCurrency(point.balanceCents),
        balanceValue: centsToEuros(point.balanceCents),
        cumulativeBalanceValue: centsToEuros(cumulativeCents),
      };
    });

    return { fromMonth: query.data.fromMonth, toMonth: query.data.toMonth, points };
  }, [query.data]);

  return {
    ...query,
    formatted,
  };
}
