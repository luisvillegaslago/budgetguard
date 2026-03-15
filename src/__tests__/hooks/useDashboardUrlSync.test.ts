/**
 * Unit Tests: useDashboardUrlSync hook
 * Tests bidirectional sync between URL params and Zustand finance store.
 */

import { renderHook } from '@testing-library/react';
import { FILTER_TYPE } from '@/constants/finance';

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

// Track store state and actions
const mockSetSelectedMonth = jest.fn();
const mockSetFilters = jest.fn();
let mockStoreState = {
  selectedMonth: '2025-01',
  filters: { type: FILTER_TYPE.ALL, categoryId: null },
  setSelectedMonth: mockSetSelectedMonth,
  setFilters: mockSetFilters,
};

const subscribers: Array<(state: typeof mockStoreState, prev: typeof mockStoreState) => void> = [];

jest.mock('@/stores/useFinanceStore', () => ({
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
    mockSearchParams = new URLSearchParams();
    subscribers.length = 0;
    mockStoreState = {
      selectedMonth: '2025-01',
      filters: { type: FILTER_TYPE.ALL, categoryId: null },
      setSelectedMonth: mockSetSelectedMonth,
      setFilters: mockSetFilters,
    };
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
