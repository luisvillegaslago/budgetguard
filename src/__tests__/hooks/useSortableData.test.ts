/**
 * Unit Tests: useSortableData
 * Verifies toggle semantics (new key → asc, same key → flip) and sorted output.
 */

import { act, renderHook } from '@testing-library/react';
import { SORT_DIRECTION } from '@/constants/finance';
import { type SortableField, useSortableData } from '@/hooks/useSortableData';

interface Row {
  title: string;
  amount: number;
}

const items: Row[] = [
  { title: 'Copas', amount: 1500 },
  { title: 'Restaurante', amount: 3000 },
  { title: 'Otros', amount: 500 },
];

const fields: SortableField<Row>[] = [
  { key: 'title', accessor: (r) => r.title },
  { key: 'amount', accessor: (r) => r.amount },
];

describe('useSortableData', () => {
  it('returns items in original order when unsorted', () => {
    const { result } = renderHook(() => useSortableData(items, fields));
    expect(result.current.sort).toBeNull();
    expect(result.current.sorted.map((r) => r.amount)).toEqual([1500, 3000, 500]);
  });

  it('applies the initial sort', () => {
    const { result } = renderHook(() =>
      useSortableData(items, fields, { initial: { key: 'amount', direction: SORT_DIRECTION.ASC } }),
    );
    expect(result.current.sorted.map((r) => r.amount)).toEqual([500, 1500, 3000]);
  });

  it('toggleSort starts ascending for a new key', () => {
    const { result } = renderHook(() => useSortableData(items, fields));
    act(() => result.current.toggleSort('amount'));
    expect(result.current.sort).toEqual({ key: 'amount', direction: SORT_DIRECTION.ASC });
    expect(result.current.sorted.map((r) => r.amount)).toEqual([500, 1500, 3000]);
  });

  it('toggleSort flips direction for the same key', () => {
    const { result } = renderHook(() => useSortableData(items, fields));
    act(() => result.current.toggleSort('amount'));
    act(() => result.current.toggleSort('amount'));
    expect(result.current.sort).toEqual({ key: 'amount', direction: SORT_DIRECTION.DESC });
    expect(result.current.sorted.map((r) => r.amount)).toEqual([3000, 1500, 500]);
  });

  it('switching keys resets to ascending', () => {
    const { result } = renderHook(() => useSortableData(items, fields));
    act(() => result.current.toggleSort('amount'));
    act(() => result.current.toggleSort('amount')); // desc
    act(() => result.current.toggleSort('title'));
    expect(result.current.sort).toEqual({ key: 'title', direction: SORT_DIRECTION.ASC });
  });
});
