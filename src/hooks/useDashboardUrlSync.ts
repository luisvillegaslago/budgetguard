/**
 * Bidirectional sync between URL query params and Zustand finance store.
 * - Mount: URL → Zustand (or defaults if no params)
 * - Zustand changes → URL update
 * - Browser back/forward → URL → Zustand
 *
 * Uses isSyncingRef to prevent infinite loops.
 */

import { useEffect, useRef } from 'react';
import { FILTER_TYPE, type FilterType, MONTH_FORMAT_REGEX } from '@/constants/finance';
import { useFinanceStore } from '@/stores/useFinanceStore';
import { getCurrentMonth } from '@/utils/helpers';
import { useUrlParams } from './useUrlParams';

const VALID_FILTER_TYPES = new Set<string>([FILTER_TYPE.ALL, FILTER_TYPE.INCOME, FILTER_TYPE.EXPENSE]);

export function useDashboardUrlSync() {
  const { searchParams, updateParams } = useUrlParams('/dashboard');
  const isSyncingRef = useRef(false);

  // Mount + back/forward: URL → Zustand
  useEffect(() => {
    isSyncingRef.current = true;

    const monthParam = searchParams.get('month');
    const typeParam = searchParams.get('type');

    const month = monthParam && MONTH_FORMAT_REGEX.test(monthParam) ? monthParam : getCurrentMonth();
    const type = typeParam && VALID_FILTER_TYPES.has(typeParam) ? (typeParam as FilterType) : FILTER_TYPE.ALL;

    const store = useFinanceStore.getState();
    if (store.selectedMonth !== month) {
      store.setSelectedMonth(month);
    }
    if (store.filters.type !== type) {
      store.setFilters({ type });
    }

    // Defer clearing the flag so the subscription below skips this update
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  }, [searchParams]);

  // Zustand → URL
  useEffect(() => {
    const unsub = useFinanceStore.subscribe((state, prev) => {
      if (isSyncingRef.current) return;

      const monthChanged = state.selectedMonth !== prev.selectedMonth;
      const typeChanged = state.filters.type !== prev.filters.type;
      if (!monthChanged && !typeChanged) return;

      isSyncingRef.current = true;

      const currentMonth = getCurrentMonth();
      const updates: Record<string, string | undefined> = {};

      if (monthChanged) {
        updates.month = state.selectedMonth === currentMonth ? undefined : state.selectedMonth;
      }
      if (typeChanged) {
        updates.type = state.filters.type === FILTER_TYPE.ALL ? undefined : state.filters.type;
      }

      updateParams(updates);

      requestAnimationFrame(() => {
        isSyncingRef.current = false;
      });
    });

    return unsub;
  }, [updateParams]);
}
