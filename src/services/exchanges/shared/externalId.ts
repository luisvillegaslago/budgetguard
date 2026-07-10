/**
 * Stable externalId builder shared by every CSV importer.
 *
 * Each importer turns its source row(s) into a list of canonical string parts
 * and passes them here with a prefix that namespaces the id (so a CSV-derived
 * event never collides with an API-derived one). The parts are joined with
 * `||` and SHA-256 hashed; re-importing identical rows yields the same id, so
 * the UNIQUE(UserID, EventType, ExternalID) constraint makes imports idempotent.
 *
 * The output shape is `${prefix}-${first16HexCharsOfSha256}`. Binance passes a
 * `csv-<op>` prefix (e.g. `csv-spot`) so its ids remain byte-identical to the
 * historical `csv-${op}-${hash}` format.
 */
import { createHash } from 'node:crypto';

export function hashRow(prefix: string, ...parts: string[]): string {
  const payload = parts.join('||');
  return `${prefix}-${createHash('sha256').update(payload).digest('hex').slice(0, 16)}`;
}
