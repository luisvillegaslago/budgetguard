/**
 * BudgetGuard Finance Store
 * Zustand store for UI state ONLY (not server data)
 *
 * Server data is managed by TanStack Query
 * This store handles: selected month, filters, modal states
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import {
  type AlertPanelId,
  FILTER_TYPE,
  type FilterType,
  STATUS_FILTER,
  type StatusFilter,
  SUMMARY_GRANULARITY,
  type SummaryGranularity,
  TREND_PERIOD,
  type TrendPeriod,
} from '@/constants/finance';
import { useIsLargeScreen } from '@/hooks/useMediaQuery';
import { addMonths, getCurrentMonth } from '@/utils/helpers';
import { getCurrentYear, resolvePeriod } from '@/utils/summaryPeriod';

interface FinanceFilters {
  type: FilterType;
  categoryId: number | null;
  status: StatusFilter;
}

interface FinanceUIState {
  // Selected month for viewing
  selectedMonth: string; // "2025-01"

  // Selected year for the yearly lens; independent of selectedMonth, so switching
  // lenses back and forth never rewrites the other selection
  selectedYear: string; // "2025"

  // Which lens the dashboard summary section is read through
  summaryGranularity: SummaryGranularity;

  // Transaction filters
  filters: FinanceFilters;

  // Collapsible panel states
  isPendingPanelCollapsed: boolean;
  isRecurringPanelCollapsed: boolean;
  isFiscalPanelCollapsed: boolean;

  // Alert panels hidden by the user. Deliberately NOT persisted: dismissing only
  // hides the alert for the current session, so it comes back on a page reload.
  dismissedAlerts: AlertPanelId[];

  // Sidebar state
  isSidebarOpen: boolean;

  // Movements page preferences
  groupByMonth: boolean;

  // Dashboard trend charts period (cash-flow + cumulative)
  trendPeriod: TrendPeriod;

  // Actions
  setSelectedMonth: (month: string) => void;
  setSelectedYear: (year: string) => void;
  setSummaryGranularity: (granularity: SummaryGranularity) => void;
  setTrendPeriod: (period: TrendPeriod) => void;
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
  goToCurrentMonth: () => void;
  goToPreviousYear: () => void;
  goToNextYear: () => void;
  goToCurrentYear: () => void;
  setFilters: (filters: Partial<FinanceFilters>) => void;
  resetFilters: () => void;
  togglePendingPanel: () => void;
  toggleRecurringPanel: () => void;
  toggleFiscalPanel: () => void;
  dismissAlert: (id: AlertPanelId) => void;
  toggleSidebar: () => void;
  toggleGroupByMonth: () => void;
}

const defaultFilters: FinanceFilters = {
  type: FILTER_TYPE.ALL,
  categoryId: null,
  status: STATUS_FILTER.ALL,
};

function getStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const stored = localStorage.getItem(key);
  return stored !== null ? stored === 'true' : fallback;
}

/**
 * The lens remembered from a previous visit. Read on demand (never at store creation)
 * so the server and the first client render always agree on the monthly default —
 * this one swaps the whole header control, so a hydration mismatch would be visible.
 */
export function getStoredGranularity(): SummaryGranularity {
  if (typeof window === 'undefined') return SUMMARY_GRANULARITY.MONTH;
  return localStorage.getItem('bg-summary-granularity') === SUMMARY_GRANULARITY.YEAR
    ? SUMMARY_GRANULARITY.YEAR
    : SUMMARY_GRANULARITY.MONTH;
}

export const useFinanceStore = create<FinanceUIState>((set, get) => ({
  selectedMonth: getCurrentMonth(),
  selectedYear: getCurrentYear(),
  summaryGranularity: SUMMARY_GRANULARITY.MONTH,
  filters: defaultFilters,
  isPendingPanelCollapsed: true,
  isRecurringPanelCollapsed: true,
  isFiscalPanelCollapsed: true,
  dismissedAlerts: [],
  isSidebarOpen: false,
  groupByMonth: getStoredBoolean('bg-group-by-month', true),
  trendPeriod: TREND_PERIOD.ONE_YEAR,

  setSelectedMonth: (month) => set({ selectedMonth: month }),
  setSelectedYear: (year) => set({ selectedYear: year }),

  // Switching to the yearly lens seeds the year from the month on screen, so the
  // jump lands where the user was looking instead of on the current year.
  setSummaryGranularity: (granularity) => {
    // Outside the updater: set() takes a pure function, and localStorage is absent server-side.
    if (typeof window !== 'undefined') {
      localStorage.setItem('bg-summary-granularity', granularity);
    }
    set((state) =>
      granularity === SUMMARY_GRANULARITY.YEAR
        ? { summaryGranularity: granularity, selectedYear: state.selectedMonth.slice(0, 4) }
        : { summaryGranularity: granularity },
    );
  },

  setTrendPeriod: (period) => set({ trendPeriod: period }),

  goToPreviousMonth: () => {
    const current = get().selectedMonth;
    set({ selectedMonth: addMonths(current, -1) });
  },

  goToNextMonth: () => {
    const current = get().selectedMonth;
    set({ selectedMonth: addMonths(current, 1) });
  },

  goToCurrentMonth: () => {
    set({ selectedMonth: getCurrentMonth() });
  },

  goToPreviousYear: () => {
    set({ selectedYear: String(Number(get().selectedYear) - 1) });
  },

  goToNextYear: () => {
    set({ selectedYear: String(Number(get().selectedYear) + 1) });
  },

  goToCurrentYear: () => {
    set({ selectedYear: getCurrentYear() });
  },

  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    }));
  },

  resetFilters: () => {
    set({ filters: defaultFilters });
  },

  togglePendingPanel: () => {
    set((state) => ({ isPendingPanelCollapsed: !state.isPendingPanelCollapsed }));
  },

  toggleRecurringPanel: () => {
    set((state) => ({ isRecurringPanelCollapsed: !state.isRecurringPanelCollapsed }));
  },

  toggleFiscalPanel: () => {
    set((state) => ({ isFiscalPanelCollapsed: !state.isFiscalPanelCollapsed }));
  },

  dismissAlert: (id) => {
    set((state) => (state.dismissedAlerts.includes(id) ? state : { dismissedAlerts: [...state.dismissedAlerts, id] }));
  },

  toggleSidebar: () => {
    set((state) => ({ isSidebarOpen: !state.isSidebarOpen }));
  },

  toggleGroupByMonth: () => {
    set((state) => {
      const next = !state.groupByMonth;
      localStorage.setItem('bg-group-by-month', String(next));
      return { groupByMonth: next };
    });
  },
}));

