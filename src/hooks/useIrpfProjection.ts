/**
 * BudgetGuard IRPF Projection Hook
 * TanStack Query hook for the IRPF provision projection (Modelo 130 vs. annual Renta)
 */

import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import type { ApiResponse, IrpfProjection } from '@/types/finance';
import { fetchApi } from '@/utils/fetchApi';
import { centsToEuros } from '@/utils/money';

async function fetchIrpfProjection(year: number, projectedIncomeCents: number | null): Promise<IrpfProjection> {
  const params = new URLSearchParams({ year: String(year) });
  // The API takes the override in euros; cents stay the internal representation.
  if (projectedIncomeCents !== null) params.set('projectedIncome', String(centsToEuros(projectedIncomeCents)));

  const response = await fetchApi(`${API_ENDPOINT.FISCAL_PROJECTION}?${params.toString()}`);

  if (!response.ok) {
    throw new Error('Error al cargar la provisión de IRPF');
  }

  const data: ApiResponse<IrpfProjection> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

/**
 * Hook to fetch the IRPF provision projection for a year
 *
 * @param year - Fiscal year
 * @param projectedIncomeCents - Manual override of the annual billing (null = run-rate projection)
 */
export function useIrpfProjection(year: number, projectedIncomeCents: number | null = null) {
  return useQuery({
    queryKey: [QUERY_KEY.IRPF_PROJECTION, year, projectedIncomeCents],
    queryFn: () => fetchIrpfProjection(year, projectedIncomeCents),
    staleTime: CACHE_TIME.FIVE_MINUTES,
  });
}
