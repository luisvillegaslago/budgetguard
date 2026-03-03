/**
 * BudgetGuard Categories Hook
 * TanStack Query hook for fetching categories
 */

import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINT, CACHE_TIME, FILTER_TYPE, QUERY_KEY, TRANSACTION_TYPE } from '@/constants/finance';
import type { ApiResponse, Category, TransactionType } from '@/types/finance';

async function fetchCategories(type?: TransactionType): Promise<Category[]> {
  const url = type ? `${API_ENDPOINT.CATEGORIES}?type=${type}` : API_ENDPOINT.CATEGORIES;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Error al cargar categorias');
  }

  const data: ApiResponse<Category[]> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

/**
 * Hook to fetch all categories
 */
export function useCategories(type?: TransactionType) {
  return useQuery({
    queryKey: [QUERY_KEY.CATEGORIES, type ?? FILTER_TYPE.ALL],
    queryFn: () => fetchCategories(type),
    staleTime: CACHE_TIME.TEN_MINUTES,
  });
}

/**
 * Hook to fetch only income categories
 */
export function useIncomeCategories() {
  return useCategories(TRANSACTION_TYPE.INCOME);
}

/**
 * Hook to fetch only expense categories
 */
export function useExpenseCategories() {
  return useCategories(TRANSACTION_TYPE.EXPENSE);
}
