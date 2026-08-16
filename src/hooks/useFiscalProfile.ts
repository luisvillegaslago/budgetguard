/**
 * BudgetGuard Annual Fiscal Profile Hooks
 * TanStack Query hooks for the per-year fiscal profile: the pension plan contributions the
 * taxpayer declares once a year, which reduce the base of the annual Renta and never touch
 * Modelo 130.
 *
 * Saving them invalidates the projection too, so the IRPF provision card recomputes with the
 * new reduction as soon as the mutation settles.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINT, API_ERROR, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import { useApiMutation } from '@/hooks/useApiMutation';
import type { ApiResponse, FiscalProfile, FiscalProfileInput } from '@/types/finance';
import { extractApiErrorKey } from '@/utils/apiErrorHandler';
import { fetchApi } from '@/utils/fetchApi';
import { centsToEuros } from '@/utils/money';
import { invalidateQueryKeys } from '@/utils/queryInvalidation';

/** The year identifies the row, so it travels with the amounts instead of being stored data. */
export type UpsertFiscalProfileVariables = FiscalProfileInput & { fiscalYear: number };

// ============================================================
// Fetch Functions
// ============================================================

async function fetchFiscalProfile(year: number): Promise<FiscalProfile> {
  const params = new URLSearchParams({ year: String(year) });
  const response = await fetchApi(`${API_ENDPOINT.FISCAL_PROFILE}?${params.toString()}`);
  if (!response.ok) throw new Error('Error loading the annual fiscal profile');
  const data: ApiResponse<FiscalProfile> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
  return data.data;
}

// ============================================================
// Queries
// ============================================================

/**
 * Annual fiscal profile for a year. A year that was never filled in comes back zeroed,
 * never missing, so the form always has something to seed itself with.
 */
export function useFiscalProfile(year: number) {
  return useQuery({
    queryKey: [QUERY_KEY.FISCAL_PROFILE, year],
    queryFn: () => fetchFiscalProfile(year),
    staleTime: CACHE_TIME.TEN_MINUTES,
  });
}

// ============================================================
// Mutations
// ============================================================

export function useUpsertFiscalProfile() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: async ({
      fiscalYear,
      pensionIndividualCents,
      pensionEmploymentCents,
    }: UpsertFiscalProfileVariables) => {
      const response = await fetchApi(API_ENDPOINT.FISCAL_PROFILE, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // The API takes the contributions in euros; cents stay the internal representation.
        body: JSON.stringify({
          fiscalYear,
          pensionIndividual: centsToEuros(pensionIndividualCents),
          pensionEmployment: centsToEuros(pensionEmploymentCents),
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(extractApiErrorKey(err as ApiResponse<never>, API_ERROR.MUTATION.UPDATE.FISCAL_PROFILE));
      }

      const data: ApiResponse<FiscalProfile> = await response.json();
      if (!data.success || !data.data) throw new Error(data.error ?? 'Fiscal profile update failed');
      return data.data;
    },
    // The projection reads the stored contributions, so it must refetch for the card to recompute.
    onSuccess: () => invalidateQueryKeys(queryClient, [QUERY_KEY.FISCAL_PROFILE, QUERY_KEY.IRPF_PROJECTION]),
  });
}
