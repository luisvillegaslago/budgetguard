/**
 * BudgetGuard Skydive Jumps Hooks
 * TanStack Query hooks for jump CRUD and import operations
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import type { CreateJumpInput, UpdateJumpInput } from '@/schemas/skydive';
import type { ApiResponse } from '@/types/finance';
import type { ImportResult, SkydiveJump } from '@/types/skydive';
import { fetchApi } from '@/utils/fetchApi';

async function fetchJumps(filters?: { year?: number; dropzone?: string }): Promise<SkydiveJump[]> {
  const params = new URLSearchParams();
  if (filters?.year) params.set('year', String(filters.year));
  if (filters?.dropzone) params.set('dropzone', filters.dropzone);

  const url = params.toString() ? `${API_ENDPOINT.SKYDIVE_JUMPS}?${params}` : API_ENDPOINT.SKYDIVE_JUMPS;

  const response = await fetchApi(url);
  if (!response.ok) throw new Error('Error loading jumps');

  const data: ApiResponse<SkydiveJump[]> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');

  return data.data;
}

export function useSkydiveJumps(filters?: { year?: number; dropzone?: string }) {
  return useQuery({
    queryKey: [QUERY_KEY.SKYDIVE_JUMPS, filters],
    queryFn: () => fetchJumps(filters),
    staleTime: CACHE_TIME.TWO_MINUTES,
  });
}

export function useCreateJump() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateJumpInput) => {
      const response = await fetchApi(API_ENDPOINT.SKYDIVE_JUMPS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorData: ApiResponse<never> = await response.json();
        throw new Error(errorData.error ?? 'Error creating jump');
      }

      const data: ApiResponse<SkydiveJump> = await response.json();
      if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SKYDIVE_JUMPS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SKYDIVE_STATS] });
    },
  });
}

export function useUpdateJump() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { jumpId: number; data: UpdateJumpInput }) => {
      const response = await fetchApi(`${API_ENDPOINT.SKYDIVE_JUMPS}/${params.jumpId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params.data),
      });

      if (!response.ok) {
        const errorData: ApiResponse<never> = await response.json();
        throw new Error(errorData.error ?? 'Error updating jump');
      }

      const data: ApiResponse<SkydiveJump> = await response.json();
      if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SKYDIVE_JUMPS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SKYDIVE_STATS] });
    },
  });
}

export function useDeleteJump() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jumpId: number) => {
      const response = await fetchApi(`${API_ENDPOINT.SKYDIVE_JUMPS}/${jumpId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData: ApiResponse<never> = await response.json();
        throw new Error(errorData.error ?? 'Error deleting jump');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SKYDIVE_JUMPS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SKYDIVE_STATS] });
    },
  });
}

export function useImportJumps() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rows: Record<string, unknown>[]) => {
      const response = await fetchApi(`${API_ENDPOINT.SKYDIVE_JUMPS}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });

      if (!response.ok) {
        const errorData: ApiResponse<never> = await response.json();
        throw new Error(errorData.error ?? 'Error importing jumps');
      }

      const data: ApiResponse<ImportResult & { validationErrors: Array<{ row: number; error: string }> }> =
        await response.json();
      if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SKYDIVE_JUMPS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SKYDIVE_STATS] });
    },
  });
}
