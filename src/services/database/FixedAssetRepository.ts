/**
 * BudgetGuard Fixed Asset Repository
 * CRUD of the inmovilizado (assets whose cost is spread over their useful life) plus the fold the
 * fiscal models consume.
 *
 * The table only stores *what* is amortised: base, in-service date and the rate actually applied.
 * *How much* falls in a period is never stored — it is computed on read by src/utils/amortization.ts,
 * so a dotación can never drift from its own asset and there is no yearly row to keep in sync.
 *
 * All queries are user-scoped: through getUserIdOrThrow(), except getAmortizationCentsForPeriod(),
 * which takes the id from a caller that already resolved it (same contract as getFiledModeloAmounts).
 */

import type { AmortizationCasilla, AmortizationGroupNumber } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import type { FixedAsset, FixedAssetInput, FixedAssetUpdateInput } from '@/types/finance';
import { amortizationCentsBetween } from '@/utils/amortization';
import { toDateString } from '@/utils/helpers';
import { query } from './connection';

// ============================================================
// Row Types
// ============================================================

interface FixedAssetRow {
  AssetID: number;
  Description: string;
  InServiceDate: Date | string;
  BaseCents: number | string;
  /** NUMERIC(5,2): the driver hands it over as a string */
  CoefficientPercent: number | string;
  AmortizationGroup: number | null;
  Modelo100CasillaCode: string;
  TransactionID: number | null;
  Notes: string | null;
  CreatedAt: Date | string;
  UpdatedAt: Date | string;
}

/** Columns shared by every SELECT and by the RETURNING of the mutations */
const ASSET_COLUMNS = `"AssetID", "Description", "InServiceDate", "BaseCents", "CoefficientPercent",
  "AmortizationGroup", "Modelo100CasillaCode", "TransactionID", "Notes", "CreatedAt", "UpdatedAt"`;

/** Domain field -> column, for the partial UPDATE and the INSERT (same order as ASSET_INSERT_COLUMNS) */
const WRITABLE_COLUMNS: Record<keyof FixedAssetInput, string> = {
  description: '"Description"',
  inServiceDate: '"InServiceDate"',
  baseCents: '"BaseCents"',
  coefficientPercent: '"CoefficientPercent"',
  amortizationGroup: '"AmortizationGroup"',
  modelo100CasillaCode: '"Modelo100CasillaCode"',
  transactionId: '"TransactionID"',
  notes: '"Notes"',
};

const WRITABLE_FIELDS = Object.keys(WRITABLE_COLUMNS) as (keyof FixedAssetInput)[];

// ============================================================
// Transformers
// ============================================================

function toISOString(val: Date | string): string {
  if (typeof val === 'string') return val;
  return val.toISOString();
}

function rowToFixedAsset(row: FixedAssetRow): FixedAsset {
  return {
    assetId: row.AssetID,
    description: row.Description,
    inServiceDate: toDateString(row.InServiceDate),
    baseCents: Number(row.BaseCents),
    coefficientPercent: Number(row.CoefficientPercent),
    // CK_FixedAssets_Group and CK_FixedAssets_Casilla keep these two inside their domains
    amortizationGroup: row.AmortizationGroup as AmortizationGroupNumber | null,
    modelo100CasillaCode: row.Modelo100CasillaCode as AmortizationCasilla,
    transactionId: row.TransactionID,
    notes: row.Notes,
    createdAt: toISOString(row.CreatedAt),
    updatedAt: toISOString(row.UpdatedAt),
  };
}

/**
 * The value a writable field carries into SQL: undefined becomes NULL, and the in-service date is
 * trimmed to its calendar day — an ISO instant reaching a DATE column would shift it by one day for
 * half the year.
 */
function toParam(field: keyof FixedAssetInput, value: FixedAssetUpdateInput[keyof FixedAssetInput]): unknown {
  if (field === 'inServiceDate' && typeof value === 'string') return toDateString(value);
  return value ?? null;
}

// ============================================================
// Queries
// ============================================================

/**
 * Assets of a user, newest in service first.
 *
 * `year` filters on the dotación, not on the purchase: an asset bought in 2025 still shows up in
 * 2027 while it has base left, and drops off the year after it is exhausted. That is a property of
 * the schedule, not a column, so it is resolved with the same pure function the reports use rather
 * than with a SQL predicate that would have to re-derive the amortization rules.
 */
async function loadAssets(userId: number, upToDay?: string): Promise<FixedAsset[]> {
  const params: unknown[] = [userId];
  if (upToDay) params.push(upToDay);

  const rows = await query<FixedAssetRow>(
    `SELECT ${ASSET_COLUMNS}
     FROM "FixedAssets"
     WHERE "UserID" = $1${upToDay ? ' AND "InServiceDate" <= $2' : ''}
     ORDER BY "InServiceDate" DESC, "AssetID" DESC`,
    params,
  );
  return rows.map(rowToFixedAsset);
}

/** Fixed assets of the current user; `year` keeps only those with a dotación in that fiscal year. */
export async function getFixedAssets(year?: number): Promise<FixedAsset[]> {
  const assets = await loadAssets(await getUserIdOrThrow(), year ? `${year}-12-31` : undefined);
  if (!year) return assets;

  return assets.filter((asset) => amortizationCentsBetween(asset, `${year}-01-01`, `${year}-12-31`) > 0);
}

