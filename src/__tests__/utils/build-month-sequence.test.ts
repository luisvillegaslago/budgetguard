/**
 * Unit Tests: buildMonthSequence
 * Inclusive contiguous month ranges, year boundaries, inverted ranges and cap.
 */

import { buildMonthSequence } from '@/utils/helpers';

describe('buildMonthSequence', () => {
  it('returns the inclusive month range', () => {
    expect(buildMonthSequence('2025-01', '2025-03')).toEqual(['2025-01', '2025-02', '2025-03']);
  });

  it('spans across year boundaries', () => {
    expect(buildMonthSequence('2024-11', '2025-02')).toEqual(['2024-11', '2024-12', '2025-01', '2025-02']);
  });

  it('returns a single month when from equals to', () => {
    expect(buildMonthSequence('2025-05', '2025-05')).toEqual(['2025-05']);
  });

  it('returns [] for an inverted range', () => {
    expect(buildMonthSequence('2025-05', '2025-01')).toEqual([]);
  });

  it('honors the cap', () => {
    expect(buildMonthSequence('2000-01', '2100-01', 5)).toHaveLength(5);
  });
});
