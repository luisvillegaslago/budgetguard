/**
 * BudgetGuard ID Selection Hook
 * Multi-row selection state for tables, keyed by numeric ID
 */

import { useCallback, useMemo, useState } from 'react';

export interface IdSelection {
  selectedIds: ReadonlySet<number>;
  isSelected: (id: number) => boolean;
  toggle: (id: number) => void;
  setMany: (ids: number[], selected: boolean) => void;
  replace: (ids: number[]) => void;
  clear: () => void;
}

export function useIdSelection(): IdSelection {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(() => new Set());

  const isSelected = useCallback((id: number) => selectedIds.has(id), [selectedIds]);

  const toggle = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const setMany = useCallback((ids: number[], selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => {
        if (selected) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return next;
    });
  }, []);

  const replace = useCallback((ids: number[]) => setSelectedIds(new Set(ids)), []);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  return useMemo(
    () => ({ selectedIds, isSelected, toggle, setMany, replace, clear }),
    [selectedIds, isSelected, toggle, setMany, replace, clear],
  );
}