export async function getFixedAssetById(assetId: number): Promise<FixedAsset | null> {
  const userId = await getUserIdOrThrow();
  const rows = await query<FixedAssetRow>(
    `SELECT ${ASSET_COLUMNS} FROM "FixedAssets" WHERE "AssetID" = $1 AND "UserID" = $2`,
    [assetId, userId],
  );
  return rows[0] ? rowToFixedAsset(rows[0]) : null;
}

// ============================================================
// Mutations
// ============================================================

/** Create a fixed asset for the current user. Amounts arrive already in cents. */
export async function createFixedAsset(input: FixedAssetInput): Promise<FixedAsset> {
  const userId = await getUserIdOrThrow();
  const columns = WRITABLE_FIELDS.map((field) => WRITABLE_COLUMNS[field]);
  const placeholders = WRITABLE_FIELDS.map((_, index) => `$${index + 2}`);

  const rows = await query<FixedAssetRow>(
    `INSERT INTO "FixedAssets" ("UserID", ${columns.join(', ')})
     VALUES ($1, ${placeholders.join(', ')})
     RETURNING ${ASSET_COLUMNS}`,
    [userId, ...WRITABLE_FIELDS.map((field) => toParam(field, input[field]))],
  );
  return rowToFixedAsset(rows[0]!);
}

/**
 * Update a fixed asset of the current user (verifies ownership). An omitted field keeps its value.
 *
 * Editing the rate or the base rewrites the whole schedule, past years included: that is the point,
 * a corrected purchase price must reach the year that was mis-filed. Nothing here is frozen by the
 * repository — what protects a filed year is the user not touching the asset behind it.
 */
export async function updateFixedAsset(assetId: number, input: FixedAssetUpdateInput): Promise<FixedAsset | null> {
  const userId = await getUserIdOrThrow();

  const changed = WRITABLE_FIELDS.filter((field) => input[field] !== undefined);
  if (changed.length === 0) return getFixedAssetById(assetId);

  const assignments = changed.map((field, index) => `${WRITABLE_COLUMNS[field]} = $${index + 1}`);
  const idPlaceholder = changed.length + 1;

  const rows = await query<FixedAssetRow>(
    `UPDATE "FixedAssets" SET ${assignments.join(', ')}
     WHERE "AssetID" = $${idPlaceholder} AND "UserID" = $${idPlaceholder + 1}
     RETURNING ${ASSET_COLUMNS}`,
    [...changed.map((field) => toParam(field, input[field])), assetId, userId],
  );
  return rows[0] ? rowToFixedAsset(rows[0]) : null;
}

/** Delete a fixed asset of the current user. The purchase transaction it points at is untouched. */
export async function deleteFixedAsset(assetId: number): Promise<boolean> {
  const userId = await getUserIdOrThrow();
  const rows = await query<{ AssetID: number }>(
    'DELETE FROM "FixedAssets" WHERE "AssetID" = $1 AND "UserID" = $2 RETURNING "AssetID"',
    [assetId, userId],
  );
  return rows.length > 0;
}

// ============================================================
// Amortization Fold (consumed by the fiscal models)
// ============================================================

/** Amortization accrued in a period, split by the Modelo 100 box each asset is deducted in. */
export interface AmortizationPeriodTotals {
  totalCents: number;
  /** '0208' inmovilizado material, '0227' intangible. Only boxes with a dotación are present */
  byCasilla: Map<AmortizationCasilla, number>;
}

/**
 * TransactionIDs of the purchases that became an asset.
 *
 * The IRPF models must skip these rows: their cost is already entering through the amortization,
 * and counting the purchase as well would deduct the same asset twice.
 *
 * They are skipped at read time rather than by zeroing the transaction's DeductionPercent, because
 * that single column also drives the DEDUCTIBLE VAT (see computeFiscalFields). Zeroing it would
 * silently erase the input VAT of the purchase from Modelo 303 and Modelo 390 — and VAT on an asset
 * is deducted in full in the quarter of purchase, never amortized. On the real Lenovo that would
 * have removed 150,82 € of the 158,74 € in casilla 29 of an already filed 4T 2025.
 */
export async function getAssetTransactionIds(userId: number): Promise<Set<number>> {
  const rows = await query<{ TransactionID: number }>(
    `SELECT "TransactionID" FROM "FixedAssets" WHERE "UserID" = $1 AND "TransactionID" IS NOT NULL`,
    [userId],
  );

  return new Set(rows.map((row) => row.TransactionID));
}

/**
 * Dotación deductible in [from, to], both inclusive, for every asset of a user.
 *
 * Takes the userId instead of resolving it: the caller is a fiscal model that already has it.
 * Assets not yet in service by `to` are dropped in SQL; the rest are folded through
 * amortizationCentsBetween(), which caps each one at its own base, so an exhausted asset
 * contributes zero without needing a state column to say so.
 */
export async function getAmortizationCentsForPeriod(
  userId: number,
  from: string,
  to: string,
): Promise<AmortizationPeriodTotals> {
  const assets = await loadAssets(userId, to);

  return assets.reduce<AmortizationPeriodTotals>(
    (totals, asset) => {
      const cents = amortizationCentsBetween(asset, from, to);
      if (cents === 0) return totals;

      const casilla = asset.modelo100CasillaCode;
      totals.byCasilla.set(casilla, (totals.byCasilla.get(casilla) ?? 0) + cents);
      totals.totalCents += cents;
      return totals;
    },
    { totalCents: 0, byCasilla: new Map<AmortizationCasilla, number>() },
  );
}
