/**
 * Unit Tests: useSyncExecute hook (SSE error feedback)
 * Verifies the hook surfaces a `phase: 'error'` SSE event into `error` state.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { useSyncExecute } from '@/hooks/useDbSync';

const mockFetchApi = jest.fn();
jest.mock('@/utils/fetchApi', () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
}));

function streamResponse(events: object[]): Response {
  const encoder = new TextEncoder();
  const chunks = events.map((e) => encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
  let i = 0;
  const body = {
    getReader: () => ({
      read: () =>
        i < chunks.length
          ? Promise.resolve({ done: false, value: chunks[i++] })
          : Promise.resolve({ done: true, value: undefined }),
    }),
  };
  return { ok: true, body } as unknown as Response;
}

describe('useSyncExecute - error feedback', () => {
  beforeEach(() => mockFetchApi.mockReset());

  it('surfaces a phase:error SSE event into error state', async () => {
    const dbMessage =
      'el nuevo registro para la relación «InvoiceLineItems» viola la restricción «check» «CK_LineItems_TitleOrDescription»';
    mockFetchApi.mockResolvedValue(
      streamResponse([
        { phase: 'sync', table: 'InvoiceLineItems', tableIndex: 5, tableCount: 10 },
        { phase: 'error', message: dbMessage },
      ]),
    );

    const { result } = renderHook(() => useSyncExecute());

    await act(async () => {
      await result.current.execute({ includeDeletes: false });
    });

    await waitFor(() => {
      expect(result.current.error).toBe(dbMessage);
    });
    expect(result.current.isExecuting).toBe(false);
    expect(result.current.result).toBeNull();
  });

  it('sets an error (not a hung spinner) when the stream ends without a terminal event', async () => {
    mockFetchApi.mockResolvedValue(
      streamResponse([{ phase: 'sync', table: 'InvoiceLineItems', tableIndex: 5, tableCount: 10 }]),
    );

    const { result } = renderHook(() => useSyncExecute());

    await act(async () => {
      await result.current.execute({ includeDeletes: false });
    });

    await waitFor(() => {
      expect(result.current.isExecuting).toBe(false);
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.result).toBeNull();
  });
});
