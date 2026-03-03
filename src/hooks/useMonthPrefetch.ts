/**
 * BudgetGuard Month Prefetch Hook
 * Prefetches adjacent months for instant navigation
 */

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import type { ApiResponse, MonthlySummary } from '@/types/finance';
import { addMonths } from '@/utils/helpers';

/**
 * Hook that prefetches previous and next month data
 * for instant navigation without loading states
 */
export function useMonthPrefetch(currentMonth: string) {
  const queryClient = useQueryClient();

  const prefetchMonth = useCallback(
    async (month: string) => {
      await queryClient.prefetchQuery({
        queryKey: [QUERY_KEY.SUMMARY, month],
        queryFn: async () => {
          const response = await fetch(`${API_ENDPOINT.SUMMARY}?month=${month}`);
          const data: ApiResponse<MonthlySummary> = await response.json();
          return data.data;
        },
        staleTime: CACHE_TIME.FIVE_MINUTES,
      });
    },
    [queryClient],
  );

  const prefetchAdjacentMonths = useCallback(() => {
    const prevMonth = addMonths(currentMonth, -1);
    const nextMonth = addMonths(currentMonth, 1);

    // Prefetch in background (non-blocking)
    prefetchMonth(prevMonth);
    prefetchMonth(nextMonth);
  }, [currentMonth, prefetchMonth]);

  // Auto-prefetch when current month changes
  useEffect(() => {
    prefetchAdjacentMonths();
  }, [prefetchAdjacentMonths]);

  return { prefetchAdjacentMonths };
}
