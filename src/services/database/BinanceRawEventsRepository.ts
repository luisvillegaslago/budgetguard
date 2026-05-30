/**
 * Repository for raw Binance events ingested by the sync worker.
 *
 * Idempotent inserts via UNIQUE(UserID, EventType, ExternalID): re-running a
 * sync window inserts 0 duplicates. Bulk insert uses multi-row VALUES with
 * .flatMap() for params (project convention, see TransactionRepository).
 */

import { type CryptoEventType } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import { splitSymbol } from '@/utils/cryptoSymbol';
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
 * Page of events for the authenticated user, optionally filtered by EventType,
 * date range and asset. Used by the /crypto movements table.
 *
 * Spot trades are collapsed into one logical row per Binance order (grouped by
 * symbol + orderId + side) so the user sees "Buy 0.03958 BTC @ avg price"
 * instead of one row per partial fill. Grouping happens in SQL so pagination
 * and the total count stay correct across pages. Rows without an orderId fall
 * back to grouping by their own EventID, i.e. they stay ungrouped.
 *
 * The asset filter matches the coin across every payload shape (spot symbol
 * prefix/suffix, .asset, .coin, convert from/to, dust detail, card purchase).
 */
export async function listRawEvents(filters: {
  eventType?: CryptoEventType;
  from?: Date;
  to?: Date;
  asset?: string;
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
  if (filters.asset) {
    const a = `$${paramIdx}`;
    conditions.push(
      `(("EventType" = 'spot_trade' AND ("RawPayload"->>'symbol' LIKE ${a} || '%' OR "RawPayload"->>'symbol' LIKE '%' || ${a}))
        OR "RawPayload"->>'asset' = ${a}
        OR "RawPayload"->>'coin' = ${a}
        OR "RawPayload"->>'fromAsset' = ${a}
        OR "RawPayload"->>'toAsset' = ${a}
        OR "RawPayload"->>'cryptoCurrency' = ${a}
        OR "RawPayload"->'detail'->>'fromAsset' = ${a}
        OR "RawPayload"->'detail'->>'targetAsset' = ${a})`,
    );
    params.push(filters.asset);
    paramIdx++;
  }

  const where = conditions.join(' AND ');

  // CTE shared by the data and count queries: spot fills collapsed per order,
  // every other event passed through unchanged, then merged into one stream.
  const cte = `
    WITH base AS (
      SELECT "EventID", "UserID", "EventType", "ExternalID", "OccurredAt", "RawPayload", "IngestedAt", "JobID"
      FROM "BinanceRawEvents"
      WHERE ${where}
    ),
    spot_grouped AS (
      SELECT
        MIN("EventID"::bigint)::text AS "EventID",
        MIN("UserID") AS "UserID",
        'spot_trade'::text AS "EventType",
        (MAX("RawPayload"->>'symbol') || '-' || COALESCE(MAX("RawPayload"->>'orderId'), '')) AS "ExternalID",
        MAX("OccurredAt") AS "OccurredAt",
        jsonb_build_object(
          'symbol', MAX("RawPayload"->>'symbol'),
          'orderId', MAX("RawPayload"->>'orderId'),
          'isBuyer', bool_or(("RawPayload"->>'isBuyer')::boolean),
          'qty', SUM(("RawPayload"->>'qty')::numeric)::text,
          'quoteQty', SUM(("RawPayload"->>'quoteQty')::numeric)::text,
          'fills', COUNT(*)
        ) AS "RawPayload",
        MAX("IngestedAt") AS "IngestedAt",
        NULL::int AS "JobID"
      FROM base
      WHERE "EventType" = 'spot_trade'
      GROUP BY
        "RawPayload"->>'symbol',
        COALESCE("RawPayload"->>'orderId', "EventID"::text),
        ("RawPayload"->>'isBuyer')::boolean
    ),
    others AS (
      SELECT "EventID"::text AS "EventID", "UserID", "EventType"::text AS "EventType",
             "ExternalID"::text AS "ExternalID", "OccurredAt", "RawPayload", "IngestedAt", "JobID"
      FROM base
      WHERE "EventType" <> 'spot_trade'
    ),
    unioned AS (
      SELECT * FROM spot_grouped
      UNION ALL
      SELECT * FROM others
    )`;

  const [eventRows, countRows] = await Promise.all([
    query<RawEventRow>(
      `${cte}
       SELECT "EventID", "UserID", "EventType", "ExternalID", "OccurredAt", "RawPayload", "IngestedAt", "JobID"
       FROM unioned
       ORDER BY "OccurredAt" DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, filters.limit, filters.offset],
    ),
    query<{ total: number }>(`${cte} SELECT COUNT(*)::int AS total FROM unioned`, params),
  ]);

  return {
    events: eventRows.map(rowToEvent),
    total: countRows[0]?.total ?? 0,
  };
}

/**
 * Distinct list of coins the user has interacted with, for the movements asset
 * filter. Combines direct asset/coin fields (via SQL) with the base/quote
 * assets parsed out of spot-trade symbols (via `splitSymbol`), deduped and
 * sorted alphabetically.
 */
export async function listUserAssets(): Promise<string[]> {
  const userId = await getUserIdOrThrow();
  const rows = await query<{ kind: 'asset' | 'symbol'; value: string | null }>(
    `SELECT DISTINCT 'asset' AS kind, val AS value FROM (
       SELECT "RawPayload"->>'asset' AS val FROM "BinanceRawEvents"
         WHERE "UserID" = $1 AND "EventType" IN ('dividend','earn_flex','earn_locked','staking_interest','eth_staking')
       UNION ALL SELECT "RawPayload"->>'coin' FROM "BinanceRawEvents"
         WHERE "UserID" = $1 AND "EventType" IN ('deposit','withdraw')
       UNION ALL SELECT "RawPayload"->'detail'->>'fromAsset' FROM "BinanceRawEvents"
         WHERE "UserID" = $1 AND "EventType" = 'dust'
       UNION ALL SELECT "RawPayload"->'detail'->>'targetAsset' FROM "BinanceRawEvents"
         WHERE "UserID" = $1 AND "EventType" = 'dust'
       UNION ALL SELECT "RawPayload"->>'fromAsset' FROM "BinanceRawEvents"
         WHERE "UserID" = $1 AND "EventType" = 'convert'
       UNION ALL SELECT "RawPayload"->>'toAsset' FROM "BinanceRawEvents"
         WHERE "UserID" = $1 AND "EventType" = 'convert'
       UNION ALL SELECT "RawPayload"->>'cryptoCurrency' FROM "BinanceRawEvents"
         WHERE "UserID" = $1 AND "EventType" = 'fiat_payment'
     ) direct
     UNION
     SELECT DISTINCT 'symbol' AS kind, "RawPayload"->>'symbol' AS value
       FROM "BinanceRawEvents" WHERE "UserID" = $1 AND "EventType" = 'spot_trade'`,
    [userId],
  );

  const assets = new Set<string>();
  rows.forEach((row) => {
    if (!row.value) return;
    if (row.kind === 'symbol') {
      const split = splitSymbol(row.value);
      if (split) {
        assets.add(split.base);
        assets.add(split.quote);
      } else {
        assets.add(row.value);
      }
    } else {
      assets.add(row.value);
    }
  });

  return Array.from(assets).sort((a, b) => a.localeCompare(b));
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
