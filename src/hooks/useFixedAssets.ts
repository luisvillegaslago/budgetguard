/**
 * BudgetGuard Fixed Assets (inmovilizado) Hooks
 * TanStack Query hooks for the assets whose cost is spread over their useful life instead of being
 * deducted in the year of purchase (art. 30.2 RIRPF).
 *
 * The dotación of a year is never fetched on its own: it is derived from the asset with
 * src/utils/amortization.ts, so nothing here has to stay in sync with a stored yearly figure.
 * Amounts travel in EUROS on the wire (see src/schemas/fixed-asset.ts) and come back in cents.
 *
 * Any mutation moves a deductible expense of the year, so it invalidates the fiscal reports and
 * the IRPF projection too — casillas 0208/0227 of Modelo 100 read the same assets.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINT, API_ERROR, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import { useApiMutation } from '@/hooks/useApiMutation';
import type { CreateFixedAssetInput, UpdateFixedAssetInput } from '@/schemas/fixed-asset';
import type { ApiResponse, AssetPurchaseCandidate, FixedAsset } from '@/types/finance';
import { extractApiErrorKey } from '@/utils/apiErrorHandler';
import { fetchApi } from '@/utils/fetchApi';
import { invalidateQueryKeys } from '@/utils/queryInvalidation';

/** Everything a dotación feeds: the asset list itself plus every fiscal figure derived from it. */
const AFFECTED_QUERY_KEYS = [
  QUERY_KEY.FIXED_ASSETS,
  QUERY_KEY.FISCAL_ANNUAL,
  QUERY_KEY.FISCAL_REPORT,
  QUERY_KEY.IRPF_PROJECTION,
  // Candidate lists too, and not only the one just linked: a movement is offered only while it is
  // nobody's purchase, so linking it has to withdraw it from every other asset that was offering it
  QUERY_KEY.ASSET_PURCHASE_CANDIDATES,
];

// ============================================================
// Fetch Functions
// ============================================================

async function fetchFixedAssets(year?: number): Promise<FixedAsset[]> {
  const params = year === undefined ? '' : `?${new URLSearchParams({ year: String(year) }).toString()}`;
  const response = await fetchApi(`${API_ENDPOINT.FIXED_ASSETS}${params}`);

  if (!response.ok) throw new Error(API_ERROR.LOAD.FIXED_ASSETS);

  const data: ApiResponse<FixedAsset[]> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? API_ERROR.LOAD.FIXED_ASSETS);

  return data.data;
}

/**
 * The movements that look like the purchase of an asset that has none linked. Never fetched for a
 * linked asset: the panel that asks for them only exists while `transactionId` is null.
 */
async function fetchAssetPurchaseCandidates(assetId: number): Promise<AssetPurchaseCandidate[]> {
  const response = await fetchApi(`${API_ENDPOINT.FIXED_ASSETS}/${assetId}/purchase-candidates`);

  if (!response.ok) throw new Error(API_ERROR.LOAD.ASSET_PURCHASE_CANDIDATES);

  const data: ApiResponse<AssetPurchaseCandidate[]> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? API_ERROR.LOAD.ASSET_PURCHASE_CANDIDATES);

  return data.data;
}

async function createFixedAssetRequest(input: CreateFixedAssetInput): Promise<FixedAsset> {
  const response = await fetchApi(API_ENDPOINT.FIXED_ASSETS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.CREATE.FIXED_ASSET));
  }

  const data: ApiResponse<FixedAsset> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? API_ERROR.MUTATION.CREATE.FIXED_ASSET);

  return data.data;
}

async function updateFixedAssetRequest(id: number, input: UpdateFixedAssetInput): Promise<FixedAsset> {
  const response = await fetchApi(`${API_ENDPOINT.FIXED_ASSETS}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.UPDATE.FIXED_ASSET));
  }

  const data: ApiResponse<FixedAsset> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? API_ERROR.MUTATION.UPDATE.FIXED_ASSET);

  return data.data;
}

async function deleteFixedAssetRequest(id: number): Promise<void> {
  const response = await fetchApi(`${API_ENDPOINT.FIXED_ASSETS}/${id}`, { method: 'DELETE' });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.DELETE.FIXED_ASSET));
  }
}

// ============================================================
// Queries
// ============================================================

/**
 * Fixed assets of the user. With a `year`, only those with a dotación in that fiscal year: an asset
 * bought in 2025 keeps showing up until its base is exhausted, and drops off the year after.
 */
export function useFixedAssets(year?: number) {
  return useQuery({
    queryKey: [QUERY_KEY.FIXED_ASSETS, year ?? null],
    queryFn: () => fetchFixedAssets(year),
    staleTime: CACHE_TIME.TEN_MINUTES,
  });
}

/**
 * Suggested purchases for one unlinked asset. `null` asks for nothing — the query only runs once a
 * concrete asset is asking, so the usual case (every asset linked) issues no request at all.
 *
 * Nothing here links anything: linking is useUpdateFixedAsset() with `{ transactionId }`, the same
 * field update as any other, because a second mutation onto the same column would eventually
 * disagree with the first.
 */
export function useAssetPurchaseCandidates(assetId: number | null) {
  return useQuery({
    queryKey: [QUERY_KEY.ASSET_PURCHASE_CANDIDATES, assetId],
    queryFn: () => fetchAssetPurchaseCandidates(assetId as number),
    enabled: assetId !== null,
    staleTime: CACHE_TIME.TEN_MINUTES,
  });
}

// ============================================================
// Mutations
// ============================================================

export function useCreateFixedAsset() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: createFixedAssetRequest,
    onSuccess: () => invalidateQueryKeys(queryClient, AFFECTED_QUERY_KEYS),
  });
}

export function useUpdateFixedAsset() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateFixedAssetInput }) => updateFixedAssetRequest(id, data),
    onSuccess: () => invalidateQueryKeys(queryClient, AFFECTED_QUERY_KEYS),
  });
}

export function useDeleteFixedAsset() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: deleteFixedAssetRequest,
    onSuccess: () => invalidateQueryKeys(queryClient, AFFECTED_QUERY_KEYS),
  });
}
