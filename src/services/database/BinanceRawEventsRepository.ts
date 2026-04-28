/**
 * Repository for raw Binance events ingested by the sync worker.
 *
 * Idempotent inserts via UNIQUE(UserID, EventType, ExternalID): re-running a
 * sync window inserts 0 duplicates. Bulk insert uses multi-row VALUES with
 * .flatMap() for params (project convention, see TransactionRepository).
 */

import { type CryptoEventType } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import { query } from './connection';

interface RawEventRow {
  EventID: string;
  UserID: number;
  EventType: string;
  ExternalID: string;
  OccurredAt: string;
  RawPayload: Record<string, unknown>;
  IngestedAt: string;
  JobID: number | null;
}

export interface BinanceRawEvent {
  eventId: string;
  eventType: CryptoEventType;
  externalId: string;
  occurredAt: string;
  rawPayload: Record<string, unknown>;
  ingestedAt: string;
  jobId: number | null;
}

export interface RawEventInput {
  eventType: CryptoEventType;
  externalId: string;
  occurredAt: Date;
  rawPayload: Record<string, unknown>;
}

function rowToEvent(row: RawEventRow): BinanceRawEvent {
  return {
    eventId: row.EventID,
    eventType: row.EventType as CryptoEventType,
    externalId: row.ExternalID,
    occurredAt: row.OccurredAt,
    rawPayload: row.RawPayload,
    ingestedAt: row.IngestedAt,
    jobId: row.JobID,
  };
}

/**
 * Bulk insert raw events for the authenticated user. Returns the number of
 * rows actually inserted (excluding duplicates skipped by ON CONFLICT).
 *
 * Uses a single multi-row INSERT — the largest payload of the sync worker.
 * Caller must batch upstream when input.length > 500 to keep parameter count
 * under PostgreSQL's 65k limit (5 cols/row × 500 = 2500 params).
 */
export async function bulkInsertRawEvents(inputs: RawEventInput[], jobId: number): Promise<number> {
  const userId = await getUserIdOrThrow();
  return bulkInsertRawEventsForUser(userId, inputs, jobId);
}

