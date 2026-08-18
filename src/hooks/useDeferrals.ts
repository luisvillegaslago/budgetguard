/**
 * BudgetGuard Deferral (aplazamiento/fraccionamiento) Hooks
 *
 * TanStack Query hooks for the AEAT resolution that grants a deferral and for the pending
 * movements it produces. The letter is read once by Claude Vision (`useExtractDeferral`), shown to
 * the human, and only then stored (`useCreateDeferral`) — nothing is written before that.
 *
 * **Amounts travel in CENTS here, unlike every other module.** Elsewhere a human types euros and
 * the route edge converts; this payload is a transcription of a printed table that is already whole
 * cents, and AEAT loads the rounding remainder onto the last fracción (781,66 ×5 then 781,69), so a
 * detour through euros would only invent a rounding step the document does not have.
 * See src/schemas/deferral.ts.
 *
 * **Dates travel as 'YYYY-MM-DD'.** `CreateDeferralSchema` coerces them server-side; sending a
 * `Date` would serialise an instant and put a vencimiento a day out for anyone west of UTC.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINT, API_ERROR, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import { useApiMutation } from '@/hooks/useApiMutation';
import type { CreateDeferralInput, DeferralFiltersInput, DeferralFraccionInput } from '@/schemas/deferral';
import type { ApiResponse, Deferral, DeferralFraccion, DeferralVerdict, ExtractedDeferralData } from '@/types/finance';
import { extractApiErrorKey } from '@/utils/apiErrorHandler';
import { fetchApi } from '@/utils/fetchApi';
import { invalidateQueryKeys } from '@/utils/queryInvalidation';

/**
 * Storing a resolution creates its fracciones as pending movements, so the movements list and the
 * summaries have to be refetched. The fiscal reports are deliberately absent: a pending movement is
 * excluded from every summary view and from the modelos until it is marked as paid.
 */
const AFFECTED_QUERY_KEYS = [QUERY_KEY.DEFERRALS, QUERY_KEY.TRANSACTIONS, QUERY_KEY.SUMMARY];

/** A calendar day on the wire, 'YYYY-MM-DD'. */
type WireDay = string;

/** One row of ANEXO I as it is sent: identical to the schema's, with the vencimiento as a day. */
export type CreateDeferralFraccionPayload = Omit<DeferralFraccionInput, 'dueDate'> & { dueDate: WireDay };

/** The body of `POST /api/fiscal/deferrals`: the header of the resolution plus every row of ANEXO I. */
export type CreateDeferralPayload = Omit<CreateDeferralInput, 'interestStartDate' | 'fracciones'> & {
  interestStartDate: WireDay;
  fracciones: CreateDeferralFraccionPayload[];
};

/**
 * What importing a resolution returns — the client-side mirror of `DeferralImportResult` in
 * src/services/DeferralImportService.ts. It is restated here rather than imported because that
 * module reaches the database, and nothing under hooks/ or components/ imports from services/.
 *
 * `movementCount` is what was actually written, not a client-side guess: fewer than three per
 * fracción whenever a part is zero, which is the normal case. `verdict` comes back with it because
 * the import does not refuse a letter over an interés that disagrees with its own days.
 */
export interface DeferralImportResponse {
  deferral: Deferral;
  /** ANEXO I as stored, in printed order */
  fracciones: DeferralFraccion[];
  verdict: DeferralVerdict;
  movementCount: number;
}

// ============================================================
// Fetch Functions
// ============================================================

function buildDeferralQuery(filters?: DeferralFiltersInput): string {
  const params = new URLSearchParams();
  if (filters?.year !== undefined) params.set('year', String(filters.year));
  if (filters?.modeloType !== undefined) params.set('modeloType', filters.modeloType);
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

async function fetchDeferrals(filters?: DeferralFiltersInput): Promise<Deferral[]> {
  const response = await fetchApi(`${API_ENDPOINT.DEFERRALS}${buildDeferralQuery(filters)}`);

  if (!response.ok) throw new Error(API_ERROR.LOAD.DEFERRALS);

  const data: ApiResponse<Deferral[]> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? API_ERROR.LOAD.DEFERRALS);

  return data.data;
}

/**
 * Read a resolution letter with Claude Vision. Read-only: it writes nothing to the database and
 * nothing to Blob storage, so a bad reading costs a retry and never a cleanup.
 */
async function extractDeferralRequest(file: File): Promise<ExtractedDeferralData> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetchApi(API_ENDPOINT.DEFERRALS_EXTRACT, { method: 'POST', body: formData });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.FISCAL.DEFERRAL_EXTRACTION_FAILED));
  }

  const data: ApiResponse<ExtractedDeferralData> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? API_ERROR.FISCAL.DEFERRAL_EXTRACTION_FAILED);

  return data.data;
}

async function createDeferralRequest(payload: CreateDeferralPayload): Promise<DeferralImportResponse> {
  const response = await fetchApi(API_ENDPOINT.DEFERRALS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.CREATE.DEFERRAL));
  }

  const data: ApiResponse<DeferralImportResponse> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? API_ERROR.MUTATION.CREATE.DEFERRAL);

  return data.data;
}

// ============================================================
// Queries
// ============================================================

/**
 * The resolutions already stored. The wizard uses it to recognise a letter that has been imported
 * before — the expediente is unique per user, so a second import is a duplicate, not a correction.
 */
export function useDeferrals(filters?: DeferralFiltersInput) {
  return useQuery({
    queryKey: [QUERY_KEY.DEFERRALS, filters?.year ?? null, filters?.modeloType ?? null],
    queryFn: () => fetchDeferrals(filters),
    staleTime: CACHE_TIME.TEN_MINUTES,
  });
}

// ============================================================
// Mutations
// ============================================================

/** Read the letter. Nothing is stored, so the cache is left alone on purpose. */
export function useExtractDeferral() {
  return useApiMutation({
    mutationFn: ({ file }: { file: File }) => extractDeferralRequest(file),
  });
}

/** Store the resolution and book its fracciones, split into principal / recargo / intereses. */
export function useCreateDeferral() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationFn: createDeferralRequest,
    onSuccess: () => invalidateQueryKeys(queryClient, AFFECTED_QUERY_KEYS),
  });
}
