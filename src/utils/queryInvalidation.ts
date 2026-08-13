/**
 * BudgetGuard Query Invalidation Helper
 *
 * TanStack Query awaits any promise returned from a mutation's `onSuccess`/`onSettled`
 * callback before flipping `isPending` back to false. Fire-and-forget invalidations
 * therefore end the loading state while the refetch is still in flight, and the user
 * sees the idle button reappear on top of stale data for a few frames before the row
 * finally updates or disappears.
 *
 * Returning this promise keeps the spinner up until the refetched data has landed,
 * so the button goes straight from "loading" to the final state.
 */

import type { QueryClient, QueryKey } from '@tanstack/react-query';

/** A root query key (string constant) or a fully qualified compound key. */
type InvalidatableKey = string | QueryKey;

const toQueryKey = (key: InvalidatableKey): QueryKey => (Array.isArray(key) ? key : [key]);

/**
 * Invalidates every given query key and resolves once the active queries have
 * refetched. Always `return` (or `await`) it from a mutation callback.
 */
export async function invalidateQueryKeys(queryClient: QueryClient, keys: InvalidatableKey[]): Promise<void> {
  await Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: toQueryKey(key) })));
}
