/**
 * Crypto fiscal repository — bridge between TaxableEvents (Phase 3) and the
 * Modelo 100 outputs the user files with the AEAT.
 *
 * Two responsibilities:
 *   1. recomputeYear(year) — pull every TaxableEvent up to and including
 *      `year`, run FIFO over the full history, persist the disposals that
 *      belong to `year`. Reconstructs from genesis on every call so a
 *      classifier change doesn't leave stale results.
 *   2. getModelo100Summary(year) — sum the four boxes (1804-F, 1804-N,
 *      0304, 0033) for the year. Pure SQL aggregation, no FIFO.
 */

import {
  CRYPTO_CONTRAPRESTACION,
  CRYPTO_TAXABLE_KIND,
  type CryptoContraprestacion,
  type CryptoTaxableKind,
} from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import { type CryptoDisposalDraft, type FifoTaxableEvent, runFifo } from '@/utils/crypto/fifo';
import { madridYearStartUtc } from '@/utils/crypto/fiscalYear';
import { getPool, query } from './connection';

/** Minimal structural type for a pinned pool client used inside a transaction. */
type TxClient = { query: (text: string, params?: unknown[]) => Promise<unknown> };

interface TaxableEventForFifoRow {
  EventID: string;
  Kind: string;
  OccurredAt: string;
  Asset: string;
  QuantityNative: string;
  UnitPriceEurCents: string;
  GrossValueEurCents: string;
  FeeEurCents: string;
  PriceSource: string;
  Contraprestacion: string | null;
}

export interface RecomputeResult {
  fiscalYear: number;
  disposalsInserted: number;
  incompleteCoverageCount: number;
}

/**
 * Recompute all CryptoDisposals for `fiscalYear`. Runs FIFO over EVERY
 * historical TaxableEvent (back to genesis) so the cost basis at the time
 * of each `year` disposal is correct. Then deletes existing disposals
 * for that year and inserts the fresh set within a transaction.
 *
 * Idempotent: calling twice yields the same disposals.
 */
