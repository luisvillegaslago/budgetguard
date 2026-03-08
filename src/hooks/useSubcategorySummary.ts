/**
 * BudgetGuard Subcategory Summary Hook
 * TanStack Query hook for fetching subcategory drill-down data
 * Only enabled when a parent category is expanded
 */

import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import type { ApiResponse, SubcategorySummary } from '@/types/finance';
import { fetchApi } from '@/utils/fetchApi';

async function fetchSubcategorySummary(month: string, parentCategoryId: number): Promise<SubcategorySummary[]> {
  const params = new URLSearchParams({
    month,
    categoryId: String(parentCategoryId),
  });

  const response = await fetchApi(`${API_ENDPOINT.SUBCATEGORY_SUMMARY}?${params.toString()}`);

  if (!response.ok) {
    throw new Error('Error al cargar resumen de subcategorias');
  }

  const data: ApiResponse<SubcategorySummary[]> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

/**
 * Hook to fetch subcategory breakdown for a parent category
 * Only enabled when parentCategoryId is provided (lazy loading on expand)
 */
export function useSubcategorySummary(month: string, parentCategoryId: number | null) {
  return useQuery({
    queryKey: [QUERY_KEY.SUBCATEGORY_SUMMARY, month, parentCategoryId],
    queryFn: () => fetchSubcategorySummary(month, parentCategoryId!),
    enabled: parentCategoryId !== null,
    staleTime: CACHE_TIME.FIVE_MINUTES,
  });
}
