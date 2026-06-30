/**
 * Fiscal-year helpers for the Spanish Modelo 100.
 *
 * AEAT IRPF periods are calendar years in Spanish CIVIL time (Europe/Madrid),
 * not UTC. Crypto events are stored as UTC instants with a time-of-day, so a
 * disposal at e.g. 2025-01-01 00:30 Madrid is 2024-12-31 23:30 UTC; deriving
 * the year with getUTCFullYear() would file it in the wrong year. These
 * helpers resolve the year and the year boundaries in Madrid civil time.
 */

const MADRID_TZ = 'Europe/Madrid';

const madridYearFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MADRID_TZ,
  year: 'numeric',
});

/** Calendar year of an instant in Europe/Madrid civil time. */
export function fiscalYearOf(instant: Date | string): number {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  return Number(madridYearFormatter.format(date));
}

/**
 * UTC instant corresponding to 00:00:00 of 1 January `year` in Madrid.
 *
 * 1 January is always in winter (CET, UTC+1 — DST never applies on that date
 * in Spain), so Madrid midnight equals 23:00 UTC of 31 December the prior day.
 * Returned as a Date so callers can `.toISOString()` it for SQL range bounds.
 */
export function madridYearStartUtc(year: number): Date {
  return new Date(Date.UTC(year - 1, 11, 31, 23, 0, 0));
}