// Atomic selectors to prevent unnecessary re-renders
export const useSelectedMonth = () => useFinanceStore((s) => s.selectedMonth);
export const useSetSelectedMonth = () => useFinanceStore((s) => s.setSelectedMonth);

// useShallow required for selectors returning objects (Zustand 5.x)
export const useMonthNavigation = () =>
  useFinanceStore(
    useShallow((s) => ({
      goToPreviousMonth: s.goToPreviousMonth,
      goToNextMonth: s.goToNextMonth,
      goToCurrentMonth: s.goToCurrentMonth,
    })),
  );

export const useFilters = () => useFinanceStore(useShallow((s) => s.filters));
export const useSetFilters = () => useFinanceStore((s) => s.setFilters);
export const useResetFilters = () => useFinanceStore((s) => s.resetFilters);

export const useIsPendingPanelCollapsed = () => useFinanceStore((s) => s.isPendingPanelCollapsed);
export const useTogglePendingPanel = () => useFinanceStore((s) => s.togglePendingPanel);

export const useIsRecurringPanelCollapsed = () => useFinanceStore((s) => s.isRecurringPanelCollapsed);
export const useToggleRecurringPanel = () => useFinanceStore((s) => s.toggleRecurringPanel);

export const useIsFiscalPanelCollapsed = () => useFinanceStore((s) => s.isFiscalPanelCollapsed);
export const useToggleFiscalPanel = () => useFinanceStore((s) => s.toggleFiscalPanel);

export const useIsAlertDismissed = (id: AlertPanelId) => useFinanceStore((s) => s.dismissedAlerts.includes(id));
export const useDismissAlert = () => useFinanceStore((s) => s.dismissAlert);

export const useSidebarOpen = () => useFinanceStore((s) => s.isSidebarOpen);
export const useToggleSidebar = () => useFinanceStore((s) => s.toggleSidebar);

/**
 * Returns true when the sidebar should render as expanded:
 * - On xl+ screens (≥1280px): always expanded
 * - On smaller screens: follows the toggle state
 */
export const useSidebarExpanded = () => {
  const isSidebarOpen = useFinanceStore((s) => s.isSidebarOpen);
  const isLargeScreen = useIsLargeScreen();
  return isLargeScreen || isSidebarOpen;
};

export const useGroupByMonth = () => useFinanceStore((s) => s.groupByMonth);
export const useToggleGroupByMonth = () => useFinanceStore((s) => s.toggleGroupByMonth);

export const useSelectedYear = () => useFinanceStore((s) => s.selectedYear);
export const useSetSelectedYear = () => useFinanceStore((s) => s.setSelectedYear);

export const useYearNavigation = () =>
  useFinanceStore(
    useShallow((s) => ({
      goToPreviousYear: s.goToPreviousYear,
      goToNextYear: s.goToNextYear,
      goToCurrentYear: s.goToCurrentYear,
    })),
  );

export const useSummaryGranularity = () => useFinanceStore((s) => s.summaryGranularity);
export const useSetSummaryGranularity = () => useFinanceStore((s) => s.setSummaryGranularity);

/** The period the dashboard summary widgets read, resolved from the active lens. */
export const useSummaryPeriod = () => {
  const granularity = useFinanceStore((s) => s.summaryGranularity);
  const selectedMonth = useFinanceStore((s) => s.selectedMonth);
  const selectedYear = useFinanceStore((s) => s.selectedYear);
  return useMemo(
    () => resolvePeriod(granularity, selectedMonth, selectedYear),
    [granularity, selectedMonth, selectedYear],
  );
};

export const useTrendPeriod = () => useFinanceStore((s) => s.trendPeriod);
export const useSetTrendPeriod = () => useFinanceStore((s) => s.setTrendPeriod);
