/**
 * BudgetGuard Transactions Hooks
 * TanStack Query hooks for transaction CRUD operations
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import type { CreateTransactionInput } from '@/schemas/transaction';
import type { ApiResponse, Transaction, TransactionType } from '@/types/finance';

interface TransactionsResponse {
  data: Transaction[];
  meta: { month: string; count: number };
}

interface TransactionFilters {
  type?: TransactionType;
  categoryId?: number;
}

async function fetchTransactions(month: string, filters?: TransactionFilters): Promise<TransactionsResponse> {
  const params = new URLSearchParams({ month });

  if (filters?.type) params.append('type', filters.type);
  if (filters?.categoryId) params.append('categoryId', String(filters.categoryId));

  const response = await fetch(`${API_ENDPOINT.TRANSACTIONS}?${params.toString()}`);

  if (!response.ok) {
    throw new Error('Error al cargar transacciones');
  }

  const data: ApiResponse<Transaction[]> & { meta?: TransactionsResponse['meta'] } = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return {
    data: data.data,
    meta: data.meta ?? { month, count: data.data.length },
  };
}

async function createTransactionRequest(input: CreateTransactionInput): Promise<Transaction> {
  const response = await fetch(API_ENDPOINT.TRANSACTIONS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(errorData.error ?? 'Error al crear transaccion');
  }

  const data: ApiResponse<Transaction> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

async function updateTransactionRequest(id: number, input: Partial<CreateTransactionInput>): Promise<Transaction> {
  const response = await fetch(`${API_ENDPOINT.TRANSACTIONS}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(errorData.error ?? 'Error al actualizar transaccion');
  }

  const data: ApiResponse<Transaction> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

async function deleteTransactionRequest(id: number): Promise<void> {
  const response = await fetch(`${API_ENDPOINT.TRANSACTIONS}/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(errorData.error ?? 'Error al eliminar transaccion');
  }
}

/**
 * Hook to fetch transactions for a specific month
 */
export function useTransactions(month: string, filters?: TransactionFilters) {
  return useQuery({
    queryKey: [QUERY_KEY.TRANSACTIONS, month, filters],
    queryFn: () => fetchTransactions(month, filters),
    staleTime: CACHE_TIME.TWO_MINUTES,
  });
}

/**
 * Hook to create a new transaction
 */
export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTransactionRequest,
    onSuccess: () => {
      // Invalidate all transaction and summary queries to refresh data
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRANSACTIONS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SUMMARY] });
    },
  });
}

/**
 * Hook to update an existing transaction
 */
export function useUpdateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateTransactionInput> }) =>
      updateTransactionRequest(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRANSACTIONS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SUMMARY] });
    },
  });
}

/**
 * Hook to delete a transaction
 */
export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTransactionRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRANSACTIONS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SUMMARY] });
    },
  });
}