export async function bulkInsertRawEventsForUser(
  userId: number,
  inputs: RawEventInput[],
  jobId: number,
): Promise<number> {
  if (inputs.length === 0) return 0;

  const COLS_PER_ROW = 6;
  const placeholders = inputs
    .map((_, i) => {
      const base = i * COLS_PER_ROW + 1;
      return `($${base}, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
    })
    .join(', ');

  const params = inputs.flatMap((event) => [
    userId,
    event.eventType,
    event.externalId,
    event.occurredAt.toISOString(),
    JSON.stringify(event.rawPayload),
    jobId,
  ]);

  const rows = await query<{ inserted: number }>(
    `WITH ins AS (
       INSERT INTO "BinanceRawEvents"
         ("UserID", "EventType", "ExternalID", "OccurredAt", "RawPayload", "JobID")
       VALUES ${placeholders}
       ON CONFLICT ("UserID", "EventType", "ExternalID") DO NOTHING
       RETURNING 1 AS inserted
     )
     SELECT COUNT(*)::int AS inserted FROM ins`,
    params,
  );

  return rows[0]?.inserted ?? 0;
}

/**
 * Page of raw events for the authenticated user, optionally filtered by
 * EventType. Used by the /crypto/movimientos table in Phase 2.
 */
export async function listRawEvents(filters: {
  eventType?: CryptoEventType;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}): Promise<{ events: BinanceRawEvent[]; total: number }> {
  const userId = await getUserIdOrThrow();
  const conditions = ['"UserID" = $1'];
  const params: unknown[] = [userId];
  let paramIdx = 2;

  if (filters.eventType) {
    conditions.push(`"EventType" = $${paramIdx}`);
    params.push(filters.eventType);
    paramIdx++;
  }
  if (filters.from) {
    conditions.push(`"OccurredAt" >= $${paramIdx}`);
    params.push(filters.from.toISOString());
    paramIdx++;
  }
  if (filters.to) {
    conditions.push(`"OccurredAt" <= $${paramIdx}`);
    params.push(filters.to.toISOString());
    paramIdx++;
  }

  const where = conditions.join(' AND ');

  const [eventRows, countRows] = await Promise.all([
    query<RawEventRow>(
      `SELECT "EventID"::text, "UserID", "EventType", "ExternalID", "OccurredAt",
              "RawPayload", "IngestedAt", "JobID"
       FROM "BinanceRawEvents"
       WHERE ${where}
       ORDER BY "OccurredAt" DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, filters.limit, filters.offset],
    ),
    query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM "BinanceRawEvents" WHERE ${where}`, params),
  ]);

  return {
    events: eventRows.map(rowToEvent),
    total: countRows[0]?.total ?? 0,
  };
}

/**
 * Most recent OccurredAt for the user's raw events, used to compute the
 * starting point of an incremental sync (so we don't re-fetch already-ingested
 * windows).
 */
export async function getLastIngestedAt(eventType?: CryptoEventType): Promise<Date | null> {
  const userId = await getUserIdOrThrow();
  const params: unknown[] = [userId];
  let where = '"UserID" = $1';
  if (eventType) {
    where += ' AND "EventType" = $2';
    params.push(eventType);
  }

  const rows = await query<{ MaxOccurredAt: string | null }>(
    `SELECT MAX("OccurredAt") AS "MaxOccurredAt" FROM "BinanceRawEvents" WHERE ${where}`,
    params,
  );
  const max = rows[0]?.MaxOccurredAt;
  return max ? new Date(max) : null;
}

export async function countRawEventsForUser(): Promise<number> {
  const userId = await getUserIdOrThrow();
  const rows = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM "BinanceRawEvents" WHERE "UserID" = $1`,
    [userId],
  );
  return rows[0]?.total ?? 0;
}

/**
 * Returns the union of every asset/coin code already seen in the user's raw
 * events (across dividend, dust, deposit, withdraw, earn_*, staking_*).
 *
 * Used by the spot-trade discovery to seed candidate symbols with assets the
 * user has interacted with — even if they no longer hold a balance and the
 * coin was an obscure airdrop not on the top-altcoin fallback list.
 */
export async function listInteractedAssetsForUser(userId: number): Promise<string[]> {
  const rows = await query<{ asset: string | null }>(
    `SELECT DISTINCT asset FROM (
       -- dividend / earn_* / staking_interest store the asset under .asset
       SELECT "RawPayload"->>'asset' AS asset
         FROM "BinanceRawEvents"
         WHERE "UserID" = $1
           AND "EventType" IN ('dividend', 'earn_flex', 'earn_locked', 'staking_interest', 'eth_staking')
       UNION
       -- deposit / withdraw use .coin
       SELECT "RawPayload"->>'coin' AS asset
         FROM "BinanceRawEvents"
         WHERE "UserID" = $1
           AND "EventType" IN ('deposit', 'withdraw')
       UNION
       -- dust nests fromAsset inside .detail
       SELECT "RawPayload"->'detail'->>'fromAsset' AS asset
         FROM "BinanceRawEvents"
         WHERE "UserID" = $1 AND "EventType" = 'dust'
       UNION
       -- convert tradeFlow uses fromAsset/toAsset at the top level
       SELECT "RawPayload"->>'fromAsset' AS asset
         FROM "BinanceRawEvents"
         WHERE "UserID" = $1 AND "EventType" = 'convert'
       UNION
       SELECT "RawPayload"->>'toAsset' AS asset
         FROM "BinanceRawEvents"
         WHERE "UserID" = $1 AND "EventType" = 'convert'
     ) t
     WHERE asset IS NOT NULL AND asset != ''`,
    [userId],
  );
  return rows.map((r) => r.asset).filter((a): a is string => !!a);
}
