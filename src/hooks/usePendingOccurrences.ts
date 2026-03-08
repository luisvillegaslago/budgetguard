/**
 * BudgetGuard Pending Occurrences Hooks
 * TanStack Query hooks for pending occurrence operations
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import type { ApiResponse, PendingOccurrencesSummary, RecurringOccurrence } from '@/types/finance';
import { fetchApi } from '@/utils/fetchApi';

async function fetchPendingOccurrences(): Promise<PendingOccurrencesSummary> {
  const response = await fetchApi(`${API_ENDPOINT.RECURRING_EXPENSES}/pending`);

  if (!response.ok) {
    throw new Error('Error al cargar ocurrencias pendientes');
  }

  const data: ApiResponse<PendingOccurrencesSummary> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

async function confirmOccurrenceRequest(params: {
  occurrenceId: number;
  modifiedAmount?: number;
}): Promise<RecurringOccurrence> {
  const response = await fetchApi(`${API_ENDPOINT.RECURRING_EXPENSES}/occurrences/${params.occurrenceId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params.modifiedAmount ? { modifiedAmount: params.modifiedAmount } : {}),
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(errorData.error ?? 'Error al confirmar ocurrencia');
  }

  const data: ApiResponse<RecurringOccurrence> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

async function skipOccurrenceRequest(occurrenceId: number): Promise<void> {
  const response = await fetchApi(`${API_ENDPOINT.RECURRING_EXPENSES}/occurrences/${occurrenceId}/skip`, {
    method: 'POST',
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(errorData.error ?? 'Error al omitir ocurrencia');
  }
}

/**
 * Hook to fetch all pending occurrences (retroactive, no month filter)
 */
export function usePendingOccurrences() {
  return useQuery({
    queryKey: [QUERY_KEY.PENDING_OCCURRENCES],
    queryFn: fetchPendingOccurrences,
    staleTime: CACHE_TIME.ONE_MINUTE,
  });
}

/**
 * Hook to confirm a single occurrence (creates a real transaction)
 */
export function useConfirmOccurrence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: confirmOccurrenceRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.PENDING_OCCURRENCES] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRANSACTIONS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SUMMARY] });
    },
  });
}

/**
 * Hook to skip a single occurrence
 */
export function useSkipOccurrence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: skipOccurrenceRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.PENDING_OCCURRENCES] });
    },
  });
}

/**
 * Hook to confirm all occurrences for a specific month (batch)
 */
export function useConfirmAllOccurrences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (occurrenceIds: number[]) => {
      await Promise.all(occurrenceIds.map((occurrenceId) => confirmOccurrenceRequest({ occurrenceId })));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.PENDING_OCCURRENCES] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRANSACTIONS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SUMMARY] });
    },
  });
}
