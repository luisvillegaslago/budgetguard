/**
 * Repository for normalised TaxableEvents derived from BinanceRawEvents.
 *
 * Insert is idempotent by (RawEventID, Kind, Asset) — the same raw event can
 * be re-normalised any number of times without producing duplicates. This is
 * intentional: when we change classifier rules in Phase 4+ we'll want to
 * re-run the normaliser over historical data.
 */

import { type CryptoContraprestacion, type CryptoTaxableKind } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import { query } from './connection';

interface TaxableEventRow {
  EventID: string;
  RawEventID: string;
  Kind: string;
  OccurredAt: string;
  Asset: string;
  QuantityNative: string;
  CounterAsset: string | null;
  CounterQuantityNative: string | null;
  FeeAsset: string | null;
  FeeQuantityNative: string | null;
  UnitPriceEurCents: string;
  GrossValueEurCents: string;
  FeeEurCents: string;
  PriceSource: string;
  Contraprestacion: string | null;
}

export interface TaxableEvent {
  eventId: string;
  rawEventId: string;
  kind: CryptoTaxableKind;
  occurredAt: string;
  asset: string;
  quantityNative: string;
  counterAsset: string | null;
  counterQuantityNative: string | null;
  feeAsset: string | null;
  feeQuantityNative: string | null;
  unitPriceEurCents: number;
  grossValueEurCents: number;
  feeEurCents: number;
  priceSource: string;
  contraprestacion: CryptoContraprestacion | null;
}

export interface TaxableEventInput {
  rawEventId: number | string;
  kind: CryptoTaxableKind;
  occurredAt: Date;
  asset: string;
  quantityNative: string;
  counterAsset: string | null;
  counterQuantityNative: string | null;
  feeAsset: string | null;
  feeQuantityNative: string | null;
  unitPriceEurCents: number;
  grossValueEurCents: number;
  feeEurCents: number;
  priceSource: string;
  contraprestacion: CryptoContraprestacion | null;
}

function rowToEvent(row: TaxableEventRow): TaxableEvent {
  return {
    eventId: row.EventID,
    rawEventId: row.RawEventID,
    kind: row.Kind as CryptoTaxableKind,
    occurredAt: row.OccurredAt,
    asset: row.Asset,
    quantityNative: row.QuantityNative,
    counterAsset: row.CounterAsset,
    counterQuantityNative: row.CounterQuantityNative,
    feeAsset: row.FeeAsset,
    feeQuantityNative: row.FeeQuantityNative,
    unitPriceEurCents: Number(row.UnitPriceEurCents),
    grossValueEurCents: Number(row.GrossValueEurCents),
    feeEurCents: Number(row.FeeEurCents),
    priceSource: row.PriceSource,
    contraprestacion: row.Contraprestacion as CryptoContraprestacion | null,
  };
}

const COLUMNS = `"EventID"::text, "RawEventID"::text, "Kind", "OccurredAt", "Asset",
    "QuantityNative", "CounterAsset", "CounterQuantityNative",
    "FeeAsset", "FeeQuantityNative", "UnitPriceEurCents", "GrossValueEurCents",
    "FeeEurCents", "PriceSource", "Contraprestacion"`;

/**
 * Bulk insert with ON CONFLICT DO NOTHING. Returns the number of rows
 * actually inserted (excluding duplicates).
 */
export async function bulkInsertTaxableEventsForUser(userId: number, inputs: TaxableEventInput[]): Promise<number> {
  if (inputs.length === 0) return 0;

  const COLS_PER_ROW = 15;
  const placeholders = inputs
    .map((_, i) => {
      const base = i * COLS_PER_ROW + 1;
      return `(${Array.from({ length: COLS_PER_ROW }, (_, j) => `$${base + j}`).join(', ')})`;
    })
    .join(', ');

  const params = inputs.flatMap((input) => [
    userId,
    input.rawEventId,
    input.kind,
    input.occurredAt.toISOString(),
    input.asset,
    input.quantityNative,
    input.counterAsset,
    input.counterQuantityNative,
    input.feeAsset,
    input.feeQuantityNative,
    input.unitPriceEurCents,
    input.grossValueEurCents,
    input.feeEurCents,
    input.priceSource,
    input.contraprestacion,
  ]);

  const rows = await query<{ inserted: number }>(
    `WITH ins AS (
       INSERT INTO "TaxableEvents" (
         "UserID", "RawEventID", "Kind", "OccurredAt", "Asset",
         "QuantityNative", "CounterAsset", "CounterQuantityNative",
         "FeeAsset", "FeeQuantityNative",
         "UnitPriceEurCents", "GrossValueEurCents", "FeeEurCents",
         "PriceSource", "Contraprestacion"
       )
       VALUES ${placeholders}
       ON CONFLICT ("RawEventID", "Kind", "Asset") DO NOTHING
       RETURNING 1 AS inserted
     )
     SELECT COUNT(*)::int AS inserted FROM ins`,
    params,
  );

  return rows[0]?.inserted ?? 0;
}

