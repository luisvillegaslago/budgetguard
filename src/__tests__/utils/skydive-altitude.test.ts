/**
 * Unit Tests: exit altitude is shown in both units
 *
 * The logbook was kept in metres for years — 1.144 of 1.174 jumps — and migration 006
 * converted those values to feet. Feet is now the stored unit, but a jump that was logged
 * as 4.000 m has to stay recognisable, so the display carries both and leads with metres.
 */

import { FEET_PER_METRE, feetToMetres, formatAltitude, metresToFeet } from '@/utils/skydiveAltitude';

describe('conversion', () => {
  it('uses the exact definition of the international foot', () => {
    // 0.3048 m exactly, so the factor is not an approximation to be tuned.
    expect(FEET_PER_METRE).toBeCloseTo(3.28084, 5);
  });

  it('converts the value migration 006 produces for the bulk-import constant', () => {
    // 991 jumps held exactly 4000 m; this is the number they became.
    expect(metresToFeet(4000)).toBe(13123);
    expect(feetToMetres(13123)).toBe(4000);
  });

  it('keeps the low-altitude hop-n-pop recognisable', () => {
    // 1.574 m at Skydive Dubai: genuinely low, not a data error.
    expect(metresToFeet(1574)).toBe(5164);
  });
});

describe('formatAltitude', () => {
  it('leads with metres and puts the stored feet in brackets', () => {
    // The two numbers group differently on purpose: Spanish does not separate a
    // four-digit number, so 4000 stays bare while 13123 becomes 13.123. That is the
    // locale's own rule, the same one formatCurrency follows — not a formatting bug
    // to be "fixed" by forcing useGrouping.
    expect(formatAltitude(13123, 'es')).toBe('4000 m (13.123 ft)');
  });

  it('groups digits per locale', () => {
    expect(formatAltitude(13123, 'en')).toBe('4,000 m (13,123 ft)');
  });

  it('renders a dash when no altitude was recorded', () => {
    expect(formatAltitude(null, 'es')).toBe('—');
  });

  it('prints the stored feet verbatim rather than a round-tripped value', () => {
    // Metres is derived and rounded; feet is the record and must survive untouched.
    expect(formatAltitude(12645, 'es')).toContain('12.645 ft');
  });
});
