/**
 * BudgetGuard Fiscal Report Hooks
 * TanStack Query hooks for fetching fiscal report data:
 * - useFiscalReport: Quarterly (Modelo 303 + Modelo 130)
 * - useAnnualFiscalReport: Annual (Modelo 390 + Modelo 100)
 */

import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import type { AnnualFiscalReport, ApiResponse, FiscalReport } from '@/types/finance';
import { fetchApi } from '@/utils/fetchApi';

async function fetchFiscalReport(year: number, quarter: number): Promise<FiscalReport> {
  const params = new URLSearchParams({ year: String(year), quarter: String(quarter) });
  const response = await fetchApi(`${API_ENDPOINT.FISCAL}?${params.toString()}`);

  if (!response.ok) {
    throw new Error('Error al cargar informe fiscal');
  }

  const data: ApiResponse<FiscalReport> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

async function fetchAnnualFiscalReport(year: number): Promise<AnnualFiscalReport> {
  const params = new URLSearchParams({ year: String(year) });
  const response = await fetchApi(`${API_ENDPOINT.FISCAL_ANNUAL}?${params.toString()}`);

  if (!response.ok) {
    throw new Error('Error al cargar informe fiscal anual');
  }

  const data: ApiResponse<AnnualFiscalReport> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Error desconocido');
  }

  return data.data;
}

/**
 * Hook to fetch fiscal report for a given year and quarter
 */
export function useFiscalReport(year: number, quarter: number) {
  return useQuery({
    queryKey: [QUERY_KEY.FISCAL_REPORT, year, quarter],
    queryFn: () => fetchFiscalReport(year, quarter),
    staleTime: CACHE_TIME.FIVE_MINUTES,
  });
}

/**
 * Hook to fetch annual fiscal report (Modelo 390 + Modelo 100)
 */
export function useAnnualFiscalReport(year: number) {
  return useQuery({
    queryKey: [QUERY_KEY.FISCAL_ANNUAL, year],
    queryFn: () => fetchAnnualFiscalReport(year),
    staleTime: CACHE_TIME.FIVE_MINUTES,
  });
}
