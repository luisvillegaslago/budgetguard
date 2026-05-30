/**
 * Unit Tests: useFormattedSummaryTrends
 * Verifies cents→euros formatting and the running cumulative balance.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { MonthlySummaryTrends } from '@/types/finance';

jest.mock('@/utils/fetchApi', () => ({ fetchApi: jest.fn() }));

import { useFormattedSummaryTrends } from '@/hooks/useSummaryTrends';
import { fetchApi } from '@/utils/fetchApi';

const mockFetchApi = fetchApi as jest.MockedFunction<typeof fetchApi>;

const trends: MonthlySummaryTrends = {
  fromMonth: '2025-01',
  toMonth: '2025-03',
  points: [
    { month: '2025-01', incomeCents: 100000, expenseCents: 40000, balanceCents: 60000 },
    { month: '2025-02', incomeCents: 30000, expenseCents: 50000, balanceCents: -20000 },
    { month: '2025-03', incomeCents: 80000, expenseCents: 50000, balanceCents: 30000 },
  ],
};

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mockFetchApi.mockReset();
  mockFetchApi.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: trends }),
  } as unknown as Response);
});

describe('useFormattedSummaryTrends', () => {
  it('formats each point and accumulates the running balance', async () => {
    const { result } = renderHook(() => useFormattedSummaryTrends('2025-01', '2025-03'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const formatted = result.current.formatted;
    expect(formatted).not.toBeNull();
    expect(formatted?.points).toHaveLength(3);

    // Euro values are cents / 100
    expect(formatted?.points.map((p) => p.balanceValue)).toEqual([600, -200, 300]);

    // Cumulative balance is a running sum: 600, 400, 700
    expect(formatted?.points.map((p) => p.cumulativeBalanceValue)).toEqual([600, 400, 700]);
  });

  it('exposes formatted currency strings for income and expense', async () => {
    const { result } = renderHook(() => useFormattedSummaryTrends('2025-01', '2025-03'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const first = result.current.formatted?.points[0];
    expect(first?.income).toContain('€');
    expect(first?.expense).toContain('€');
  });
});