export async function recomputeYearForUser(userId: number, fiscalYear: number): Promise<RecomputeResult> {
  // Pull every taxable event up to the END of `fiscalYear` (Madrid civil
  // time). Anything later is irrelevant for this year's FIFO.
  const yearEnd = madridYearStartUtc(fiscalYear + 1).toISOString();
  const rows = await query<TaxableEventForFifoRow>(
    `SELECT "EventID"::text AS "EventID", "Kind", "OccurredAt", "Asset",
            "QuantityNative", "UnitPriceEurCents", "GrossValueEurCents",
            "FeeEurCents", "PriceSource", "Contraprestacion"
     FROM "TaxableEvents"
     WHERE "UserID" = $1 AND "OccurredAt" < $2
     ORDER BY "OccurredAt" ASC, "EventID" ASC`,
    [userId, yearEnd],
  );

  const fifoEvents: FifoTaxableEvent[] = rows.map((r) => ({
    taxableEventId: r.EventID,
    kind: r.Kind as CryptoTaxableKind,
    occurredAt: r.OccurredAt,
    asset: r.Asset,
    quantityNative: r.QuantityNative,
    unitPriceEurCents: Number(r.UnitPriceEurCents),
    grossValueEurCents: Number(r.GrossValueEurCents),
    feeEurCents: Number(r.FeeEurCents),
    priceSource: r.PriceSource,
    contraprestacion: r.Contraprestacion as CryptoContraprestacion | null,
  }));

  const allDisposals = runFifo(fifoEvents);
  const yearDisposals = allDisposals.filter((d) => d.fiscalYear === fiscalYear);
  const incompleteCoverageCount = yearDisposals.filter((d) => d.incompleteCoverage).length;

  // Atomic swap on a PINNED client: BEGIN/COMMIT/ROLLBACK must run on the same
  // connection, otherwise on a serverless pool each statement auto-commits and
  // a failed insert after the DELETE leaves the table truncated.
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM "CryptoDisposals" WHERE "UserID" = $1 AND "FiscalYear" = $2`, [userId, fiscalYear]);
    if (yearDisposals.length > 0) {
      await bulkInsertDisposalsTx(client, userId, yearDisposals);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return {
    fiscalYear,
    disposalsInserted: yearDisposals.length,
    incompleteCoverageCount,
  };
}

/**
 * Recompute every fiscal year that has at least one disposal OR one
 * disposal-kind taxable event. Single FIFO pass — no point re-reading the
 * full history once per year — atomically swapping all years' disposals in
 * a single transaction.
 *
 * This is what the UI button calls: a per-year recompute is rarely what
 * the user wants because changing a normalizer rule (transfer_in basis,
 * stablecoin contraprestacion, etc.) shifts cost basis across every year.
 */
export async function recomputeAllYearsForUser(
  userId: number,
): Promise<{ years: RecomputeResult[]; totalDisposalsInserted: number; totalIncompleteCoverage: number }> {
  // Read EVERY taxable event once.
  const rows = await query<TaxableEventForFifoRow>(
    `SELECT "EventID"::text AS "EventID", "Kind", "OccurredAt", "Asset",
            "QuantityNative", "UnitPriceEurCents", "GrossValueEurCents",
            "FeeEurCents", "PriceSource", "Contraprestacion"
     FROM "TaxableEvents"
     WHERE "UserID" = $1
     ORDER BY "OccurredAt" ASC, "EventID" ASC`,
    [userId],
  );

  const fifoEvents: FifoTaxableEvent[] = rows.map((r) => ({
    taxableEventId: r.EventID,
    kind: r.Kind as CryptoTaxableKind,
    occurredAt: r.OccurredAt,
    asset: r.Asset,
    quantityNative: r.QuantityNative,
    unitPriceEurCents: Number(r.UnitPriceEurCents),
    grossValueEurCents: Number(r.GrossValueEurCents),
    feeEurCents: Number(r.FeeEurCents),
    priceSource: r.PriceSource,
    contraprestacion: r.Contraprestacion as CryptoContraprestacion | null,
  }));

  const allDisposals = runFifo(fifoEvents);

  // Group by fiscal year for the per-year summary.
  const byYear = new Map<number, CryptoDisposalDraft[]>();
  allDisposals.forEach((d) => {
    const list = byYear.get(d.fiscalYear) ?? [];
    list.push(d);
    byYear.set(d.fiscalYear, list);
  });

  // Atomic swap on a PINNED client: wipe ALL existing disposals for the user
  // and insert the fresh set in one transaction so the UI never sees a
  // half-recomputed state (and a failed insert rolls back the DELETE).
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM "CryptoDisposals" WHERE "UserID" = $1`, [userId]);
    if (allDisposals.length > 0) {
      await bulkInsertDisposalsTx(client, userId, allDisposals);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const years: RecomputeResult[] = Array.from(byYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, drafts]) => ({
      fiscalYear: year,
      disposalsInserted: drafts.length,
      incompleteCoverageCount: drafts.filter((d) => d.incompleteCoverage).length,
    }));

  return {
    years,
    totalDisposalsInserted: allDisposals.length,
    totalIncompleteCoverage: allDisposals.filter((d) => d.incompleteCoverage).length,
  };
}

const COLS_PER_DISPOSAL = 16;
// Postgres caps a statement at 65535 bound parameters (~4095 rows at 16
// params/row). A multi-year trader (dust, swaps, c2c) can exceed that, so
// insert in chunks well under the limit. Chunks run sequentially on the same
// pinned client inside the open transaction.
const DISPOSAL_INSERT_CHUNK = 1000;

async function bulkInsertDisposalsTx(client: TxClient, userId: number, drafts: CryptoDisposalDraft[]): Promise<void> {
  const chunkCount = Math.ceil(drafts.length / DISPOSAL_INSERT_CHUNK);
  await Array.from({ length: chunkCount }).reduce<Promise<void>>(
    (prev, _unused, i) =>
      prev.then(() =>
        insertDisposalChunk(client, userId, drafts.slice(i * DISPOSAL_INSERT_CHUNK, (i + 1) * DISPOSAL_INSERT_CHUNK)),
      ),
    Promise.resolve(),
  );
}

