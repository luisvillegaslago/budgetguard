/**
 * Bidirectional sync between URL query params and Zustand finance store.
 * - Mount: URL → Zustand (or defaults if no params)
 * - Zustand changes → URL update
 * - Browser back/forward → URL → Zustand
 *
 * Uses isSyncingRef to prevent infinite loops.
 */

import { useEffect, useRef } from 'react';
import {
  FILTER_TYPE,
  type FilterType,
  MONTH_FORMAT_REGEX,
  SUMMARY_GRANULARITY,
  type SummaryGranularity,
  YEAR_FORMAT_REGEX,
} from '@/constants/finance';
import { getStoredGranularity, useFinanceStore } from '@/stores/useFinanceStore';
import { getCurrentMonth } from '@/utils/helpers';
import { getCurrentYear } from '@/utils/summaryPeriod';
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
    const yearParam = searchParams.get('year');
    const viewParam = searchParams.get('view');

    const month = monthParam && MONTH_FORMAT_REGEX.test(monthParam) ? monthParam : getCurrentMonth();
    const type = typeParam && VALID_FILTER_TYPES.has(typeParam) ? (typeParam as FilterType) : FILTER_TYPE.ALL;
    const year = yearParam && YEAR_FORMAT_REGEX.test(yearParam) ? yearParam : getCurrentYear();
    // A URL that names a lens wins; one that says nothing falls back to the remembered
    // preference, instead of overwriting it with the monthly default on every visit.
    const granularity: SummaryGranularity =
      viewParam === null
        ? getStoredGranularity()
        : viewParam === SUMMARY_GRANULARITY.YEAR
          ? SUMMARY_GRANULARITY.YEAR
          : SUMMARY_GRANULARITY.MONTH;

    const store = useFinanceStore.getState();
    if (store.selectedMonth !== month) {
      store.setSelectedMonth(month);
    }
    if (store.filters.type !== type) {
      store.setFilters({ type });
    }
    // Granularity first: it seeds the year, so the URL's own year must win after it.
    if (store.summaryGranularity !== granularity) {
      store.setSummaryGranularity(granularity);
    }
    if (useFinanceStore.getState().selectedYear !== year) {
      store.setSelectedYear(year);
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
      const yearChanged = state.selectedYear !== prev.selectedYear;
      const granularityChanged = state.summaryGranularity !== prev.summaryGranularity;
      if (!monthChanged && !typeChanged && !yearChanged && !granularityChanged) return;

      isSyncingRef.current = true;

      const currentMonth = getCurrentMonth();
      const updates: Record<string, string | undefined> = {};

      if (monthChanged) {
        updates.month = state.selectedMonth === currentMonth ? undefined : state.selectedMonth;
      }
      if (typeChanged) {
        updates.type = state.filters.type === FILTER_TYPE.ALL ? undefined : state.filters.type;
      }
      if (yearChanged) {
        updates.year = state.selectedYear === getCurrentYear() ? undefined : state.selectedYear;
      }
      if (granularityChanged) {
        const isYear = state.summaryGranularity === SUMMARY_GRANULARITY.YEAR;
        updates.view = isYear ? SUMMARY_GRANULARITY.YEAR : undefined;
        // Leaving the yearly lens drops its year from the link too, so a shared URL
        // never carries a selection that is no longer on screen.
        if (!isYear) updates.year = undefined;
      }

      updateParams(updates);

      requestAnimationFrame(() => {
        isSyncingRef.current = false;
      });
    });

    return unsub;
  }, [updateParams]);
}
