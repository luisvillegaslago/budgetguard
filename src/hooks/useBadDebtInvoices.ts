/**
 * BudgetGuard Bad Debt Hook (créditos incobrables, art. 80.Cuatro LIVA)
 *
 * One read-only query, and deliberately nothing else. The right this module measures is exercised
 * by issuing a factura rectificativa, remitting it to the client, uploading the evidence and filing
 * a modelo 952 — the app does none of that, so there is no mutation to expose. A hook called
 * `useRecoverBadDebtVat` would imply a button that cannot exist.
 *
 * It takes no year or quarter either. A window opens six months or a year after the devengo and
 * closes six months after that, so it crosses quarters and years by construction; scoping the query
 * to the period on screen would hide the invoice whose deadline is closest.
 *
 * The report carries its own `asOfDate`, computed on the server. Every date and every day count in
 * the UI is read from the payload rather than recomputed here, so the screen cannot end up showing
 * a countdown measured against a different day from the stage badge beside it.
 */

import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINT, API_ERROR, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import type { ApiResponse, BadDebtReport } from '@/types/finance';
import { fetchApi } from '@/utils/fetchApi';

async function fetchBadDebtReport(): Promise<BadDebtReport> {
  const response = await fetchApi(API_ENDPOINT.FISCAL_BAD_DEBT);

  if (!response.ok) throw new Error(API_ERROR.LOAD.BAD_DEBT);

  const data: ApiResponse<BadDebtReport> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? API_ERROR.LOAD.BAD_DEBT);

  return data.data;
}

/**
 * The whole clock: the invoices whose window is running and the ones the gate ruled out.
 *
 * Cached for a long while on purpose — the windows move by whole days, so a refetch on every focus
 * would buy nothing. It is not `Infinity` either: `asOfDate` comes from the server, and a tab left
 * open across midnight has to be able to catch up with the calendar.
 */
export function useBadDebtInvoices() {
  return useQuery({
    queryKey: [QUERY_KEY.BAD_DEBT_INVOICES],
    queryFn: fetchBadDebtReport,
    staleTime: CACHE_TIME.TEN_MINUTES,
  });
}
