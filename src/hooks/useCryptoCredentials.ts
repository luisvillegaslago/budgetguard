/**
 * TanStack Query hooks for the crypto exchange credentials API.
 *
 * - useCryptoCredentialStatus(exchange) — polls the connection status (cached 1 min)
 * - useConnectCryptoCredential() — POST /api/crypto/credentials
 * - useDisconnectCryptoCredential() — DELETE /api/crypto/credentials?exchange=…
 *
 * Errors are surfaced as i18n keys via useApiMutation's `errorMessage`.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINT,
  API_ERROR,
  CACHE_TIME,
  CRYPTO_EXCHANGE,
  type CryptoExchange,
  QUERY_KEY,
} from '@/constants/finance';
import { useApiMutation } from '@/hooks/useApiMutation';
import type { CreateCryptoCredentialInput } from '@/schemas/crypto';
import type { ApiResponse } from '@/types/finance';
import { extractApiErrorKey } from '@/utils/apiErrorHandler';
import { fetchApi } from '@/utils/fetchApi';

export interface CryptoCredentialPermissions {
  ipRestrict: boolean;
  enableReading: boolean;
  enableWithdrawals: boolean;
  enableInternalTransfer: boolean;
  enableMargin: boolean;
  enableFutures: boolean;
  enableSpotAndMarginTrading: boolean;
  enableVanillaOptions: boolean;
  permitsUniversalTransfer: boolean;
  createTime: number;
}

export interface CryptoCredentialStatus {
  exchange: CryptoExchange;
  connected: boolean;
  apiKeyLast4: string | null;
  permissions: CryptoCredentialPermissions | null;
  lastValidatedAt: string | null;
}

export interface CryptoCredential {
  credentialId: number;
  exchange: CryptoExchange;
  apiKeyLast4: string;
  permissions: CryptoCredentialPermissions;
  lastValidatedAt: string | null;
  isActive: boolean;
  createdAt: string;
}

// ============================================================
// Fetchers
// ============================================================

async function fetchStatus(exchange: CryptoExchange): Promise<CryptoCredentialStatus> {
  const response = await fetchApi(`${API_ENDPOINT.CRYPTO_CREDENTIALS_STATUS}?exchange=${exchange}`);
  if (!response.ok) throw new Error('Error loading crypto credentials status');
  const data: ApiResponse<CryptoCredentialStatus> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
  return data.data;
}

async function connectRequest(input: CreateCryptoCredentialInput): Promise<CryptoCredential> {
  const response = await fetchApi(API_ENDPOINT.CRYPTO_CREDENTIALS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.CREATE.CRYPTO_CREDENTIALS));
  }
  const data: ApiResponse<CryptoCredential> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
  return data.data;
}

async function disconnectRequest(exchange: CryptoExchange): Promise<void> {
  const response = await fetchApi(`${API_ENDPOINT.CRYPTO_CREDENTIALS}?exchange=${exchange}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.DELETE.CRYPTO_CREDENTIALS));
  }
}

// ============================================================
// Hooks
// ============================================================

export function useCryptoCredentialStatus(exchange: CryptoExchange = CRYPTO_EXCHANGE.BINANCE) {
  return useQuery({
    queryKey: [QUERY_KEY.CRYPTO_CREDENTIALS, exchange],
    queryFn: () => fetchStatus(exchange),
    staleTime: CACHE_TIME.ONE_MINUTE,
  });
}

export function useConnectCryptoCredential() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: connectRequest,
    onSuccess: (credential) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.CRYPTO_CREDENTIALS, credential.exchange] });
    },
  });
}

export function useDisconnectCryptoCredential() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: disconnectRequest,
    onSuccess: (_data, exchange) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.CRYPTO_CREDENTIALS, exchange] });
    },
  });
}