async function insertDisposalChunk(client: TxClient, userId: number, drafts: CryptoDisposalDraft[]): Promise<void> {
  if (drafts.length === 0) return;

  const placeholders = drafts
    .map((_, i) => {
      const base = i * COLS_PER_DISPOSAL + 1;
      return `(${Array.from({ length: COLS_PER_DISPOSAL }, (_, j) => `$${base + j}`).join(', ')})`;
    })
    .join(', ');

  const params = drafts.flatMap((d) => [
    userId,
    d.taxableEventId,
    d.fiscalYear,
    d.occurredAt,
    d.asset,
    d.contraprestacion,
    d.quantityNative,
    d.transmissionValueCents,
    d.transmissionFeeCents,
    d.acquisitionValueCents,
    d.acquisitionFeeCents,
    d.gainLossCents,
    d.priceSource,
    JSON.stringify(d.acquisitionLots),
    d.incompleteCoverage,
    d.needsReview,
  ]);

  await client.query(
    `INSERT INTO "CryptoDisposals" (
       "UserID", "TaxableEventID", "FiscalYear", "OccurredAt", "Asset",
       "Contraprestacion", "QuantityNative",
       "TransmissionValueCents", "TransmissionFeeCents",
       "AcquisitionValueCents", "AcquisitionFeeCents",
       "GainLossCents", "PriceSource", "AcquisitionLotsJson",
       "IncompleteCoverage", "NeedsReview"
     )
     VALUES ${placeholders}
     ON CONFLICT ("TaxableEventID", "FiscalYear") DO NOTHING`,
    params,
  );
}

// ============================================================
// Modelo 100 summary
// ============================================================

interface ElementRow {
  Asset: string;
  Contraprestacion: string;
  TransmissionValueCents: string;
  TransmissionFeeCents: string;
  AcquisitionValueCents: string;
  AcquisitionFeeCents: string;
  GainLossCents: string;
  RowCount: string;
  IncompleteCount: string;
  NeedsReviewCount: string;
}

interface AirdropStakingRow {
  Kind: string;
  TotalCents: string;
}

export interface Modelo100CryptoSummary {
  fiscalYear: number;
  casilla1804F: BucketSummary;
  casilla1804N: BucketSummary;
  /** One row per (Asset, Contraprestacion): a Modelo 100 "Elemento patrimonial". */
  elements: Modelo100Element[];
  casilla0304Cents: number;
  casilla0033Cents: number;
  incompleteCoverageCount: number;
  needsReviewCount: number;
  computedAt: string;
}

export interface BucketSummary {
  transmissionValueCents: number;
  transmissionFeeCents: number;
  acquisitionValueCents: number;
  acquisitionFeeCents: number;
  gainLossCents: number;
  rowCount: number;
}

/**
 * A single AEAT "Elemento patrimonial": the GROSS sums for one coin under one
 * F/N key. The printed boxes (1804 net of fees, 1806 incl. acq fee, 1807/1809)
 * are derived from these with modelo100ElementBoxes() so the net-of-fee rule
 * lives in exactly one place.
 */
export interface Modelo100Element extends BucketSummary {
  asset: string;
  contraprestacion: CryptoContraprestacion;
}

const EMPTY_BUCKET: BucketSummary = {
  transmissionValueCents: 0,
  transmissionFeeCents: 0,
  acquisitionValueCents: 0,
  acquisitionFeeCents: 0,
  gainLossCents: 0,
  rowCount: 0,
};

