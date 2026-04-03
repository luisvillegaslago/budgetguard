/**
 * BudgetGuard Finance Store
 * Zustand store for UI state ONLY (not server data)
 *
 * Server data is managed by TanStack Query
 * This store handles: selected month, filters, modal states
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { FILTER_TYPE, type FilterType, STATUS_FILTER, type StatusFilter } from '@/constants/finance';
import { useIsLargeScreen } from '@/hooks/useMediaQuery';
import { addMonths, getCurrentMonth } from '@/utils/helpers';

interface FinanceFilters {
  type: FilterType;
  categoryId: number | null;
  status: StatusFilter;
}

interface FinanceUIState {
  // Selected month for viewing
  selectedMonth: string; // "2025-01"

  // Transaction filters
  filters: FinanceFilters;

  // Collapsible panel states
  isPendingPanelCollapsed: boolean;
  isRecurringPanelCollapsed: boolean;
  isFiscalPanelCollapsed: boolean;

  // Sidebar state
  isSidebarOpen: boolean;

  // Movements page preferences
  groupByMonth: boolean;

  // Actions
  setSelectedMonth: (month: string) => void;
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
  goToCurrentMonth: () => void;
  setFilters: (filters: Partial<FinanceFilters>) => void;
  resetFilters: () => void;
  togglePendingPanel: () => void;
  toggleRecurringPanel: () => void;
  toggleFiscalPanel: () => void;
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

export const useFinanceStore = create<FinanceUIState>((set, get) => ({
  selectedMonth: getCurrentMonth(),
  filters: defaultFilters,
  isPendingPanelCollapsed: true,
  isRecurringPanelCollapsed: true,
  isFiscalPanelCollapsed: true,
  isSidebarOpen: false,
  groupByMonth: getStoredBoolean('bg-group-by-month', true),

  setSelectedMonth: (month) => set({ selectedMonth: month }),

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
