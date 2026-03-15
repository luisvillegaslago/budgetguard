/**
 * BudgetGuard Tunnel Sessions Hooks
 * TanStack Query hooks for tunnel session CRUD and import operations
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINT, API_ERROR, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import { useApiMutation } from '@/hooks/useApiMutation';
import type { CreateTunnelSessionInput, UpdateTunnelSessionInput } from '@/schemas/skydive';
import type { ApiResponse } from '@/types/finance';
import type { ImportResult, TunnelSession } from '@/types/skydive';
import { extractApiErrorKey } from '@/utils/apiErrorHandler';
import { fetchApi } from '@/utils/fetchApi';

async function fetchTunnelSessions(filters?: { year?: number; location?: string }): Promise<TunnelSession[]> {
  const params = new URLSearchParams();
  if (filters?.year) params.set('year', String(filters.year));
  if (filters?.location) params.set('location', filters.location);

  const url = params.toString() ? `${API_ENDPOINT.TUNNEL_SESSIONS}?${params}` : API_ENDPOINT.TUNNEL_SESSIONS;

  const response = await fetchApi(url);
  if (!response.ok) throw new Error('Error loading tunnel sessions');

  const data: ApiResponse<TunnelSession[]> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');

  return data.data;
}

export function useTunnelSessions(filters?: { year?: number; location?: string }) {
  return useQuery({
    queryKey: [QUERY_KEY.TUNNEL_SESSIONS, filters],
    queryFn: () => fetchTunnelSessions(filters),
    staleTime: CACHE_TIME.TWO_MINUTES,
  });
}

export function useCreateTunnelSession() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: async (input: CreateTunnelSessionInput) => {
      const response = await fetchApi(API_ENDPOINT.TUNNEL_SESSIONS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorData: ApiResponse<never> = await response.json();
        throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.CREATE.TUNNEL_SESSION));
      }

      const data: ApiResponse<TunnelSession> = await response.json();
      if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TUNNEL_SESSIONS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SKYDIVE_STATS] });
    },
  });
}

export function useUpdateTunnelSession() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: async (params: { sessionId: number; data: UpdateTunnelSessionInput }) => {
      const response = await fetchApi(`${API_ENDPOINT.TUNNEL_SESSIONS}/${params.sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params.data),
      });

      if (!response.ok) {
        const errorData: ApiResponse<never> = await response.json();
        throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.UPDATE.TUNNEL_SESSION));
      }

      const data: ApiResponse<TunnelSession> = await response.json();
      if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TUNNEL_SESSIONS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SKYDIVE_STATS] });
    },
  });
}

export function useDeleteTunnelSession() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: async (sessionId: number) => {
      const response = await fetchApi(`${API_ENDPOINT.TUNNEL_SESSIONS}/${sessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData: ApiResponse<never> = await response.json();
        throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.DELETE.TUNNEL_SESSION));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TUNNEL_SESSIONS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SKYDIVE_STATS] });
    },
  });
}

export function useImportTunnelSessions() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: async (rows: Record<string, unknown>[]) => {
      const response = await fetchApi(`${API_ENDPOINT.TUNNEL_SESSIONS}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });

      if (!response.ok) {
        const errorData: ApiResponse<never> = await response.json();
        throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.IMPORT.TUNNEL_SESSIONS));
      }

      const data: ApiResponse<ImportResult & { validationErrors: Array<{ row: number; error: string }> }> =
        await response.json();
      if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TUNNEL_SESSIONS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SKYDIVE_STATS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRANSACTIONS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SUMMARY] });
    },
  });
}
