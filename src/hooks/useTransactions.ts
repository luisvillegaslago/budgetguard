/**
 * BudgetGuard Transactions Hooks
 * TanStack Query hooks for transaction CRUD operations
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY, SHARED_EXPENSE } from '@/constants/finance';
import type { CreateTransactionInput } from '@/schemas/transaction';
import type {
  ApiResponse,
  Transaction,
  TransactionGroupDisplay,
  TransactionType,
  TripGroupDisplay,
} from '@/types/finance';
import { fetchApi } from '@/utils/fetchApi';

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

  const response = await fetchApi(`${API_ENDPOINT.TRANSACTIONS}?${params.toString()}`);

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
  const response = await fetchApi(API_ENDPOINT.TRANSACTIONS, {
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
  const response = await fetchApi(`${API_ENDPOINT.TRANSACTIONS}/${id}`, {
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
  const response = await fetchApi(`${API_ENDPOINT.TRANSACTIONS}/${id}`, {
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

interface GroupedTransactionsResult {
  ungrouped: Transaction[];
  groups: TransactionGroupDisplay[];
  tripGroups: TripGroupDisplay[];
}

/**
 * Hook that wraps useTransactions and splits results into ungrouped + grouped
 * Client-side grouping via useMemo — acceptable for typical monthly volumes (50-200 transactions)
 */
export function useGroupedTransactions(month: string, filters?: TransactionFilters) {
  const query = useTransactions(month, filters);

  const grouped = useMemo((): GroupedTransactionsResult => {
    const transactions = query.data?.data ?? [];

    const ungrouped: Transaction[] = [];
    const groupMap = new Map<number, Transaction[]>();

    transactions.forEach((tx) => {
      if (tx.transactionGroupId) {
        const existing = groupMap.get(tx.transactionGroupId) ?? [];
        existing.push(tx);
        groupMap.set(tx.transactionGroupId, existing);
      } else {
        ungrouped.push(tx);
      }
    });

    const groups: TransactionGroupDisplay[] = [];

    groupMap.forEach((txs, groupId) => {
      // Single-transaction groups are treated as regular rows
      if (txs.length <= 1) {
        txs.forEach((tx) => {
          ungrouped.push(tx);
        });
        return;
      }

      const first = txs[0];
      if (!first) return;

      const totalAmountCents = txs.reduce((sum, tx) => sum + tx.amountCents, 0);
      const isShared = txs.some((tx) => tx.sharedDivisor > SHARED_EXPENSE.DEFAULT_DIVISOR);

      groups.push({
        transactionGroupId: groupId,
        description: first.description,
        transactionDate: first.transactionDate,
        parentCategoryName: first.parentCategory?.name ?? first.category?.name ?? '',
        parentCategoryIcon: first.parentCategory ? (first.category?.icon ?? null) : (first.category?.icon ?? null),
        parentCategoryColor: first.category?.color ?? null,
        totalAmountCents,
        isShared,
        type: first.type,
        transactions: txs,
      });
    });

    // Separate trip transactions from ungrouped
    const nonTrip: Transaction[] = [];
    const tripMap = new Map<number, Transaction[]>();

    ungrouped.forEach((tx) => {
      if (tx.tripId) {
        const existing = tripMap.get(tx.tripId) ?? [];
        existing.push(tx);
        tripMap.set(tx.tripId, existing);
      } else {
        nonTrip.push(tx);
      }
    });

    const tripGroups: TripGroupDisplay[] = [];

    tripMap.forEach((txs, tripId) => {
      // Single-transaction trips are treated as regular rows (consistent with group pattern)
      if (txs.length <= 1) {
        txs.forEach((tx) => {
          nonTrip.push(tx);
        });
        return;
      }

      const first = txs[0];
      if (!first) return;

      const totalAmountCents = txs.reduce((sum, tx) => sum + tx.amountCents, 0);
      const startDate = txs.reduce(
        (min, tx) => (tx.transactionDate < min ? tx.transactionDate : min),
        first.transactionDate,
      );

      // Sort trip expenses chronologically (oldest first)
      const sorted = [...txs].sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));

      tripGroups.push({
        tripId,
        tripName: first.tripName ?? `Trip #${tripId}`,
        startDate,
        totalAmountCents,
        type: first.type,
        transactions: sorted,
      });
    });

    return { ungrouped: nonTrip, groups, tripGroups };
  }, [query.data]);

  return { ...query, grouped };
}
