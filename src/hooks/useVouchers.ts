/**
 * BudgetGuard Vouchers Hooks
 * TanStack Query hooks for voucher ("bono") CRUD operations.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINT, API_ERROR, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import { useApiMutation } from '@/hooks/useApiMutation';
import type { CreateVoucherInput, UpdateVoucherInput } from '@/schemas/voucher';
import type { ApiResponse, Transaction, Voucher } from '@/types/finance';
import { extractApiErrorKey } from '@/utils/apiErrorHandler';
import { fetchApi } from '@/utils/fetchApi';

export interface VoucherDetail {
  voucher: Voucher;
  consumptions: Transaction[];
}

async function fetchVouchers(): Promise<Voucher[]> {
  const response = await fetchApi(API_ENDPOINT.VOUCHERS);

  if (!response.ok) {
    throw new Error('Error al cargar bonos');
  }

  const data: ApiResponse<Voucher[]> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

async function fetchVoucher(id: number): Promise<VoucherDetail> {
  const response = await fetchApi(`${API_ENDPOINT.VOUCHERS}/${id}`);

  if (!response.ok) {
    throw new Error('Error al cargar bono');
  }

  const data: ApiResponse<VoucherDetail> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

async function createVoucherRequest(input: CreateVoucherInput): Promise<Voucher> {
  const response = await fetchApi(API_ENDPOINT.VOUCHERS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.CREATE.VOUCHER));
  }

  const data: ApiResponse<Voucher> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

async function updateVoucherRequest(id: number, input: UpdateVoucherInput): Promise<Voucher> {
  const response = await fetchApi(`${API_ENDPOINT.VOUCHERS}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.UPDATE.VOUCHER));
  }

  const data: ApiResponse<Voucher> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

async function deleteVoucherRequest(id: number): Promise<void> {
  const response = await fetchApi(`${API_ENDPOINT.VOUCHERS}/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.DELETE.VOUCHER));
  }
}

/**
 * Hook to fetch all vouchers with balance (global, not month-scoped)
 */
export function useVouchers() {
  return useQuery({
    queryKey: [QUERY_KEY.VOUCHERS],
    queryFn: fetchVouchers,
    staleTime: CACHE_TIME.TWO_MINUTES,
  });
}

/**
 * Hook to fetch a single voucher with its linked consumptions
 */
export function useVoucher(id: number | null) {
  return useQuery({
    queryKey: [QUERY_KEY.VOUCHERS, id],
    queryFn: () => fetchVoucher(id as number),
    enabled: id != null,
    staleTime: CACHE_TIME.TWO_MINUTES,
  });
}

/**
 * Hook to create a new voucher
 */
export function useCreateVoucher() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: createVoucherRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.VOUCHERS] });
    },
  });
}

/**
 * Hook to update an existing voucher
 */
export function useUpdateVoucher() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateVoucherInput }) => updateVoucherRequest(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.VOUCHERS] });
    },
  });
}

/**
 * Hook to delete a voucher
 */
export function useDeleteVoucher() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: deleteVoucherRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.VOUCHERS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRANSACTIONS] });
    },
  });
}
