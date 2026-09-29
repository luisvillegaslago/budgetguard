/**
 * Stable externalId builder shared by every CSV importer and by the Binance API
 * reward endpoints (Earn, staking), which return no id of their own.
 *
 * Each caller turns its source row(s) into a list of canonical string parts
 * and passes them here with a prefix that namespaces the id (so a CSV-derived
 * event never collides with an API-derived one). The parts are joined with
 * `||` and SHA-256 hashed; re-importing identical rows yields the same id, so
 * the UNIQUE(UserID, EventType, ExternalID) constraint makes imports idempotent.
 * The parts must come from the record itself, never from its position in a
 * file or a page, or an overlapping re-fetch gets a new id.
 *
 * The output shape is `${prefix}-${first16HexCharsOfSha256}`, which PostgreSQL
 * can reproduce with `prefix || '-' || left(encode(sha256(convert_to(
 * concat_ws('||', ...parts), 'UTF8')), 'hex'), 16)` as long as every part is
 * COALESCEd to '' (concat_ws skips NULLs, the join here does not). Binance CSV
 * passes a `csv-<op>` prefix (e.g. `csv-spot`) so its ids remain byte-identical
 * to the historical `csv-${op}-${hash}` format.
 */
import { createHash } from 'node:crypto';

export function hashRow(prefix: string, ...parts: string[]): string {
  const payload = parts.join('||');
  return `${prefix}-${createHash('sha256').update(payload).digest('hex').slice(0, 16)}`;
}
