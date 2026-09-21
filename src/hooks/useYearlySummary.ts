/**
 * BudgetGuard Yearly Summary Hook
 * TanStack Query hook for the yearly lens of the dashboard summary.
 * Same endpoint and same payload shape as the monthly one, rolled up server-side.
 */

import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY, SUMMARY_GRANULARITY } from '@/constants/finance';
import type { ApiResponse, YearlySummary } from '@/types/finance';
import { fetchApi } from '@/utils/fetchApi';

async function fetchYearlySummary(year: string): Promise<YearlySummary> {
  const response = await fetchApi(`${API_ENDPOINT.SUMMARY}?year=${year}`);

  if (!response.ok) {
    throw new Error('Error al cargar resumen anual');
  }

  const data: ApiResponse<YearlySummary> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

interface SummaryQueryOptions {
  /** Off while the dashboard is looking through the monthly lens. */
  enabled?: boolean;
}

/**
 * Hook to fetch yearly summary (raw cents data)
 */
export function useYearlySummary(year: string, options?: SummaryQueryOptions) {
  return useQuery({
    // Nested under QUERY_KEY.SUMMARY on purpose: TanStack matches keys element-wise,
    // so every mutation that already invalidates ['summary'] refreshes this too.
    queryKey: [QUERY_KEY.SUMMARY, SUMMARY_GRANULARITY.YEAR, year],
    queryFn: () => fetchYearlySummary(year),
    staleTime: CACHE_TIME.FIVE_MINUTES,
    enabled: options?.enabled ?? true,
  });
}
