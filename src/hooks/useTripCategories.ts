/**
 * BudgetGuard Trip Categories Hook
 * TanStack Query hook for fetching trip-specific categories (Viajes subcategories)
 */

import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import type { ApiResponse, Category } from '@/types/finance';
import { fetchApi } from '@/utils/fetchApi';

async function fetchTripCategories(): Promise<Category[]> {
  const response = await fetchApi(`${API_ENDPOINT.TRIPS}/categories`);

  if (!response.ok) {
    throw new Error('Error al cargar categorias de viaje');
  }

  const data: ApiResponse<Category[]> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

/**
 * Hook to fetch trip-specific categories (subcategories under "Viajes")
 */
export function useTripCategories() {
  return useQuery({
    queryKey: [QUERY_KEY.TRIP_CATEGORIES],
    queryFn: fetchTripCategories,
    staleTime: CACHE_TIME.TEN_MINUTES,
  });
}
