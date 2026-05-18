/**
 * BudgetGuard Skydive Suggestions Hooks
 * Distinct dropzones and tunnel locations for the current user — used to
 * power the autocomplete combobox in the jump and tunnel session forms.
 */

import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import type { ApiResponse } from '@/types/finance';
import { fetchApi } from '@/utils/fetchApi';

async function fetchStringList(url: string): Promise<string[]> {
  const response = await fetchApi(url);
  if (!response.ok) throw new Error('Error loading suggestions');

  const data: ApiResponse<string[]> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');

  return data.data;
}

export function useDropzones() {
  return useQuery({
    queryKey: [QUERY_KEY.SKYDIVE_DROPZONES],
    queryFn: () => fetchStringList(API_ENDPOINT.SKYDIVE_DROPZONES),
    staleTime: CACHE_TIME.FIVE_MINUTES,
  });
}

export function useTunnelLocations() {
  return useQuery({
    queryKey: [QUERY_KEY.TUNNEL_LOCATIONS],
    queryFn: () => fetchStringList(API_ENDPOINT.TUNNEL_LOCATIONS),
    staleTime: CACHE_TIME.FIVE_MINUTES,
  });
}
