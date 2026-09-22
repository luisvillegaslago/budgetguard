/**
 * BudgetGuard Skydive Altitude
 *
 * Exit altitude is stored in feet (DB column ExitAltitudeFt) and displayed in both units,
 * because the logbook was kept in metres for years: 1.144 of the 1.174 jumps were entered
 * that way while the form label said "(m)", and were converted to feet by migration 006.
 * Showing only feet would make every one of those jumps read as an unfamiliar number.
 */

/** Exact by definition: one international foot is 0.3048 m. */
export const FEET_PER_METRE = 1 / 0.3048;

export const feetToMetres = (feet: number): number => Math.round(feet / FEET_PER_METRE);

export const metresToFeet = (metres: number): number => Math.round(metres * FEET_PER_METRE);

/**
 * Both units, metres first: `4.000 m (13.123 ft)`.
 *
 * Feet is the stored value and is printed verbatim; metres is derived, so a round-trip
 * through this function is not lossless and is not meant to be — it is a reading aid.
 */
export function formatAltitude(feet: number | null, locale: string): string {
  if (feet === null) return '—';
  const metres = feetToMetres(feet);
  return `${metres.toLocaleString(locale)} m (${feet.toLocaleString(locale)} ft)`;
}