/**
 * Raw events the normaliser hasn't processed yet — `NormalizedAt IS NULL`.
 * Once a raw is processed (even if it produced 0 legs, e.g. fiat_order),
 * it gets stamped with NormalizedAt so future runs skip it without
 * re-checking. Use markRawEventsNormalized after each batch.
 */
export async function listUnnormalisedRawEventsForUser(
  userId: number,
  limit: number,
): Promise<Array<{ rawEventId: string; eventType: string; occurredAt: string; rawPayload: Record<string, unknown> }>> {
  const rows = await query<{
    EventID: string;
    EventType: string;
    OccurredAt: string;
    RawPayload: Record<string, unknown>;
  }>(
    `SELECT "EventID"::text AS "EventID", "EventType", "OccurredAt", "RawPayload"
     FROM "BinanceRawEvents"
     WHERE "UserID" = $1 AND "NormalizedAt" IS NULL
     ORDER BY "OccurredAt" ASC
     LIMIT $2`,
    [userId, limit],
  );
  return rows.map((r) => ({
    rawEventId: r.EventID,
    eventType: r.EventType,
    occurredAt: r.OccurredAt,
    rawPayload: r.RawPayload,
  }));
}

/**
 * Stamp a batch of raw events as processed so they're skipped in future
 * normalize runs. Called after each batch regardless of whether legs were
 * produced — this way fiat_order (always 0 legs) and similar cases don't
 * re-process every sync.
 */
export async function markRawEventsNormalized(rawEventIds: string[]): Promise<void> {
  if (rawEventIds.length === 0) return;
  await query(
    `UPDATE "BinanceRawEvents"
     SET "NormalizedAt" = CURRENT_TIMESTAMP
     WHERE "EventID" = ANY($1::bigint[])`,
    [rawEventIds],
  );
}

export async function listTaxableEvents(filters: {
  kind?: CryptoTaxableKind;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}): Promise<{ events: TaxableEvent[]; total: number }> {
  const userId = await getUserIdOrThrow();
  const conditions = ['"UserID" = $1'];
  const params: unknown[] = [userId];
  let paramIdx = 2;

  if (filters.kind) {
    conditions.push(`"Kind" = $${paramIdx}`);
    params.push(filters.kind);
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
    query<TaxableEventRow>(
      `SELECT ${COLUMNS}
       FROM "TaxableEvents"
       WHERE ${where}
       ORDER BY "OccurredAt" DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, filters.limit, filters.offset],
    ),
    query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM "TaxableEvents" WHERE ${where}`, params),
  ]);

  return {
    events: eventRows.map(rowToEvent),
    total: countRows[0]?.total ?? 0,
  };
}

export async function countTaxableEventsForUser(): Promise<number> {
  const userId = await getUserIdOrThrow();
  const rows = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM "TaxableEvents" WHERE "UserID" = $1`,
    [userId],
  );
  return rows[0]?.total ?? 0;
}

/**
 * Number of raw events the normaliser hasn't stamped yet. Used by the sync
 * orchestrator to size the normalize sub-progress before it starts.
 */
export async function countUnnormalisedRawEventsForUser(userId: number): Promise<number> {
  const rows = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM "BinanceRawEvents"
     WHERE "UserID" = $1 AND "NormalizedAt" IS NULL`,
    [userId],
  );
  return rows[0]?.total ?? 0;
}
