/**
 * TanStack Query hooks for the Modelo 100 crypto views:
 *  - useCryptoModelo100Summary(year)  → 4 boxes for the year
 *  - useRecomputeCryptoFiscal()       → POST recompute
 *  - useCryptoDisposals(filters)      → paginated FIFO disposals table
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINT, API_ERROR, CACHE_TIME, type CryptoContraprestacion, QUERY_KEY } from '@/constants/finance';
import { useApiMutation } from '@/hooks/useApiMutation';
import type { ApiResponse } from '@/types/finance';
import { extractApiErrorKey } from '@/utils/apiErrorHandler';
import { fetchApi } from '@/utils/fetchApi';

export interface BucketSummary {
  transmissionValueCents: number;
  transmissionFeeCents: number;
  acquisitionValueCents: number;
  acquisitionFeeCents: number;
  gainLossCents: number;
  rowCount: number;
}

export interface Modelo100CryptoSummary {
  fiscalYear: number;
  casilla1804F: BucketSummary;
  casilla1804N: BucketSummary;
  casilla0304Cents: number;
  casilla0033Cents: number;
  incompleteCoverageCount: number;
  computedAt: string;
}

export interface Modelo100CryptoResponse {
  summary: Modelo100CryptoSummary;
  availableYears: number[];
}

export interface DisposalDto {
  disposalId: string;
  fiscalYear: number;
  occurredAt: string;
  asset: string;
  contraprestacion: CryptoContraprestacion;
  quantityNative: string;
  transmissionValueCents: number;
  transmissionFeeCents: number;
  acquisitionValueCents: number;
  acquisitionFeeCents: number;
  gainLossCents: number;
  acquisitionLots: Array<{
    sourceEventId: string;
    sourceDate: string;
    quantityConsumed: string;
    unitCostCents: number;
    acquisitionValueCents: number;
    acquisitionFeeCents: number;
  }>;
}

export interface DisposalsPage {
  data: DisposalDto[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

// ============================================================
// Modelo 100 summary
// ============================================================

async function fetchModelo100(year: number): Promise<Modelo100CryptoResponse> {
  const response = await fetchApi(`${API_ENDPOINT.CRYPTO_FISCAL_MODELO}?year=${year}`);
  if (!response.ok) throw new Error('Error loading crypto modelo 100 summary');
  const data: ApiResponse<Modelo100CryptoResponse> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
  return data.data;
}

export function useCryptoModelo100Summary(year: number) {
  return useQuery({
    queryKey: [QUERY_KEY.CRYPTO_MODELO, year],
    queryFn: () => fetchModelo100(year),
    staleTime: CACHE_TIME.ONE_MINUTE,
  });
}

// ============================================================
// Recompute
// ============================================================

export interface RecomputeYearSummary {
  fiscalYear: number;
  disposalsInserted: number;
  incompleteCoverageCount: number;
}

export interface RecomputeResponse {
  mode: 'all' | 'year';
  years: RecomputeYearSummary[];
  totalDisposalsInserted?: number;
  totalIncompleteCoverage?: number;
}

/**
 * Trigger a FIFO recompute. Pass a `year` to limit the run to that fiscal
 * year, or omit it to recompute every year with data (the recommended
 * default — see endpoint docs).
 */
async function recomputeRequest(year?: number): Promise<RecomputeResponse> {
  const response = await fetchApi(API_ENDPOINT.CRYPTO_FISCAL_RECOMPUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(year != null ? { year } : {}),
  });
  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.SYNC.CRYPTO));
  }
  const data: ApiResponse<RecomputeResponse> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
  return data.data;
}

export function useRecomputeCryptoFiscal() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: recomputeRequest,
    onSuccess: () => {
      // Recompute touches every year — invalidate the entire summary cache,
      // not just one year.
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.CRYPTO_MODELO] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.CRYPTO_DISPOSALS] });
    },
  });
}

// ============================================================
// Disposals (paginated)
// ============================================================

export interface DisposalsFilters {
  year: number;
  asset?: string;
  contraprestacion?: CryptoContraprestacion;
  page?: number;
}

async function fetchDisposals(filters: DisposalsFilters): Promise<DisposalsPage> {
  const params = new URLSearchParams();
  params.set('year', String(filters.year));
  if (filters.asset) params.set('asset', filters.asset);
  if (filters.contraprestacion) params.set('contraprestacion', filters.contraprestacion);
  if (filters.page) params.set('page', String(filters.page));

  const response = await fetchApi(`${API_ENDPOINT.CRYPTO_FISCAL_DISPOSALS}?${params}`);
  if (!response.ok) throw new Error('Error loading disposals');
  return (await response.json()) as DisposalsPage;
}

export function useCryptoDisposals(filters: DisposalsFilters) {
  return useQuery({
    queryKey: [QUERY_KEY.CRYPTO_DISPOSALS, filters],
    queryFn: () => fetchDisposals(filters),
    staleTime: CACHE_TIME.ONE_MINUTE,
  });
}
