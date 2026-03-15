/**
 * BudgetGuard Trip Expenses Hooks
 * TanStack Query mutations for trip expense CRUD operations
 */

import { useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINT, API_ERROR, QUERY_KEY } from '@/constants/finance';
import { useApiMutation } from '@/hooks/useApiMutation';
import type { CreateTripExpenseInput, UpdateTripExpenseInput } from '@/schemas/trip';
import type { ApiResponse, Transaction } from '@/types/finance';
import { extractApiErrorKey } from '@/utils/apiErrorHandler';
import { fetchApi } from '@/utils/fetchApi';

async function createTripExpenseRequest(params: {
  tripId: number;
  data: CreateTripExpenseInput;
}): Promise<Transaction> {
  const response = await fetchApi(`${API_ENDPOINT.TRIPS}/${params.tripId}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params.data),
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.CREATE.TRIP_EXPENSE));
  }

  const data: ApiResponse<Transaction> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

async function updateTripExpenseRequest(params: {
  tripId: number;
  expenseId: number;
  data: UpdateTripExpenseInput;
}): Promise<Transaction> {
  const response = await fetchApi(`${API_ENDPOINT.TRIPS}/${params.tripId}/expenses/${params.expenseId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params.data),
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.UPDATE.TRIP_EXPENSE));
  }

  const data: ApiResponse<Transaction> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

async function deleteTripExpenseRequest(params: { tripId: number; expenseId: number }): Promise<void> {
  const response = await fetchApi(`${API_ENDPOINT.TRIPS}/${params.tripId}/expenses/${params.expenseId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.DELETE.TRIP_EXPENSE));
  }
}

/**
 * Hook to create a trip expense
 */
export function useCreateTripExpense(tripId: number) {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: (data: CreateTripExpenseInput) => createTripExpenseRequest({ tripId, data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRIPS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRIPS, tripId] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRANSACTIONS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SUMMARY] });
    },
  });
}

/**
 * Hook to update a trip expense
 */
export function useUpdateTripExpense(tripId: number) {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: (params: { expenseId: number; data: UpdateTripExpenseInput }) =>
      updateTripExpenseRequest({ tripId, ...params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRIPS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRIPS, tripId] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRANSACTIONS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SUMMARY] });
    },
  });
}

/**
 * Hook to delete a trip expense
 */
export function useDeleteTripExpense(tripId: number) {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: (expenseId: number) => deleteTripExpenseRequest({ tripId, expenseId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRIPS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRIPS, tripId] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRANSACTIONS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SUMMARY] });
    },
  });
}
