/**
 * Repository for the historical EUR price cache.
 *
 * Inmutable: once a (Asset, DateUtc) pair is resolved, the row is never
 * overwritten — re-runs of the normaliser hit the cache instead of asking
 * Binance/CoinGecko again. This keeps the chain of evidence stable for AEAT
 * audits and avoids price drift between sync runs.
 */

import { query } from './connection';

interface PriceRow {
  Asset: string;
  // The pg driver parses PostgreSQL DATE columns into JS Date objects by
  // default, but the @neondatabase/serverless driver returns them as strings.
  // Accept both shapes here so the repository works in both environments.
  DateUtc: string | Date;
  EurPriceCents: string;
  Source: string;
  ResolvedAt: string | Date;
}

export interface CachedPrice {
  asset: string;
  dateUtc: string; // YYYY-MM-DD
  eurPriceCents: number;
  source: string;
}

function toDateString(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function rowToPrice(row: PriceRow): CachedPrice {
  return {
    asset: row.Asset,
    dateUtc: toDateString(row.DateUtc),
    eurPriceCents: Number(row.EurPriceCents),
    source: row.Source,
  };
}

export async function getCachedPrice(asset: string, dateUtc: string): Promise<CachedPrice | null> {
  const rows = await query<PriceRow>(
    `SELECT "Asset", "DateUtc", "EurPriceCents", "Source", "ResolvedAt"
     FROM "CryptoPriceCache"
     WHERE "Asset" = $1 AND "DateUtc" = $2::date`,
    [asset, dateUtc],
  );
  return rows[0] ? rowToPrice(rows[0]) : null;
}

/**
 * Insert a price into the cache. Uses ON CONFLICT DO NOTHING so concurrent
 * inserts (two normaliser tasks racing for the same asset/date) never error.
 * The first writer wins; subsequent writes silently no-op.
 */
export async function putCachedPrice(input: CachedPrice): Promise<void> {
  await query(
    `INSERT INTO "CryptoPriceCache" ("Asset", "DateUtc", "EurPriceCents", "Source")
     VALUES ($1, $2::date, $3, $4)
     ON CONFLICT ("Asset", "DateUtc") DO NOTHING`,
    [input.asset, input.dateUtc, input.eurPriceCents, input.source],
  );
}
