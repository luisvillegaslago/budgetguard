/**
 * BudgetGuard Category History Hook
 * TanStack Query hook for fetching category transaction history
 */

import { useQuery } from '@tanstack/react-query';
import type { DateRangePreset } from '@/constants/finance';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import type { ApiResponse, CategoryHistoryResponse } from '@/types/finance';

async function fetchCategoryHistory(categoryId: number, range: DateRangePreset): Promise<CategoryHistoryResponse> {
  const response = await fetch(`${API_ENDPOINT.CATEGORY_HISTORY}/${categoryId}/history?range=${range}`);

  if (!response.ok) {
    throw new Error('Error al cargar historial de categoría');
  }

  const data: ApiResponse<CategoryHistoryResponse> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

/**
 * Hook to fetch category transaction history across multiple months
 */
export function useCategoryHistory(categoryId: number, range: DateRangePreset) {
  return useQuery({
    queryKey: [QUERY_KEY.CATEGORY_HISTORY, categoryId, range],
    queryFn: () => fetchCategoryHistory(categoryId, range),
    staleTime: CACHE_TIME.FIVE_MINUTES,
    enabled: categoryId > 0,
  });
}
