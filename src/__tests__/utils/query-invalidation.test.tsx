/**
 * Integration Tests: invalidateQueryKeys
 *
 * Guards the loading-state contract the whole app relies on: a mutation must stay
 * `isPending` until the queries it invalidates have refetched, so buttons never flash
 * back to their idle label while stale data is still on screen.
 */

import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { invalidateQueryKeys } from '@/utils/queryInvalidation';

const LIST_KEY = 'probe-list';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/**
 * Query function whose refetch stays in flight until the test releases it, so the
 * window between "mutation resolved" and "list refreshed" is observable.
 */
function createHeldList() {
  let items = ['a', 'b'];
  let release: ((value: string[]) => void) | null = null;
  let calls = 0;

  return {
    queryFn: () => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve(items);
      }
      return new Promise<string[]>((resolve) => {
        release = resolve;
      });
    },
    isRefetching: () => calls > 1,
    resolveWith: (next: string[]) => {
      items = next;
      release?.(next);
    },
  };
}

describe('invalidateQueryKeys', () => {
  it('keeps the mutation pending until the invalidated query has refetched', async () => {
    const list = createHeldList();

    function Probe() {
      const queryClient = useQueryClient();
      const { data } = useQuery({ queryKey: [LIST_KEY], queryFn: list.queryFn });
      const mutation = useMutation({
        mutationFn: async () => undefined,
        onSuccess: () => invalidateQueryKeys(queryClient, [LIST_KEY]),
      });

      return (
        <div>
          <span data-testid="items">{(data ?? []).join(',')}</span>
          <button type="button" onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'loading' : 'skip'}
          </button>
        </div>
      );
    }

    const Wrapper = createWrapper();
    render(<Probe />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('items')).toHaveTextContent('a,b'));

    screen.getByText('skip').click();

    // The button must stay in its loading state while the refetch is still in flight
    await waitFor(() => expect(screen.getByText('loading')).toBeInTheDocument());
    expect(screen.getByTestId('items')).toHaveTextContent('a,b');

    list.resolveWith(['b']);

    await waitFor(() => expect(screen.getByText('skip')).toBeInTheDocument());
    // Fresh data is already on screen the moment the loading state ends
    expect(screen.getByTestId('items')).toHaveTextContent('b');
  });

  it('still runs the per-call onSuccess callback when the refetch unmounts the caller', async () => {
    const list = createHeldList();
    const onSuccess = jest.fn();

    function Probe() {
      const queryClient = useQueryClient();
      const { data } = useQuery({ queryKey: [LIST_KEY], queryFn: list.queryFn });
      const mutation = useMutation({
        mutationFn: async () => undefined,
        onSuccess: () => invalidateQueryKeys(queryClient, [LIST_KEY]),
      });

      return (
        <ul>
          {(data ?? []).map((item) => (
            <li key={item}>
              {item}
              {item === 'a' && (
                <button type="button" onClick={() => mutation.mutate(undefined, { onSuccess })}>
                  skip
                </button>
              )}
            </li>
          ))}
        </ul>
      );
    }

    const Wrapper = createWrapper();
    render(<Probe />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('skip')).toBeInTheDocument());

    // The refetch drops the row owning the button, unmounting the mutation observer
    screen.getByText('skip').click();
    await waitFor(() => expect(list.isRefetching()).toBe(true));
    list.resolveWith(['b']);

    await waitFor(() => expect(screen.queryByText('skip')).not.toBeInTheDocument());
    // Toasts live in these callbacks, so losing them would silently kill user feedback
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
