/**
 * BudgetGuard Database Backup Hooks
 * TanStack Query hooks for comparing and backing up primary → backup databases
 */

import { useQuery } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import type { ApiResponse } from '@/types/finance';
import type { SyncCompareResult, SyncExecuteInput, SyncExecutionResult, SyncProgressEvent } from '@/types/sync';
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

/**
 * Hook to compare primary and backup databases
 * Manual refetch only (no automatic polling)
 */
export function useSyncCompare() {
  return useQuery({
    queryKey: [QUERY_KEY.SYNC_COMPARE],
    queryFn: fetchSyncCompare,
    enabled: false, // Only fetch on manual trigger
    gcTime: CACHE_TIME.NO_CACHE, // Don't cache — always start fresh on mount
  });
}

interface SyncExecuteState {
  isExecuting: boolean;
  progress: SyncProgressEvent | null;
  result: SyncExecutionResult | null;
  error: string | null;
}

/**
 * Hook to execute a backup operation with SSE progress streaming
 */
export function useSyncExecute() {
  const [state, setState] = useState<SyncExecuteState>({
    isExecuting: false,
    progress: null,
    result: null,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const execute = useCallback(async (input: SyncExecuteInput) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setState({ isExecuting: true, progress: null, result: null, error: null });

    try {
      const response = await fetchApi(API_ENDPOINT.SYNC_EXECUTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: abort.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error('Error executing backup');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';

        lines.forEach((line) => {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) return;
          const json = trimmed.slice(6);

          try {
            const event = JSON.parse(json) as SyncProgressEvent;

            if (event.phase === 'done') {
              const result = JSON.parse(event.message ?? '{}') as SyncExecutionResult;
              setState({ isExecuting: false, progress: null, result, error: null });
            } else if (event.phase === 'error') {
              setState({ isExecuting: false, progress: null, result: null, error: event.message ?? 'Unknown error' });
            } else {
              setState((prev) => ({ ...prev, progress: event }));
            }
          } catch {
            // Ignore parse errors from partial chunks
          }
        });
      }
    } catch (err) {
      if (abort.signal.aborted) return;
      const message = err instanceof Error ? err.message : 'Unknown error';
      setState({ isExecuting: false, progress: null, result: null, error: message });
    }
  }, []);

  const reset = useCallback(() => {
    setState({ isExecuting: false, progress: null, result: null, error: null });
  }, []);

  return { ...state, execute, reset };
}
