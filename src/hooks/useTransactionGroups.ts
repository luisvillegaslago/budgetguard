/**
 * BudgetGuard Transaction Groups Hooks
 * TanStack Query mutations for transaction group CRUD operations
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINT, QUERY_KEY } from '@/constants/finance';
import type { CreateTransactionGroupInput, UpdateTransactionGroupInput } from '@/schemas/transaction';
import type { ApiResponse, Transaction } from '@/types/finance';
import { fetchApi } from '@/utils/fetchApi';

async function createTransactionGroupRequest(input: CreateTransactionGroupInput): Promise<Transaction[]> {
  const response = await fetchApi(API_ENDPOINT.TRANSACTION_GROUPS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(errorData.error ?? 'Error al crear grupo de transacciones');
  }

  const data: ApiResponse<Transaction[]> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

async function deleteTransactionGroupRequest(groupId: number): Promise<void> {
  const response = await fetchApi(`${API_ENDPOINT.TRANSACTION_GROUPS}/${groupId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(errorData.error ?? 'Error al eliminar grupo');
  }
}

async function updateTransactionGroupRequest(params: {
  groupId: number;
  data: UpdateTransactionGroupInput;
}): Promise<Transaction[]> {
  const response = await fetchApi(`${API_ENDPOINT.TRANSACTION_GROUPS}/${params.groupId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params.data),
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(errorData.error ?? 'Error al actualizar grupo');
  }

  const data: ApiResponse<Transaction[]> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

/**
 * Hook to create a transaction group
 */
export function useCreateTransactionGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTransactionGroupRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRANSACTIONS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SUMMARY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SUBCATEGORY_SUMMARY] });
    },
  });
}

/**
 * Hook to delete a transaction group
 */
export function useDeleteTransactionGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTransactionGroupRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRANSACTIONS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SUMMARY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SUBCATEGORY_SUMMARY] });
    },
  });
}

/**
 * Hook to update a transaction group (description/date)
 */
export function useUpdateTransactionGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateTransactionGroupRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRANSACTIONS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SUMMARY] });
    },
  });
}
