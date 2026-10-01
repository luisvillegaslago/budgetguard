/**
 * BudgetGuard Annual Fiscal Profile Hooks
 * TanStack Query hooks for the per-year fiscal profile: the pension plan contributions the
 * taxpayer declares once a year, which reduce the base of the annual Renta and never touch
 * Modelo 130, and the IVA a compensar carried into the year (casilla 110 of the first 303).
 *
 * Saving invalidates every model that reads the row, so the IRPF provision card and the 303/390
 * recompute as soon as the mutation settles.
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
      vatPoolOpeningCents,
    }: UpsertFiscalProfileVariables) => {
      // Only what the caller actually edits travels: an omitted field keeps its stored value,
      // so the pension card and the IVA card never overwrite each other's figures.
      const toEuros = (cents: number | undefined) => (cents === undefined ? undefined : centsToEuros(cents));

      const response = await fetchApi(API_ENDPOINT.FISCAL_PROFILE, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // The API takes the amounts in euros; cents stay the internal representation.
        body: JSON.stringify({
          fiscalYear,
          pensionIndividual: toEuros(pensionIndividualCents),
          pensionEmployment: toEuros(pensionEmploymentCents),
          vatPoolOpening: toEuros(vatPoolOpeningCents),
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
    // The projection reads the contributions and the 303/390 read the IVA pool: all must refetch.
    onSuccess: () =>
      invalidateQueryKeys(queryClient, [
        QUERY_KEY.FISCAL_PROFILE,
        QUERY_KEY.IRPF_PROJECTION,
        QUERY_KEY.FISCAL_REPORT,
        QUERY_KEY.FISCAL_ANNUAL,
      ]),
  });
}
