/**
 * BudgetGuard Skydive Stats Hook
 * TanStack Query hook for aggregated skydiving statistics
 */

import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import type { ApiResponse } from '@/types/finance';
import type { SkydiveStats } from '@/types/skydive';
import { fetchApi } from '@/utils/fetchApi';

async function fetchSkydiveStats(): Promise<SkydiveStats> {
  const response = await fetchApi(API_ENDPOINT.SKYDIVE_STATS);
  if (!response.ok) throw new Error('Error loading stats');

  const data: ApiResponse<SkydiveStats> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');

  return data.data;
}

export function useSkydiveStats() {
  return useQuery({
    queryKey: [QUERY_KEY.SKYDIVE_STATS],
    queryFn: fetchSkydiveStats,
    staleTime: CACHE_TIME.FIVE_MINUTES,
  });
}
