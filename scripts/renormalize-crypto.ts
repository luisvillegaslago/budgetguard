/**
 * Full re-normalization of the crypto fiscal pipeline for ALL users.
 *
 * Rebuilds TaxableEvents and CryptoDisposals from the stored BinanceRawEvents so
 * that every recent calculation fix lands on existing data:
 *   - sub-cent price precision (micro-cents)        [H1]
 *   - price-source / needs-review flags             [H3 + M1]
 *   - stablecoin → key N, airdrop vs staking        [M6 + M3]
 *   - exact EUR consideration for fiat legs         [M2]
 *   - Europe/Madrid fiscal year                     [M4]
 *
 * What it does (per user, sequentially to avoid hammering the price APIs):
 *   1. DELETE the global CryptoPriceCache once, so prices refetch at micro-cent
 *      precision (cache is immutable, old rows are integer-cents only).
 *   2. DELETE TaxableEvents for the user (cascades to CryptoDisposals).
 *   3. Reset BinanceRawEvents.NormalizedAt = NULL so the normaliser reprocesses
 *      them. Raw events themselves (incl. any manual baseAsset/quoteAsset
 *      patches) are preserved.
 *   4. normalizeForUser  → rewrites TaxableEvents (precise gross + PriceSource).
 *   5. recomputeAllYearsForUser → rewrites CryptoDisposals (FIFO).
 *
 * PREREQUISITE: the schema ALTER must already be applied on the target DB:
 *   ALTER TABLE "CryptoPriceCache" ADD COLUMN IF NOT EXISTS "EurPriceMicroCents" BIGINT;
 *   UPDATE "CryptoPriceCache" SET "EurPriceMicroCents" = "EurPriceCents" * 1000000 WHERE "EurPriceMicroCents" IS NULL;
 *   ALTER TABLE "CryptoPriceCache" ALTER COLUMN "EurPriceMicroCents" SET NOT NULL;
 *   ALTER TABLE "CryptoDisposals" ADD COLUMN IF NOT EXISTS "PriceSource" VARCHAR(30) NOT NULL DEFAULT 'unresolved';
 * The script preflight-checks these columns and refuses to run without them.
 *
 * Usage:
 *   DATABASE_URL=xxx npx tsx scripts/renormalize-crypto.ts            # dry-run (default)
 *   DATABASE_URL=xxx npx tsx scripts/renormalize-crypto.ts --execute  # actually rebuild
 */

import { closeConnection, query } from '../src/services/database/connection';
import { recomputeAllYearsForUser } from '../src/services/database/CryptoFiscalRepository';
import { normalizeForUser } from '../src/services/exchanges/binance/NormalizationService';

// biome-ignore lint/suspicious/noConsole: CLI script
const log = (msg: string) => console.log(msg);
// biome-ignore lint/suspicious/noConsole: CLI script
const errln = (msg: string) => console.error(msg);

interface UserCounts {
  UserID: number;
  rawCount: string;
  taxableCount: string;
  disposalCount: string;
}

async function preflight(): Promise<boolean> {
  const rows = await query<{ has_micro: boolean; has_source: boolean }>(
    `SELECT
       EXISTS(SELECT 1 FROM information_schema.columns
              WHERE table_name = 'CryptoPriceCache' AND column_name = 'EurPriceMicroCents') AS has_micro,
       EXISTS(SELECT 1 FROM information_schema.columns
              WHERE table_name = 'CryptoDisposals' AND column_name = 'PriceSource') AS has_source`,
  );
  const ok = Boolean(rows[0]?.has_micro && rows[0]?.has_source);
  if (!ok) {
    errln('Missing schema columns. Apply the ALTER first (see the file header):');
    if (!rows[0]?.has_micro) errln('  - CryptoPriceCache."EurPriceMicroCents" is missing.');
    if (!rows[0]?.has_source) errln('  - CryptoDisposals."PriceSource" is missing.');
  }
  return ok;
}

async function processUser(userId: number): Promise<void> {
  await query(`DELETE FROM "TaxableEvents" WHERE "UserID" = $1`, [userId]);
  await query(`UPDATE "BinanceRawEvents" SET "NormalizedAt" = NULL WHERE "UserID" = $1`, [userId]);

  const norm = await normalizeForUser(userId);
  const recompute = await recomputeAllYearsForUser(userId);

  log(
    `  user ${String(userId).padEnd(5)} → normalized: processed=${norm.processed} inserted=${norm.inserted} ` +
      `skipped=${norm.skipped} failed=${norm.failed} | disposals=${recompute.totalDisposalsInserted} ` +
      `(incompleteCoverage=${recompute.totalIncompleteCoverage})`,
  );
  if (norm.failed > 0) {
    log(`    ⚠ ${norm.failed} normalization failures (first few): ${JSON.stringify(norm.failures.slice(0, 3))}`);
  }
}

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');

  if (!process.env.DATABASE_URL) {
    errln('DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  if (!(await preflight())) process.exit(1);

  const users = await query<UserCounts>(
    `SELECT r."UserID",
            COUNT(DISTINCT r."EventID")::text AS "rawCount",
            (SELECT COUNT(*) FROM "TaxableEvents" t WHERE t."UserID" = r."UserID")::text AS "taxableCount",
            (SELECT COUNT(*) FROM "CryptoDisposals" d WHERE d."UserID" = r."UserID")::text AS "disposalCount"
     FROM "BinanceRawEvents" r
     GROUP BY r."UserID"
     ORDER BY r."UserID"`,
  );

  if (users.length === 0) {
    log('No users with crypto raw events. Nothing to do.');
    return;
  }

  log(`Found ${users.length} user(s) with crypto data:`);
  users.forEach((u) => {
    log(
      `  user ${String(u.UserID).padEnd(5)} raws=${u.rawCount} taxableEvents=${u.taxableCount} disposals=${u.disposalCount}`,
    );
  });

  if (!execute) {
    log('\nDry-run only — nothing was changed.');
    log('Re-run with --execute to purge the price cache and rebuild TaxableEvents + CryptoDisposals.');
    return;
  }

  log('\nPurging CryptoPriceCache (prices will refetch at micro-cent precision)…');
  const purged = await query<{ n: string }>(
    `WITH del AS (DELETE FROM "CryptoPriceCache" RETURNING 1) SELECT COUNT(*)::text AS n FROM del`,
  );
  log(`  removed ${purged[0]?.n ?? '0'} cached prices.`);

  log('\nRe-normalizing per user (sequential)…');
  // Sequential reduce-chain (no for...of): keeps price-API pressure low and the
  // cache warming in order.
  await users.reduce<Promise<void>>(
    (prev, u) => prev.then(() => processUser(u.UserID)),
    Promise.resolve(),
  );

  log('\nDone. All users re-normalized and FIFO recomputed.');
}

main()
  .catch((error) => {
    errln(String(error instanceof Error ? error.stack : error));
    process.exitCode = 1;
  })
  .finally(() => {
    void closeConnection();
  });
