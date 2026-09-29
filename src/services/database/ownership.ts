/**
 * Ownership guard for ids a caller asks us to write
 *
 * Since migration 008 every foreign key between two user-owned tables includes "UserID", so
 * Postgres itself refuses a row that points at another user's category, company, voucher, group,
 * transaction or trip. It refuses it with a constraint violation, which would reach the client as
 * a 500 and tell a probing account that the id exists. This guard checks the same rule first, so
 * the request fails as a 404 before anything is written.
 *
 * A foreign id fails exactly like a missing one — NotFoundError with the resource's own
 * API_ERROR.NOT_FOUND key, which withApiHandler answers with a 404 — so a probe cannot tell
 * "exists but is not yours" from "does not exist".
 */

import { API_ERROR } from '@/constants/finance';
import { NotFoundError } from '@/utils/apiErrors';
import { query } from './connection';

/** One id, several ids, or nothing to check: null/undefined means the reference is absent or being cleared. */
export type OwnedIdInput = number | readonly number[] | null | undefined;

/** The references to verify, named after the column that holds them. */
export interface OwnedReferences {
  categoryId?: OwnedIdInput;
  companyId?: OwnedIdInput;
  voucherId?: OwnedIdInput;
  transactionGroupId?: OwnedIdInput;
  transactionId?: OwnedIdInput;
  tripId?: OwnedIdInput;
  fiscalDocumentId?: OwnedIdInput;
}

/**
 * Minimal structural client shared by the Neon and pg pool clients. Passing the client of an open
 * BEGIN runs the check inside that transaction; without one it goes through the pool.
 */
export interface OwnershipQueryClient {
  query: <T = unknown>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
}

interface OwnedTable {
  reference: keyof OwnedReferences;
  // Controlled constants (never user input), safe to interpolate into SQL.
  table: string;
  idColumn: string;
  notFoundKey: string;
}

// When several references fail at once, the first one in this list names the 404.
const OWNED_TABLES: readonly OwnedTable[] = [
  {
    reference: 'categoryId',
    table: '"Categories"',
    idColumn: '"CategoryID"',
    notFoundKey: API_ERROR.NOT_FOUND.CATEGORY,
  },
  { reference: 'companyId', table: '"Companies"', idColumn: '"CompanyID"', notFoundKey: API_ERROR.NOT_FOUND.COMPANY },
  { reference: 'voucherId', table: '"Vouchers"', idColumn: '"VoucherID"', notFoundKey: API_ERROR.NOT_FOUND.VOUCHER },
  {
    reference: 'transactionGroupId',
    table: '"TransactionGroups"',
    idColumn: '"TransactionGroupID"',
    notFoundKey: API_ERROR.NOT_FOUND.GROUP,
  },
  {
    reference: 'transactionId',
    table: '"Transactions"',
    idColumn: '"TransactionID"',
    notFoundKey: API_ERROR.NOT_FOUND.TRANSACTION,
  },
  { reference: 'tripId', table: '"Trips"', idColumn: '"TripID"', notFoundKey: API_ERROR.NOT_FOUND.TRIP },
  {
    reference: 'fiscalDocumentId',
    table: '"FiscalDocuments"',
    idColumn: '"DocumentID"',
    notFoundKey: API_ERROR.NOT_FOUND.DOCUMENT,
  },
];

/** One owned id, tagged with the position of the table check that returned it. */
interface OwnedRow {
  Check: number;
  Id: number;
}

function toIdList(input: OwnedIdInput): number[] {
  if (input === null || input === undefined) return [];
  return [...new Set(typeof input === 'number' ? [input] : input)];
}

/** One UNION ALL branch: the ids bound at `$index + 2` that the user bound at `$1` owns in that table. */
function ownedIdsBranch(owned: OwnedTable, index: number): string {
  return `SELECT ${index} AS "Check", ${owned.idColumn} AS "Id" FROM ${owned.table}
    WHERE ${owned.idColumn} = ANY($${index + 2}::int[]) AND "UserID" = $1`;
}

/**
 * Throw NotFoundError unless every referenced id exists and belongs to `userId`.
 *
 * All the tables are checked in a single round trip. References that are null, undefined or an
 * empty list are skipped, and when nothing is left to check no query is sent at all.
 *
 * @param userId - The caller, as returned by getUserIdOrThrow()
 * @param references - The ids about to be written, by column
 * @param client - The client of an open transaction, when the check must run inside it
 */
export async function assertOwnedReferences(
  userId: number,
  references: OwnedReferences,
  client?: OwnershipQueryClient,
): Promise<void> {
  const requested = OWNED_TABLES.map((owned) => ({ owned, ids: toIdList(references[owned.reference]) }));
  const checks = requested.filter((check) => check.ids.length > 0);
  if (checks.length === 0) return;

  // $1 is the user; each table binds its own id list as the next parameter.
  const sql = checks.map((check, index) => ownedIdsBranch(check.owned, index)).join('\n UNION ALL ');
  const params: unknown[] = [userId, ...checks.map((check) => check.ids)];

  const rows = client ? (await client.query<OwnedRow>(sql, params)).rows : await query<OwnedRow>(sql, params);

  // Fail closed: an id counts as owned only when the database returned it for this user.
  const owned = new Set(rows.map((row) => `${Number(row.Check)}:${Number(row.Id)}`));
  const failed = checks.find((check, index) => check.ids.some((id) => !owned.has(`${index}:${id}`)));
  if (failed) {
    throw new NotFoundError(
      failed.owned.notFoundKey,
      `${failed.owned.table} ${failed.ids.join(', ')}: not all owned by user ${userId}`,
    );
  }
}
