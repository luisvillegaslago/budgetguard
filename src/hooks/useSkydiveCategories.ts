/**
 * BudgetGuard Skydive Categories Hook
 * TanStack Query hook for fetching Paracaidismo subcategories
 */

import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import type { ApiResponse, Category } from '@/types/finance';
import { fetchApi } from '@/utils/fetchApi';

async function fetchSkydiveCategories(): Promise<Category[]> {
  const response = await fetchApi(API_ENDPOINT.SKYDIVE_CATEGORIES);
  if (!response.ok) throw new Error('Error loading skydive categories');

  const data: ApiResponse<Category[]> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');

  return data.data;
}

export function useSkydiveCategories() {
  return useQuery({
    queryKey: [QUERY_KEY.SKYDIVE_CATEGORIES],
    queryFn: fetchSkydiveCategories,
    staleTime: CACHE_TIME.TEN_MINUTES,
  });
}
