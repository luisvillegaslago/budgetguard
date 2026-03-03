/**
 * BudgetGuard Monthly Summary Hook
 * TanStack Query hook for fetching monthly summary data
 */

import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import type { ApiResponse, MonthlySummary } from '@/types/finance';

async function fetchMonthlySummary(month: string): Promise<MonthlySummary> {
  const response = await fetch(`${API_ENDPOINT.SUMMARY}?month=${month}`);

  if (!response.ok) {
    throw new Error('Error al cargar resumen mensual');
  }

  const data: ApiResponse<MonthlySummary> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

/**
 * Hook to fetch monthly summary (raw cents data)
 */
export function useMonthlySummary(month: string) {
  return useQuery({
    queryKey: [QUERY_KEY.SUMMARY, month],
    queryFn: () => fetchMonthlySummary(month),
    staleTime: CACHE_TIME.FIVE_MINUTES,
  });
}
