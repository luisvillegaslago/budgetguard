/**
 * BudgetGuard Trips Hooks
 * TanStack Query hooks for trip CRUD operations
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import type { CreateTripInput, UpdateTripInput } from '@/schemas/trip';
import type { ApiResponse, Trip, TripDetail, TripDisplay } from '@/types/finance';
import { fetchApi } from '@/utils/fetchApi';

async function fetchTrips(): Promise<TripDisplay[]> {
  const response = await fetchApi(API_ENDPOINT.TRIPS);

  if (!response.ok) {
    throw new Error('Error al cargar viajes');
  }

  const data: ApiResponse<TripDisplay[]> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

async function fetchTrip(tripId: number): Promise<TripDetail> {
  const response = await fetchApi(`${API_ENDPOINT.TRIPS}/${tripId}`);

  if (!response.ok) {
    throw new Error('Error al cargar viaje');
  }

  const data: ApiResponse<TripDetail> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

async function createTripRequest(input: CreateTripInput): Promise<Trip> {
  const response = await fetchApi(API_ENDPOINT.TRIPS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(errorData.error ?? 'Error al crear viaje');
  }

  const data: ApiResponse<Trip> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

async function updateTripRequest(params: { tripId: number; data: UpdateTripInput }): Promise<Trip> {
  const response = await fetchApi(`${API_ENDPOINT.TRIPS}/${params.tripId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params.data),
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(errorData.error ?? 'Error al actualizar viaje');
  }

  const data: ApiResponse<Trip> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

async function deleteTripRequest(tripId: number): Promise<void> {
  const response = await fetchApi(`${API_ENDPOINT.TRIPS}/${tripId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(errorData.error ?? 'Error al eliminar viaje');
  }
}

/**
 * Hook to fetch all trips with summary data
 */
export function useTrips() {
  return useQuery({
    queryKey: [QUERY_KEY.TRIPS],
    queryFn: fetchTrips,
    staleTime: CACHE_TIME.TWO_MINUTES,
  });
}

/**
 * Hook to fetch a single trip with full details
 */
export function useTrip(tripId: number) {
  return useQuery({
    queryKey: [QUERY_KEY.TRIPS, tripId],
    queryFn: () => fetchTrip(tripId),
    staleTime: CACHE_TIME.TWO_MINUTES,
    enabled: tripId > 0,
  });
}

/**
 * Hook to create a new trip
 */
export function useCreateTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTripRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRIPS] });
    },
  });
}

/**
 * Hook to update an existing trip
 */
export function useUpdateTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateTripRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRIPS] });
    },
  });
}

/**
 * Hook to delete a trip and all its transactions
 */
export function useDeleteTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTripRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRIPS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRANSACTIONS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SUMMARY] });
    },
  });
}
