/**
 * Unit Tests: sortByAccessor
 * Verifies numeric/string comparison, direction handling, empties-last, and immutability.
 */

import { SORT_DIRECTION } from '@/constants/finance';
import { sortByAccessor } from '@/utils/sort';

interface Row {
  title: string;
  amount: number;
  note?: string | null;
}

const rows: Row[] = [
  { title: 'Copas', amount: 1500 },
  { title: 'Restaurante', amount: 3000 },
  { title: 'ático', amount: 500 },
];

describe('sortByAccessor', () => {
  it('sorts numbers ascending', () => {
    const result = sortByAccessor(rows, (r) => r.amount, SORT_DIRECTION.ASC);
    expect(result.map((r) => r.amount)).toEqual([500, 1500, 3000]);
  });

  it('sorts numbers descending', () => {
    const result = sortByAccessor(rows, (r) => r.amount, SORT_DIRECTION.DESC);
    expect(result.map((r) => r.amount)).toEqual([3000, 1500, 500]);
  });

  it('sorts strings accent-insensitively (ascending)', () => {
    const result = sortByAccessor(rows, (r) => r.title, SORT_DIRECTION.ASC);
    expect(result.map((r) => r.title)).toEqual(['ático', 'Copas', 'Restaurante']);
  });

  it('orders numeric-looking strings naturally', () => {
    const data = [{ v: '10' }, { v: '2' }, { v: '1' }];
    const result = sortByAccessor(data, (d) => d.v, SORT_DIRECTION.ASC);
    expect(result.map((d) => d.v)).toEqual(['1', '2', '10']);
  });

  it('keeps nullish/empty values last in both directions', () => {
    const data: Row[] = [
      { title: 'b', amount: 0, note: 'x' },
      { title: 'a', amount: 0, note: null },
      { title: 'c', amount: 0, note: '' },
      { title: 'd', amount: 0, note: 'y' },
    ];
    const asc = sortByAccessor(data, (d) => d.note, SORT_DIRECTION.ASC);
    expect(asc.slice(0, 2).map((d) => d.note)).toEqual(['x', 'y']);
    expect(asc.slice(2).every((d) => d.note == null || d.note === '')).toBe(true);

    const desc = sortByAccessor(data, (d) => d.note, SORT_DIRECTION.DESC);
    expect(desc.slice(2).every((d) => d.note == null || d.note === '')).toBe(true);
  });

  it('does not mutate the source array', () => {
    const original = [...rows];
    sortByAccessor(rows, (r) => r.amount, SORT_DIRECTION.DESC);
    expect(rows).toEqual(original);
  });
});
