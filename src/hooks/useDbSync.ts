/**
 * BudgetGuard Database Sync Hooks
 * TanStack Query hooks for comparing and syncing local ↔ remote databases
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { API_ENDPOINT, QUERY_KEY } from '@/constants/finance';
import type { ApiResponse } from '@/types/finance';
import type { SyncCompareResult, SyncExecuteInput, SyncExecutionResult } from '@/types/sync';
import { fetchApi } from '@/utils/fetchApi';

async function fetchSyncCompare(): Promise<SyncCompareResult> {
  const response = await fetchApi(API_ENDPOINT.SYNC_COMPARE);

  if (!response.ok) {
    throw new Error('Error comparing databases');
  }

  const data: ApiResponse<SyncCompareResult> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Unknown error');
  }

  return data.data;
}

async function executeSyncRequest(input: SyncExecuteInput): Promise<SyncExecutionResult> {
  const response = await fetchApi(API_ENDPOINT.SYNC_EXECUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error('Error executing sync');
  }

  const data: ApiResponse<SyncExecutionResult> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Unknown error');
  }

  return data.data;
}

/**
 * Hook to compare local and remote databases
 * Manual refetch only (no automatic polling)
 */
export function useSyncCompare() {
  return useQuery({
    queryKey: [QUERY_KEY.SYNC_COMPARE],
    queryFn: fetchSyncCompare,
    enabled: false, // Only fetch on manual trigger
    gcTime: 0, // Don't cache — always start fresh on mount
  });
}

/**
 * Hook to execute a sync operation (push or pull)
 */
export function useSyncExecute() {
  return useMutation({
    mutationFn: executeSyncRequest,
  });
}
