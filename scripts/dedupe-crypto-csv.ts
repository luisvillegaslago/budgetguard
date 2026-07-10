/**
 * Detect and remove crypto events imported BOTH via CSV and the Binance API.
 *
 * The CSV importer and the API sync assign different ExternalIDs to the same
 * real operation, so the UNIQUE(UserID, EventType, ExternalID) dedup misses
 * cross-source duplicates. This script finds CSV events that have an API twin
 * (same UserID + EventType + asset + amount + side + second) and deletes the
 * CSV copy — the API copy is authoritative (orderId, millisecond precision,
 * exact fills).
 *
 * Deleting a CryptoRawEvents row cascades to its TaxableEvents and
 * CryptoDisposals (ON DELETE CASCADE). After running with --execute you MUST
 * press "Recalcular FIFO" in the app (Crypto → Fiscal) to rebuild the disposals
 * from the remaining taxable events.
 *
 * Usage:
 *   DATABASE_URL=xxx npx tsx scripts/dedupe-crypto-csv.ts            # dry-run (default)
 *   DATABASE_URL=xxx npx tsx scripts/dedupe-crypto-csv.ts --execute  # actually delete
 */

import { Pool } from 'pg';

// CSV events that have an API twin: same UserID + EventType + asset + side, plus
// a per-type timestamp/amount match. Identity fields are coalesced across the
// per-EventType payload shapes (spot symbol, dividend/earn asset, deposit coin,
// convert fromAsset, dust detail.fromAsset).
//
// Timestamp granularity differs by source:
//   - most types share the exact second → match on the truncated second.
//   - deposit/withdraw differ by minutes/hours but land on the same UTC day,
//     so match on the date instead.
// Amount differs only for withdrawals, where the CSV stores the GROSS amount
// (API `amount` + `transactionFee`); we accept a match within the fee.
const DETECT_SQL = `
  WITH ev AS (
    SELECT "EventID", "UserID", "EventType", ("ExternalID" LIKE 'csv-%') AS is_csv,
      COALESCE("RawPayload"->>'symbol', "RawPayload"->>'asset', "RawPayload"->>'coin',
               "RawPayload"->>'fromAsset', "RawPayload"->'detail'->>'fromAsset') AS k_asset,
      COALESCE(("RawPayload"->>'qty')::numeric, ("RawPayload"->>'amount')::numeric,
               ("RawPayload"->>'fromAmount')::numeric, ("RawPayload"->'detail'->>'amount')::numeric) AS k_amount,
      COALESCE(("RawPayload"->>'transactionFee')::numeric, 0) AS k_fee,
      "RawPayload"->>'isBuyer' AS k_side,
      "OccurredAt" AS ts
    FROM "CryptoRawEvents"
  )
  SELECT DISTINCT csv."EventID"::text AS "EventID", csv."UserID", csv."EventType"
  FROM ev csv
  JOIN ev api
    ON api.is_csv = false
   AND api."UserID" = csv."UserID"
   AND api."EventType" = csv."EventType"
   AND api.k_asset IS NOT DISTINCT FROM csv.k_asset
   AND api.k_side IS NOT DISTINCT FROM csv.k_side
   AND (
     CASE WHEN csv."EventType" IN ('deposit', 'withdraw')
          THEN api.ts::date = csv.ts::date
          ELSE date_trunc('second', api.ts) = date_trunc('second', csv.ts) END
   )
   AND (
     api.k_amount IS NOT DISTINCT FROM csv.k_amount
     OR abs(csv.k_amount - api.k_amount) <= GREATEST(COALESCE(api.k_fee, 0), COALESCE(csv.k_fee, 0)) + 1e-12
   )
  WHERE csv.is_csv = true
`;

// Second criterion, spot trades only: the CSV sometimes exports a trade with the
// INVERTED symbol (base↔quote swapped) — e.g. "USDCBTC" for an API "BTCUSDC"
// order, or "USDTBTC" for "BTCUSDT". Those share the exact second but a
// different symbol, so DETECT_SQL (which matches on the symbol) misses them.
// Here we match a CSV spot trade to any API spot trade at the same second whose
// qty/quoteQty coincides in either orientation.
const SPOT_CROSS_SQL = `
  WITH s AS (
    SELECT "EventID"::text AS "EventID", "UserID", ("ExternalID" LIKE 'csv-%') AS is_csv,
      date_trunc('second', "OccurredAt") AS sec,
      ("RawPayload"->>'qty')::numeric AS qty,
      ("RawPayload"->>'quoteQty')::numeric AS quote
    FROM "CryptoRawEvents"
    WHERE "EventType" = 'spot_trade'
  )
  SELECT DISTINCT csv."EventID", csv."UserID", 'spot_trade'::text AS "EventType"
  FROM s csv
  JOIN s api ON api.is_csv = false AND api."UserID" = csv."UserID" AND api.sec = csv.sec
  WHERE csv.is_csv = true
    AND (
      abs(api.qty - csv.quote) < 1e-9 OR abs(api.quote - csv.qty) < 1e-9
      OR abs(api.qty - csv.qty) < 1e-9 OR abs(api.quote - csv.quote) < 1e-9
    )
`;

interface DupRow {
  EventID: string;
  UserID: number;
  EventType: string;
}

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');
  const url = process.env.DATABASE_URL;
  if (!url) {
    // biome-ignore lint/suspicious/noConsole: CLI script
    console.error('DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  try {
    const [primary, crossed] = await Promise.all([
      pool.query<DupRow>(DETECT_SQL),
      pool.query<DupRow>(SPOT_CROSS_SQL),
    ]);
    // Merge both criteria, deduping by EventID.
    const byId = new Map<string, DupRow>();
    [...primary.rows, ...crossed.rows].forEach((row) => byId.set(row.EventID, row));
    const rows = Array.from(byId.values());

    if (rows.length === 0) {
      // biome-ignore lint/suspicious/noConsole: CLI script
      console.log('No cross-source (CSV ↔ API) duplicates found. Nothing to do.');
      return;
    }

    const byType = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.EventType] = (acc[r.EventType] ?? 0) + 1;
      return acc;
    }, {});

    // biome-ignore lint/suspicious/noConsole: CLI script
    console.log(`Found ${rows.length} CSV events that are duplicated by the Binance API:`);
    Object.entries(byType)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([type, count]) => {
        // biome-ignore lint/suspicious/noConsole: CLI script
        console.log(`  ${type.padEnd(16)} ${count}`);
      });

    if (!execute) {
      // biome-ignore lint/suspicious/noConsole: CLI script
      console.log('\nDry-run only — nothing was deleted. Re-run with --execute to remove them.');
      return;
    }

    const ids = rows.map((r) => r.EventID);
    const result = await pool.query('DELETE FROM "CryptoRawEvents" WHERE "EventID" = ANY($1::bigint[])', [ids]);
    // biome-ignore lint/suspicious/noConsole: CLI script
    console.log(`\nDeleted ${result.rowCount} CSV events (their TaxableEvents and CryptoDisposals cascaded).`);
    // biome-ignore lint/suspicious/noConsole: CLI script
    console.log('NEXT STEP: open the app → Crypto → Fiscal → "Recalcular FIFO" to rebuild the disposals.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // biome-ignore lint/suspicious/noConsole: CLI script
  console.error(error);
  process.exit(1);
});