export async function getModelo100Summary(fiscalYear: number): Promise<Modelo100CryptoSummary> {
  const userId = await getUserIdOrThrow();

  // Aggregate disposals by Contraprestacion (1804-F vs 1804-N).
  // Airdrop/staking rows are filtered by OccurredAt, so the year bounds must
  // match Madrid civil time (same basis as the disposals' FiscalYear column).
  const yearStart = madridYearStartUtc(fiscalYear).toISOString();
  const yearEnd = madridYearStartUtc(fiscalYear + 1).toISOString();

  const [elementRows, airdropStakingRows] = await Promise.all([
    query<ElementRow>(
      `SELECT
         "Asset",
         "Contraprestacion",
         SUM("TransmissionValueCents")::text AS "TransmissionValueCents",
         SUM("TransmissionFeeCents")::text  AS "TransmissionFeeCents",
         SUM("AcquisitionValueCents")::text AS "AcquisitionValueCents",
         SUM("AcquisitionFeeCents")::text   AS "AcquisitionFeeCents",
         SUM("GainLossCents")::text         AS "GainLossCents",
         COUNT(*)::text                     AS "RowCount",
         -- Aggregate the FIFO-computed booleans persisted on each disposal.
         -- The FIFO pass already decided coverage (relative tolerance) and
         -- review (unresolved/FMV-proxy) in TS, so SQL just trusts those
         -- columns — no float epsilon comparison, no jsonb re-scan, no drift.
         COUNT(*) FILTER (WHERE "IncompleteCoverage")::text AS "IncompleteCount",
         COUNT(*) FILTER (WHERE "NeedsReview")::text        AS "NeedsReviewCount"
       FROM "CryptoDisposals"
       WHERE "UserID" = $1 AND "FiscalYear" = $2
       GROUP BY "Asset", "Contraprestacion"
       ORDER BY "Asset" ASC, "Contraprestacion" ASC`,
      [userId, fiscalYear],
    ),
    query<AirdropStakingRow>(
      `SELECT "Kind", SUM("GrossValueEurCents")::text AS "TotalCents"
       FROM "TaxableEvents"
       WHERE "UserID" = $1
         AND "OccurredAt" >= $2 AND "OccurredAt" < $3
         AND "Kind" IN ($4, $5)
       GROUP BY "Kind"`,
      [userId, yearStart, yearEnd, CRYPTO_TAXABLE_KIND.AIRDROP, CRYPTO_TAXABLE_KIND.STAKING_REWARD],
    ),
  ]);

  const summary: Modelo100CryptoSummary = {
    fiscalYear,
    casilla1804F: { ...EMPTY_BUCKET },
    casilla1804N: { ...EMPTY_BUCKET },
    elements: [],
    casilla0304Cents: 0,
    casilla0033Cents: 0,
    incompleteCoverageCount: 0,
    needsReviewCount: 0,
    computedAt: new Date().toISOString(),
  };

  const elements: Modelo100Element[] = elementRows.map((row) => ({
    asset: row.Asset,
    contraprestacion: row.Contraprestacion as CryptoContraprestacion,
    transmissionValueCents: Number(row.TransmissionValueCents ?? 0),
    transmissionFeeCents: Number(row.TransmissionFeeCents ?? 0),
    acquisitionValueCents: Number(row.AcquisitionValueCents ?? 0),
    acquisitionFeeCents: Number(row.AcquisitionFeeCents ?? 0),
    gainLossCents: Number(row.GainLossCents ?? 0),
    rowCount: Number(row.RowCount ?? 0),
  }));

  // Fold every element into its F/N bucket so the top-level totals are exactly
  // the sum of the per-coin breakdown shown to the user.
  elements.forEach((element, index) => {
    const bucket =
      element.contraprestacion === CRYPTO_CONTRAPRESTACION.FIAT ? summary.casilla1804F : summary.casilla1804N;
    bucket.transmissionValueCents += element.transmissionValueCents;
    bucket.transmissionFeeCents += element.transmissionFeeCents;
    bucket.acquisitionValueCents += element.acquisitionValueCents;
    bucket.acquisitionFeeCents += element.acquisitionFeeCents;
    bucket.gainLossCents += element.gainLossCents;
    bucket.rowCount += element.rowCount;
    summary.incompleteCoverageCount += Number(elementRows[index]?.IncompleteCount ?? 0);
    summary.needsReviewCount += Number(elementRows[index]?.NeedsReviewCount ?? 0);
  });

  summary.elements = elements;

  airdropStakingRows.forEach((row) => {
    const cents = Number(row.TotalCents ?? 0);
    if (row.Kind === CRYPTO_TAXABLE_KIND.AIRDROP) summary.casilla0304Cents = cents;
    if (row.Kind === CRYPTO_TAXABLE_KIND.STAKING_REWARD) summary.casilla0033Cents = cents;
  });

  return summary;
}

