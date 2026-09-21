/**
 * Unit Tests: useDashboardUrlSync hook
 * Tests bidirectional sync between URL params and Zustand finance store.
 */

import { renderHook } from '@testing-library/react';
import { FILTER_TYPE, SUMMARY_GRANULARITY, type SummaryGranularity } from '@/constants/finance';

const CURRENT_YEAR = String(new Date().getFullYear());

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

// Track store state and actions
const mockSetSelectedMonth = jest.fn();
const mockSetFilters = jest.fn();
const mockSetSelectedYear = jest.fn();
const mockSetSummaryGranularity = jest.fn();

function buildStoreState() {
  return {
    selectedMonth: '2025-01',
    selectedYear: CURRENT_YEAR,
    summaryGranularity: SUMMARY_GRANULARITY.MONTH as SummaryGranularity,
    filters: { type: FILTER_TYPE.ALL, categoryId: null },
    setSelectedMonth: mockSetSelectedMonth,
    setFilters: mockSetFilters,
    setSelectedYear: mockSetSelectedYear,
    setSummaryGranularity: mockSetSummaryGranularity,
  };
}

let mockStoreState = buildStoreState();

const subscribers: Array<(state: typeof mockStoreState, prev: typeof mockStoreState) => void> = [];

let storedGranularity: SummaryGranularity = SUMMARY_GRANULARITY.MONTH;

jest.mock('@/stores/useFinanceStore', () => ({
  getStoredGranularity: () => storedGranularity,
  useFinanceStore: {
    getState: () => mockStoreState,
    subscribe: (fn: (state: typeof mockStoreState, prev: typeof mockStoreState) => void) => {
      subscribers.push(fn);
      return () => {
        const idx = subscribers.indexOf(fn);
        if (idx >= 0) subscribers.splice(idx, 1);
      };
    },
  },
}));

jest.mock('@/utils/helpers', () => ({
  getCurrentMonth: () => '2025-01',
}));

import { useDashboardUrlSync } from '@/hooks/useDashboardUrlSync';

describe('useDashboardUrlSync', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSetSelectedMonth.mockClear();
    mockSetFilters.mockClear();
    mockSetSelectedYear.mockClear();
    mockSetSummaryGranularity.mockClear();
    mockSearchParams = new URLSearchParams();
    subscribers.length = 0;
    storedGranularity = SUMMARY_GRANULARITY.MONTH;
    mockStoreState = buildStoreState();
  });

  describe('URL → Zustand (on mount)', () => {
    it('sets month from URL param', () => {
      mockSearchParams = new URLSearchParams('month=2024-06');

      renderHook(() => useDashboardUrlSync());

      expect(mockSetSelectedMonth).toHaveBeenCalledWith('2024-06');
    });

    it('sets filter type from URL param', () => {
      mockSearchParams = new URLSearchParams('type=expense');

      renderHook(() => useDashboardUrlSync());

      expect(mockSetFilters).toHaveBeenCalledWith({ type: FILTER_TYPE.EXPENSE });
    });

    it('uses current month when no month param', () => {
      renderHook(() => useDashboardUrlSync());

      // Store already has '2025-01' (getCurrentMonth mock), no update needed
      expect(mockSetSelectedMonth).not.toHaveBeenCalled();
    });

    it('uses FILTER_TYPE.ALL when no type param', () => {
      renderHook(() => useDashboardUrlSync());

      // Store already has ALL, no update needed
      expect(mockSetFilters).not.toHaveBeenCalled();
    });

    it('ignores invalid month format', () => {
      mockSearchParams = new URLSearchParams('month=invalid');

      renderHook(() => useDashboardUrlSync());

      // Falls back to getCurrentMonth() which is '2025-01' — same as store, no call
      expect(mockSetSelectedMonth).not.toHaveBeenCalled();
    });

    it('ignores invalid filter type', () => {
      mockSearchParams = new URLSearchParams('type=bogus');

      renderHook(() => useDashboardUrlSync());

      // Falls back to ALL — same as store, no call
      expect(mockSetFilters).not.toHaveBeenCalled();
    });

    it('switches to the yearly lens with view=year', () => {
      mockSearchParams = new URLSearchParams('view=year');

      renderHook(() => useDashboardUrlSync());

      expect(mockSetSummaryGranularity).toHaveBeenCalledWith(SUMMARY_GRANULARITY.YEAR);
    });

    it('falls back to the remembered lens when the URL names none', () => {
      storedGranularity = SUMMARY_GRANULARITY.YEAR;

      renderHook(() => useDashboardUrlSync());

      expect(mockSetSummaryGranularity).toHaveBeenCalledWith(SUMMARY_GRANULARITY.YEAR);
    });

    it('does not overwrite the remembered lens with the monthly default', () => {
      // A bare /dashboard visit must leave the stored preference alone.
      renderHook(() => useDashboardUrlSync());

      expect(mockSetSummaryGranularity).not.toHaveBeenCalled();
    });

    it('lets an explicit view param override the remembered lens', () => {
      storedGranularity = SUMMARY_GRANULARITY.YEAR;
      mockStoreState.summaryGranularity = SUMMARY_GRANULARITY.YEAR;
      mockSearchParams = new URLSearchParams('view=month');

      renderHook(() => useDashboardUrlSync());

      expect(mockSetSummaryGranularity).toHaveBeenCalledWith(SUMMARY_GRANULARITY.MONTH);
    });

    it('stays on the monthly lens for an unknown view param', () => {
      mockSearchParams = new URLSearchParams('view=decade');

      renderHook(() => useDashboardUrlSync());

      expect(mockSetSummaryGranularity).not.toHaveBeenCalled();
    });

    it('sets the year from the URL param', () => {
      mockSearchParams = new URLSearchParams('view=year&year=2023');

      renderHook(() => useDashboardUrlSync());

      expect(mockSetSelectedYear).toHaveBeenCalledWith('2023');
    });

    it('ignores an invalid year format', () => {
      mockSearchParams = new URLSearchParams('year=20x3');

      renderHook(() => useDashboardUrlSync());

      // Falls back to the current year — same as the store, so no call
      expect(mockSetSelectedYear).not.toHaveBeenCalled();
    });

    it('validates month regex strictly', () => {
      mockSearchParams = new URLSearchParams('month=2025-1');

      renderHook(() => useDashboardUrlSync());

      // '2025-1' doesn't match /^\d{4}-\d{2}$/ → fallback to current month
      expect(mockSetSelectedMonth).not.toHaveBeenCalled();
    });
  });

  describe('Zustand → URL (on store change)', () => {
    it('registers a Zustand subscriber on mount', () => {
      renderHook(() => useDashboardUrlSync());

      expect(subscribers).toHaveLength(1);
    });

    it('unsubscribes on unmount', () => {
      const { unmount } = renderHook(() => useDashboardUrlSync());

      expect(subscribers).toHaveLength(1);
      unmount();
      expect(subscribers).toHaveLength(0);
    });
  });
});
