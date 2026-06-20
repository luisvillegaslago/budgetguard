/**
 * BudgetGuard Sorting Utilities
 * Reusable, type-safe comparators for sortable lists and tables.
 * Keeps sorting logic in one place so every table/popup behaves consistently.
 */

import { SORT_DIRECTION, type SortDirection } from '@/constants/finance';

/** Primitive values a sort accessor may return. */
export type SortValue = string | number | null | undefined;

/** True when a value should be treated as "empty" and pushed to the end. */
function isNil(value: SortValue): boolean {
  return value == null || value === '';
}

/**
 * Compare two non-nullish sort values.
 * Numbers compare numerically; everything else compares as locale-aware strings
 * (numeric + accent-insensitive) so "10" sorts after "2" and "á" next to "a".
 */
function compareNonNil(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Return a new array sorted by the value the accessor returns for each item.
 * Nullish/empty values always sort last, regardless of direction. Stable sort.
 */
export function sortByAccessor<T>(
  items: readonly T[],
  accessor: (item: T) => SortValue,
  direction: SortDirection,
): T[] {
  const sign = direction === SORT_DIRECTION.DESC ? -1 : 1;
  return [...items].sort((a, b) => {
    const av = accessor(a);
    const bv = accessor(b);
    const aNil = isNil(av);
    const bNil = isNil(bv);
    if (aNil || bNil) {
      if (aNil && bNil) return 0;
      return aNil ? 1 : -1; // empties last in both directions
    }
    return sign * compareNonNil(av as string | number, bv as string | number);
  });
}
