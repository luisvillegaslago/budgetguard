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
import { query } from './connection';

interface TaxableEventForFifoRow {
  EventID: string;
  Kind: string;
  OccurredAt: string;
  Asset: string;
  QuantityNative: string;
  UnitPriceEurCents: string;
  GrossValueEurCents: string;
  FeeEurCents: string;
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
  // Pull every taxable event up to the END of `fiscalYear`. Anything later
  // is irrelevant for this year's FIFO.
  const yearEnd = new Date(Date.UTC(fiscalYear + 1, 0, 1)).toISOString();
  const rows = await query<TaxableEventForFifoRow>(
    `SELECT "EventID"::text AS "EventID", "Kind", "OccurredAt", "Asset",
            "QuantityNative", "UnitPriceEurCents", "GrossValueEurCents",
            "FeeEurCents", "Contraprestacion"
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
    contraprestacion: r.Contraprestacion as CryptoContraprestacion | null,
  }));

  const allDisposals = runFifo(fifoEvents);
  const yearDisposals = allDisposals.filter((d) => d.fiscalYear === fiscalYear);
  const incompleteCoverageCount = yearDisposals.filter((d) => d.incompleteCoverage).length;

  // Atomic swap inside a transaction: delete previous + insert new.
  await query('BEGIN');
  try {
    await query(`DELETE FROM "CryptoDisposals" WHERE "UserID" = $1 AND "FiscalYear" = $2`, [userId, fiscalYear]);

    if (yearDisposals.length > 0) {
      await bulkInsertDisposalsTx(userId, yearDisposals);
    }

    await query('COMMIT');
  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }

  return {
    fiscalYear,
    disposalsInserted: yearDisposals.length,
    incompleteCoverageCount,
  };
}

async function bulkInsertDisposalsTx(userId: number, drafts: CryptoDisposalDraft[]): Promise<void> {
  const COLS_PER_ROW = 13;
  const placeholders = drafts
    .map((_, i) => {
      const base = i * COLS_PER_ROW + 1;
      return `(${Array.from({ length: COLS_PER_ROW }, (_, j) => `$${base + j}`).join(', ')})`;
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
    JSON.stringify(d.acquisitionLots),
  ]);

  await query(
    `INSERT INTO "CryptoDisposals" (
       "UserID", "TaxableEventID", "FiscalYear", "OccurredAt", "Asset",
       "Contraprestacion", "QuantityNative",
       "TransmissionValueCents", "TransmissionFeeCents",
       "AcquisitionValueCents", "AcquisitionFeeCents",
       "GainLossCents", "AcquisitionLotsJson"
     )
     VALUES ${placeholders}
     ON CONFLICT ("TaxableEventID", "FiscalYear") DO NOTHING`,
    params,
  );
}

// ============================================================
// Modelo 100 summary
// ============================================================

interface BucketRow {
  Contraprestacion: string;
  TransmissionValueCents: string;
  TransmissionFeeCents: string;
  AcquisitionValueCents: string;
  AcquisitionFeeCents: string;
  GainLossCents: string;
  RowCount: string;
  IncompleteCount: string;
}

interface AirdropStakingRow {
  Kind: string;
  TotalCents: string;
}

export interface Modelo100CryptoSummary {
  fiscalYear: number;
  casilla1804F: BucketSummary;
  casilla1804N: BucketSummary;
  casilla0304Cents: number;
  casilla0033Cents: number;
  incompleteCoverageCount: number;
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
  const yearStart = new Date(Date.UTC(fiscalYear, 0, 1)).toISOString();
  const yearEnd = new Date(Date.UTC(fiscalYear + 1, 0, 1)).toISOString();

  const [bucketRows, airdropStakingRows] = await Promise.all([
    query<BucketRow>(
      `SELECT
         "Contraprestacion",
         SUM("TransmissionValueCents")::text AS "TransmissionValueCents",
         SUM("TransmissionFeeCents")::text  AS "TransmissionFeeCents",
         SUM("AcquisitionValueCents")::text AS "AcquisitionValueCents",
         SUM("AcquisitionFeeCents")::text   AS "AcquisitionFeeCents",
         SUM("GainLossCents")::text         AS "GainLossCents",
         COUNT(*)::text                     AS "RowCount",
         COUNT(*) FILTER (
           WHERE jsonb_array_length("AcquisitionLotsJson") = 0
              OR ("AcquisitionLotsJson"->-1->>'quantityConsumed')::numeric < "QuantityNative"
         )::text AS "IncompleteCount"
       FROM "CryptoDisposals"
       WHERE "UserID" = $1 AND "FiscalYear" = $2
       GROUP BY "Contraprestacion"`,
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
    casilla0304Cents: 0,
    casilla0033Cents: 0,
    incompleteCoverageCount: 0,
    computedAt: new Date().toISOString(),
  };

  bucketRows.forEach((row) => {
    const bucket: BucketSummary = {
      transmissionValueCents: Number(row.TransmissionValueCents ?? 0),
      transmissionFeeCents: Number(row.TransmissionFeeCents ?? 0),
      acquisitionValueCents: Number(row.AcquisitionValueCents ?? 0),
      acquisitionFeeCents: Number(row.AcquisitionFeeCents ?? 0),
      gainLossCents: Number(row.GainLossCents ?? 0),
      rowCount: Number(row.RowCount ?? 0),
    };
    if (row.Contraprestacion === CRYPTO_CONTRAPRESTACION.FIAT) summary.casilla1804F = bucket;
    if (row.Contraprestacion === CRYPTO_CONTRAPRESTACION.NON_FIAT) summary.casilla1804N = bucket;
    summary.incompleteCoverageCount += Number(row.IncompleteCount ?? 0);
  });

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
              "GainLossCents", "AcquisitionLotsJson"
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
    })),
    total: countRows[0]?.total ?? 0,
  };
}

export async function listFiscalYearsWithData(): Promise<number[]> {
  const userId = await getUserIdOrThrow();
  const rows = await query<{ year: number }>(
    `SELECT DISTINCT EXTRACT(YEAR FROM "OccurredAt")::int AS year
     FROM "TaxableEvents"
     WHERE "UserID" = $1
     ORDER BY year DESC`,
    [userId],
  );
  return rows.map((r) => r.year);
}
