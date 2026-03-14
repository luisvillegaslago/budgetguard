/**
 * BudgetGuard Fiscal Deadlines Hooks
 * TanStack Query hooks for AEAT deadline data (server-computed).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import type { ApiResponse, FiscalDeadline, FiscalDeadlineSettings } from '@/types/finance';
import { fetchApi } from '@/utils/fetchApi';

// ============================================================
// Fetch Functions
// ============================================================

async function fetchDeadlines(year: number): Promise<FiscalDeadline[]> {
  const params = new URLSearchParams({ year: String(year) });
  const response = await fetchApi(`${API_ENDPOINT.FISCAL_DEADLINES}?${params.toString()}`);
  if (!response.ok) throw new Error('Error loading fiscal deadlines');
  const data: ApiResponse<FiscalDeadline[]> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
  return data.data;
}

async function fetchUpcomingDeadlines(): Promise<FiscalDeadline[]> {
  const response = await fetchApi(`${API_ENDPOINT.FISCAL_DEADLINES}?active=true`);
  if (!response.ok) throw new Error('Error loading upcoming deadlines');
  const data: ApiResponse<FiscalDeadline[]> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
  return data.data;
}

async function fetchDeadlineSettings(): Promise<FiscalDeadlineSettings> {
  const response = await fetchApi(API_ENDPOINT.FISCAL_DEADLINE_SETTINGS);
  if (!response.ok) throw new Error('Error loading deadline settings');
  const data: ApiResponse<FiscalDeadlineSettings> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
  return data.data;
}

// ============================================================
// Queries
// ============================================================

/**
 * All deadlines for a given year (fiscal page)
 */
export function useFiscalDeadlines(year: number) {
  return useQuery({
    queryKey: [QUERY_KEY.FISCAL_DEADLINES, year],
    queryFn: () => fetchDeadlines(year),
    staleTime: CACHE_TIME.FIVE_MINUTES,
  });
}

/**
 * Only upcoming/due/overdue deadlines (dashboard banner + sidebar badge)
 */
export function useUpcomingDeadlines() {
  return useQuery({
    queryKey: [QUERY_KEY.FISCAL_DEADLINES, 'active'],
    queryFn: fetchUpcomingDeadlines,
    staleTime: CACHE_TIME.FIVE_MINUTES,
  });
}

/**
 * Deadline reminder settings
 */
export function useFiscalDeadlineSettings() {
  return useQuery({
    queryKey: [QUERY_KEY.FISCAL_DEADLINE_SETTINGS],
    queryFn: fetchDeadlineSettings,
    staleTime: CACHE_TIME.TEN_MINUTES,
  });
}

// ============================================================
// Mutations
// ============================================================

export function useUpdateDeadlineSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: FiscalDeadlineSettings) => {
      const response = await fetchApi(API_ENDPOINT.FISCAL_DEADLINE_SETTINGS, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? 'Settings update failed');
      }

      const data: ApiResponse<FiscalDeadlineSettings> = await response.json();
      if (!data.success || !data.data) throw new Error(data.error ?? 'Settings update failed');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.FISCAL_DEADLINE_SETTINGS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.FISCAL_DEADLINES] });
    },
  });
}
