/**
 * TanStack Query hooks for sync orchestration:
 *  - useStartCryptoSync()        — POST /api/crypto/sync
 *  - useCryptoSyncJob(jobId)     — GET  /api/crypto/sync/[jobId]; auto-polls every 2s
 *                                  while the job is pending or running.
 *  - useCryptoEvents(filters)    — GET  /api/crypto/events?…
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINT,
  API_ERROR,
  CACHE_TIME,
  CRYPTO_EXCHANGE,
  CRYPTO_SYNC_STATUS,
  type CryptoEventType,
  type CryptoExchange,
  type CryptoSyncMode,
  type CryptoSyncStatus,
  QUERY_KEY,
} from '@/constants/finance';
import { useApiMutation } from '@/hooks/useApiMutation';
import type { ApiResponse } from '@/types/finance';
import { extractApiErrorKey } from '@/utils/apiErrorHandler';
import { fetchApi } from '@/utils/fetchApi';

export interface SyncJobSummary {
  jobId: number;
  exchange: CryptoExchange;
  mode: CryptoSyncMode;
  status: CryptoSyncStatus;
  scopeFrom: string;
  scopeTo: string;
}

export interface EndpointProgress {
  fetched: number;
  totalWindows: number;
  completedWindows: number;
  lastWindowEnd: string | null;
}

export interface SyncJob extends SyncJobSummary {
  progress: Record<CryptoEventType, EndpointProgress>;
  errorCode: string | null;
  errorMessage: string | null;
  eventsIngested: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RawEvent {
  eventId: string;
  eventType: CryptoEventType;
  externalId: string;
  occurredAt: string;
  rawPayload: Record<string, unknown>;
  ingestedAt: string;
  jobId: number | null;
}

export interface RawEventsPage {
  data: RawEvent[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

// ============================================================
// Mutations
// ============================================================

interface StartSyncRequest {
  exchange: CryptoExchange;
  mode: CryptoSyncMode;
  scopeFrom?: string; // ISO date — overrides default scope (full = 2017, incremental = lastCompleted)
}

async function startSyncRequest(input: StartSyncRequest): Promise<SyncJobSummary> {
  const response = await fetchApi(API_ENDPOINT.CRYPTO_SYNC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.SYNC.CRYPTO));
  }
  const data: ApiResponse<SyncJobSummary> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
  return data.data;
}

export function useStartCryptoSync() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: startSyncRequest,
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.CRYPTO_SYNC_STATUS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.CRYPTO_SYNC_STATUS, job.jobId] });
    },
  });
}

// ============================================================
// Polling job query
// ============================================================

async function fetchJob(jobId: number): Promise<SyncJob> {
  const response = await fetchApi(`${API_ENDPOINT.CRYPTO_SYNC}/${jobId}`);
  if (!response.ok) throw new Error('Error loading sync job');
  const data: ApiResponse<SyncJob> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
  return data.data;
}

function isTerminalStatus(status: CryptoSyncStatus): boolean {
  return (
    status === CRYPTO_SYNC_STATUS.COMPLETED ||
    status === CRYPTO_SYNC_STATUS.FAILED ||
    status === CRYPTO_SYNC_STATUS.CANCELLED
  );
}

export function useCryptoSyncJob(jobId: number | null) {
  return useQuery({
    queryKey: [QUERY_KEY.CRYPTO_SYNC_STATUS, jobId],
    queryFn: () => fetchJob(jobId ?? 0),
    enabled: jobId != null,
    refetchInterval: (query) => {
      const data = query.state.data as SyncJob | undefined;
      if (!data) return 2000;
      return isTerminalStatus(data.status) ? false : 2000;
    },
    staleTime: CACHE_TIME.NO_CACHE,
  });
}

// ============================================================
// Cancel mutation
// ============================================================

async function cancelSyncRequest(jobId: number): Promise<void> {
  const response = await fetchApi(`${API_ENDPOINT.CRYPTO_SYNC}/${jobId}/cancel`, {
    method: 'POST',
  });
  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.SYNC.CRYPTO));
  }
}

export function useCancelCryptoSync() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: cancelSyncRequest,
    onSuccess: (_data, jobId) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.CRYPTO_SYNC_STATUS, jobId] });
    },
  });
}

/**
 * Returns the user's currently active sync job for the exchange (running or
 * pending), or — if none — the most recent finished one. Used by the panel on
 * mount so the user can re-attach to a long-running sync after navigating
 * away and back.
 */
async function fetchLatestJob(exchange: CryptoExchange): Promise<SyncJob | null> {
  const response = await fetchApi(`${API_ENDPOINT.CRYPTO_SYNC}?exchange=${exchange}`);
  if (!response.ok) throw new Error('Error loading latest sync job');
  const data: ApiResponse<SyncJob | null> = await response.json();
  if (!data.success) throw new Error(data.error ?? 'Unknown error');
  return data.data ?? null;
}

export function useLatestCryptoSyncJob(exchange: CryptoExchange = CRYPTO_EXCHANGE.BINANCE) {
  return useQuery({
    queryKey: [QUERY_KEY.CRYPTO_SYNC_STATUS, 'latest', exchange],
    queryFn: () => fetchLatestJob(exchange),
    staleTime: CACHE_TIME.NO_CACHE,
  });
}

// ============================================================
// Raw events query (paginated)
// ============================================================

export interface EventsFilters {
  type?: CryptoEventType;
  from?: string;
  to?: string;
  page?: number;
}

async function fetchEvents(filters: EventsFilters): Promise<RawEventsPage> {
  const params = new URLSearchParams();
  if (filters.type) params.set('type', filters.type);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.page) params.set('page', String(filters.page));

  const url = params.toString() ? `${API_ENDPOINT.CRYPTO_EVENTS}?${params}` : API_ENDPOINT.CRYPTO_EVENTS;
  const response = await fetchApi(url);
  if (!response.ok) throw new Error('Error loading crypto events');
  return (await response.json()) as RawEventsPage;
}

export function useCryptoEvents(filters: EventsFilters) {
  return useQuery({
    queryKey: [QUERY_KEY.CRYPTO_EVENTS, filters],
    queryFn: () => fetchEvents(filters),
    staleTime: CACHE_TIME.ONE_MINUTE,
  });
}
