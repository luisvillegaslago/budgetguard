/**
 * Unit Tests: useUrlParams hook
 * Tests URL query param management (set, delete, preserve existing params).
 */

import { act, renderHook } from '@testing-library/react';

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

import { useUrlParams } from '@/hooks/useUrlParams';

describe('useUrlParams', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParams = new URLSearchParams();
  });

  it('returns current searchParams and updateParams function', () => {
    const { result } = renderHook(() => useUrlParams('/test'));

    expect(result.current.searchParams).toBeDefined();
    expect(typeof result.current.updateParams).toBe('function');
  });

  it('sets a new param in the URL', () => {
    const { result } = renderHook(() => useUrlParams('/dashboard'));

    act(() => {
      result.current.updateParams({ month: '2025-06' });
    });

    expect(mockReplace).toHaveBeenCalledWith('/dashboard?month=2025-06', { scroll: false });
  });

  it('deletes a param when value is undefined', () => {
    mockSearchParams = new URLSearchParams('month=2025-06&type=expense');
    const { result } = renderHook(() => useUrlParams('/dashboard'));

    act(() => {
      result.current.updateParams({ type: undefined });
    });

    expect(mockReplace).toHaveBeenCalledWith('/dashboard?month=2025-06', { scroll: false });
  });

  it('preserves existing params when adding new ones', () => {
    mockSearchParams = new URLSearchParams('year=2025');
    const { result } = renderHook(() => useUrlParams('/fiscal'));

    act(() => {
      result.current.updateParams({ quarter: '2' });
    });

    expect(mockReplace).toHaveBeenCalledWith('/fiscal?year=2025&quarter=2', { scroll: false });
  });

  it('handles multiple updates at once', () => {
    const { result } = renderHook(() => useUrlParams('/fiscal'));

    act(() => {
      result.current.updateParams({ year: '2025', quarter: '3', view: 'annual' });
    });

    expect(mockReplace).toHaveBeenCalledWith('/fiscal?year=2025&quarter=3&view=annual', { scroll: false });
  });

  it('renders clean path when all params are removed', () => {
    mockSearchParams = new URLSearchParams('status=draft');
    const { result } = renderHook(() => useUrlParams('/invoices'));

    act(() => {
      result.current.updateParams({ status: undefined });
    });

    expect(mockReplace).toHaveBeenCalledWith('/invoices', { scroll: false });
  });

  it('overwrites existing param value', () => {
    mockSearchParams = new URLSearchParams('status=draft');
    const { result } = renderHook(() => useUrlParams('/invoices'));

    act(() => {
      result.current.updateParams({ status: 'paid' });
    });

    expect(mockReplace).toHaveBeenCalledWith('/invoices?status=paid', { scroll: false });
  });
});
