/**
 * BudgetGuard Categories Hooks
 * TanStack Query hooks for fetching and mutating categories
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINT, CACHE_TIME, FILTER_TYPE, QUERY_KEY, TRANSACTION_TYPE } from '@/constants/finance';
import type { CreateCategoryInput, UpdateCategoryInput } from '@/schemas/transaction';
import type { ApiResponse, Category, TransactionType } from '@/types/finance';
import { fetchApi } from '@/utils/fetchApi';

async function fetchCategories(type?: TransactionType, hierarchical = false): Promise<Category[]> {
  const params = new URLSearchParams();
  if (type) params.append('type', type);
  if (hierarchical) params.append('hierarchical', 'true');

  const url = params.toString() ? `${API_ENDPOINT.CATEGORIES}?${params.toString()}` : API_ENDPOINT.CATEGORIES;
  const response = await fetchApi(url);

  if (!response.ok) {
    throw new Error('Error al cargar categorias');
  }

  const data: ApiResponse<Category[]> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

async function fetchAllCategories(type?: TransactionType, hierarchical = false): Promise<Category[]> {
  const params = new URLSearchParams();
  params.append('includeInactive', 'true');
  if (type) params.append('type', type);
  if (hierarchical) params.append('hierarchical', 'true');

  const url = `${API_ENDPOINT.CATEGORIES}?${params.toString()}`;
  const response = await fetchApi(url);

  if (!response.ok) {
    throw new Error('Error al cargar categorias');
  }

  const data: ApiResponse<Category[]> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

async function createCategoryRequest(input: CreateCategoryInput): Promise<Category> {
  const response = await fetchApi(API_ENDPOINT.CATEGORIES, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(errorData.error ?? 'Error al crear categoria');
  }

  const data: ApiResponse<Category> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

async function updateCategoryRequest(id: number, input: UpdateCategoryInput): Promise<Category> {
  const response = await fetchApi(`${API_ENDPOINT.CATEGORIES}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(errorData.error ?? 'Error al actualizar categoria');
  }

  const data: ApiResponse<Category> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

interface DeleteCategoryError {
  error: string;
  count?: number;
}

async function deleteCategoryRequest(id: number): Promise<void> {
  const response = await fetchApi(`${API_ENDPOINT.CATEGORIES}/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorData: DeleteCategoryError = await response.json();
    const error = new Error(errorData.error ?? 'Error al eliminar categoria');
    (error as Error & { count?: number }).count = errorData.count;
    throw error;
  }
}

/**
 * Hook to fetch all active categories
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

/**
 * Hook to fetch active categories as hierarchical tree
 */
export function useCategoriesHierarchical(type?: TransactionType) {
  return useQuery({
    queryKey: [QUERY_KEY.CATEGORIES, type ?? FILTER_TYPE.ALL, 'hierarchical'],
    queryFn: () => fetchCategories(type, true),
    staleTime: CACHE_TIME.TEN_MINUTES,
  });
}

/**
 * Hook to fetch ALL categories (including inactive) as hierarchical tree
 * Used in the category management panel
 */
export function useAllCategoriesHierarchical(type?: TransactionType) {
  return useQuery({
    queryKey: [QUERY_KEY.CATEGORIES, type ?? FILTER_TYPE.ALL, 'hierarchical', 'all'],
    queryFn: () => fetchAllCategories(type, true),
    staleTime: CACHE_TIME.TWO_MINUTES,
  });
}

/**
 * Hook to create a new category
 */
export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCategoryRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.CATEGORIES] });
    },
  });
}

/**
 * Hook to update an existing category
 */
export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateCategoryInput }) => updateCategoryRequest(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.CATEGORIES] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SUMMARY] });
    },
  });
}

/**
 * Hook to delete a category
 */
export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCategoryRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.CATEGORIES] });
    },
  });
}
