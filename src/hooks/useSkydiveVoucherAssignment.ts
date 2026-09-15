/**
 * BudgetGuard Skydive Voucher Assignment Hook
 * Assigns several jumps or tunnel sessions to a voucher ("bono") in one request
 */

import { useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINT, API_ERROR, QUERY_KEY, SKYDIVE_ACTIVITY_TYPE } from '@/constants/finance';
import { useApiMutation } from '@/hooks/useApiMutation';
import type { AssignVoucherInput } from '@/schemas/skydive';
import type { ApiResponse } from '@/types/finance';
import type { AssignVoucherResult, SkydiveActivityType } from '@/types/skydive';
import { extractApiErrorKey } from '@/utils/apiErrorHandler';
import { fetchApi } from '@/utils/fetchApi';
import { invalidateQueryKeys } from '@/utils/queryInvalidation';

const ASSIGNMENT_TARGET = {
  [SKYDIVE_ACTIVITY_TYPE.JUMP]: {
    endpoint: API_ENDPOINT.SKYDIVE_JUMPS_ASSIGN_VOUCHER,
    queryKey: QUERY_KEY.SKYDIVE_JUMPS,
  },
  [SKYDIVE_ACTIVITY_TYPE.TUNNEL]: {
    endpoint: API_ENDPOINT.TUNNEL_SESSIONS_ASSIGN_VOUCHER,
    queryKey: QUERY_KEY.TUNNEL_SESSIONS,
  },
} as const;

export function useAssignSkydiveVoucher(activityType: SkydiveActivityType) {
  const queryClient = useQueryClient();
  const target = ASSIGNMENT_TARGET[activityType];

  return useApiMutation({
    mutationFn: async (input: AssignVoucherInput) => {
      const response = await fetchApi(target.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorData: ApiResponse<never> = await response.json();
        throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.UPDATE.SKYDIVE_VOUCHER_ASSIGNMENT));
      }

      const data: ApiResponse<AssignVoucherResult> = await response.json();
      if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
      return data.data;
    },
    onSuccess: () =>
      invalidateQueryKeys(queryClient, [
        target.queryKey,
        QUERY_KEY.SKYDIVE_STATS,
        QUERY_KEY.VOUCHERS,
        QUERY_KEY.TRANSACTIONS,
        QUERY_KEY.SUMMARY,
      ]),
  });
}
