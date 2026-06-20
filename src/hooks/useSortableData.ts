'use client';

/**
 * BudgetGuard useSortableData
 * Generic, reusable client-side sorting state for any list or table.
 *
 * Provide the items plus a list of sortable fields (key + value accessor); the
 * hook returns the sorted array and helpers to toggle/set the active sort. Works
 * for both <table> headers (SortableHeader) and div/li lists (SortControl).
 */

import { useMemo, useState } from 'react';
import { SORT_DIRECTION, type SortDirection } from '@/constants/finance';
import { type SortValue, sortByAccessor } from '@/utils/sort';

/** A single sortable field definition. */
export interface SortableField<T> {
  /** Stable identifier for the field (used as the sort key). */
  key: string;
  /** Value extractor used for comparison. */
  accessor: (item: T) => SortValue;
}

/** Active sort state: which field and in which direction. */
export interface SortState {
  key: string;
  direction: SortDirection;
}

interface UseSortableDataOptions {
  /** Initial sort applied before the user interacts (null = original order). */
  initial?: SortState | null;
}

export interface UseSortableDataResult<T> {
  /** Items sorted according to the current sort state. */
  sorted: T[];
  /** Current sort state, or null when unsorted. */
  sort: SortState | null;
  /** Replace the sort state directly. */
  setSort: (sort: SortState | null) => void;
  /** Toggle sorting on a field: same key flips direction, new key starts ascending. */
  toggleSort: (key: string) => void;
}

export function useSortableData<T>(
  items: readonly T[],
  fields: readonly SortableField<T>[],
  options: UseSortableDataOptions = {},
): UseSortableDataResult<T> {
  const [sort, setSort] = useState<SortState | null>(options.initial ?? null);

  const sorted = useMemo(() => {
    if (!sort) return [...items];
    const field = fields.find((f) => f.key === sort.key);
    if (!field) return [...items];
    return sortByAccessor(items, field.accessor, sort.direction);
  }, [items, fields, sort]);

  const toggleSort = (key: string): void => {
    setSort((prev) => {
      if (prev?.key === key) {
        const direction = prev.direction === SORT_DIRECTION.ASC ? SORT_DIRECTION.DESC : SORT_DIRECTION.ASC;
        return { key, direction };
      }
      return { key, direction: SORT_DIRECTION.ASC };
    });
  };

  return { sorted, sort, setSort, toggleSort };
}
