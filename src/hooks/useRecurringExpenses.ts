/**
 * BudgetGuard Recurring Expenses Hooks
 * TanStack Query hooks for recurring expense CRUD operations
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import type { CreateRecurringExpenseInput, UpdateRecurringExpenseInput } from '@/schemas/recurring-expense';
import type { ApiResponse, RecurringExpense } from '@/types/finance';
import { fetchApi } from '@/utils/fetchApi';

interface RecurringExpensesResponse {
  data: RecurringExpense[];
  meta: { count: number };
}

async function fetchRecurringExpenses(): Promise<RecurringExpensesResponse> {
  const response = await fetchApi(API_ENDPOINT.RECURRING_EXPENSES);

  if (!response.ok) {
    throw new Error('Error al cargar gastos recurrentes');
  }

  const data: ApiResponse<RecurringExpense[]> & { meta?: RecurringExpensesResponse['meta'] } = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return {
    data: data.data,
    meta: data.meta ?? { count: data.data.length },
  };
}

async function createRecurringExpenseRequest(input: CreateRecurringExpenseInput): Promise<RecurringExpense> {
  const response = await fetchApi(API_ENDPOINT.RECURRING_EXPENSES, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(errorData.error ?? 'Error al crear gasto recurrente');
  }

  const data: ApiResponse<RecurringExpense> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

async function updateRecurringExpenseRequest(
  id: number,
  input: UpdateRecurringExpenseInput,
): Promise<RecurringExpense> {
  const response = await fetchApi(`${API_ENDPOINT.RECURRING_EXPENSES}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(errorData.error ?? 'Error al actualizar gasto recurrente');
  }

  const data: ApiResponse<RecurringExpense> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

async function deleteRecurringExpenseRequest(id: number): Promise<void> {
  const response = await fetchApi(`${API_ENDPOINT.RECURRING_EXPENSES}/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(errorData.error ?? 'Error al eliminar gasto recurrente');
  }
}

/**
 * Hook to fetch all recurring expenses
 */
export function useRecurringExpenses() {
  return useQuery({
    queryKey: [QUERY_KEY.RECURRING_EXPENSES],
    queryFn: fetchRecurringExpenses,
    staleTime: CACHE_TIME.FIVE_MINUTES,
  });
}

/**
 * Hook to create a new recurring expense
 */
export function useCreateRecurringExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createRecurringExpenseRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.RECURRING_EXPENSES] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.PENDING_OCCURRENCES] });
    },
  });
}

/**
 * Hook to update an existing recurring expense
 */
export function useUpdateRecurringExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateRecurringExpenseInput }) =>
      updateRecurringExpenseRequest(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.RECURRING_EXPENSES] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.PENDING_OCCURRENCES] });
    },
  });
}

/**
 * Hook to delete (deactivate) a recurring expense
 */
export function useDeleteRecurringExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteRecurringExpenseRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.RECURRING_EXPENSES] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.PENDING_OCCURRENCES] });
    },
  });
}