// ============================================================
// Disposal listing for the audit table in the UI
// ============================================================

interface DisposalRow {
  DisposalID: string;
  FiscalYear: number;
  OccurredAt: string;
  Asset: string;
  Contraprestacion: string;
  QuantityNative: string;
  TransmissionValueCents: string;
  TransmissionFeeCents: string;
  AcquisitionValueCents: string;
  AcquisitionFeeCents: string;
  GainLossCents: string;
  AcquisitionLotsJson: unknown;
  IncompleteCoverage: boolean;
  NeedsReview: boolean;
}

export interface DisposalDto {
  disposalId: string;
  fiscalYear: number;
  occurredAt: string;
  asset: string;
  contraprestacion: CryptoContraprestacion;
  quantityNative: string;
  transmissionValueCents: number;
  transmissionFeeCents: number;
  acquisitionValueCents: number;
  acquisitionFeeCents: number;
  gainLossCents: number;
  acquisitionLots: unknown[];
  /** FIFO ran out of lots before covering the disposal. */
  incompleteCoverage: boolean;
  /** Unresolved/0-price transmission or lot, or a transfer_in FMV-proxy lot. */
  needsReview: boolean;
}

export async function listDisposals(filters: {
  year: number;
  asset?: string;
  contraprestacion?: CryptoContraprestacion;
  limit: number;
  offset: number;
}): Promise<{ disposals: DisposalDto[]; total: number }> {
  const userId = await getUserIdOrThrow();
  const conditions = ['"UserID" = $1', '"FiscalYear" = $2'];
  const params: unknown[] = [userId, filters.year];
  let paramIdx = 3;

  if (filters.asset) {
    conditions.push(`"Asset" = $${paramIdx}`);
    params.push(filters.asset);
    paramIdx++;
  }
  if (filters.contraprestacion) {
    conditions.push(`"Contraprestacion" = $${paramIdx}`);
    params.push(filters.contraprestacion);
    paramIdx++;
  }

  const where = conditions.join(' AND ');

  const [rows, countRows] = await Promise.all([
    query<DisposalRow>(
      `SELECT "DisposalID"::text, "FiscalYear", "OccurredAt", "Asset",
              "Contraprestacion", "QuantityNative",
              "TransmissionValueCents", "TransmissionFeeCents",
              "AcquisitionValueCents", "AcquisitionFeeCents",
              "GainLossCents", "AcquisitionLotsJson",
              "IncompleteCoverage", "NeedsReview"
       FROM "CryptoDisposals"
       WHERE ${where}
       ORDER BY "OccurredAt" DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, filters.limit, filters.offset],
    ),
    query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM "CryptoDisposals" WHERE ${where}`, params),
  ]);

  return {
    disposals: rows.map((r) => ({
      disposalId: r.DisposalID,
      fiscalYear: r.FiscalYear,
      occurredAt: r.OccurredAt,
      asset: r.Asset,
      contraprestacion: r.Contraprestacion as CryptoContraprestacion,
      quantityNative: r.QuantityNative,
      transmissionValueCents: Number(r.TransmissionValueCents),
      transmissionFeeCents: Number(r.TransmissionFeeCents),
      acquisitionValueCents: Number(r.AcquisitionValueCents),
      acquisitionFeeCents: Number(r.AcquisitionFeeCents),
      gainLossCents: Number(r.GainLossCents),
      acquisitionLots: Array.isArray(r.AcquisitionLotsJson) ? (r.AcquisitionLotsJson as unknown[]) : [],
      incompleteCoverage: Boolean(r.IncompleteCoverage),
      needsReview: Boolean(r.NeedsReview),
    })),
    total: countRows[0]?.total ?? 0,
  };
}

export async function listFiscalYearsWithData(): Promise<number[]> {
  const userId = await getUserIdOrThrow();
  const rows = await query<{ year: number }>(
    `SELECT DISTINCT EXTRACT(YEAR FROM "OccurredAt" AT TIME ZONE 'Europe/Madrid')::int AS year
     FROM "TaxableEvents"
     WHERE "UserID" = $1
     ORDER BY year DESC`,
    [userId],
  );
  return rows.map((r) => r.year);
}
