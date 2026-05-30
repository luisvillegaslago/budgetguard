/**
 * BudgetGuard Category Trends Hook
 * Fetches per-category expense totals across a month range (for the stacked area chart).
 */

import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import type { ApiResponse, CategoryTrends } from '@/types/finance';
import { fetchApi } from '@/utils/fetchApi';

async function fetchCategoryTrends(fromMonth: string, toMonth: string): Promise<CategoryTrends> {
  const response = await fetchApi(`${API_ENDPOINT.CATEGORY_TRENDS}?fromMonth=${fromMonth}&toMonth=${toMonth}`);

  if (!response.ok) {
    throw new Error('Error al cargar tendencias por categoría');
  }

  const data: ApiResponse<CategoryTrends> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

export function useCategoryTrends(fromMonth: string, toMonth: string) {
  return useQuery({
    queryKey: [QUERY_KEY.CATEGORY_TRENDS, fromMonth, toMonth],
    queryFn: () => fetchCategoryTrends(fromMonth, toMonth),
    staleTime: CACHE_TIME.FIVE_MINUTES,
  });
}
