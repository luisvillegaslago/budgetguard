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

import {
  type AmortizationCasilla,
  type AmortizationGroupNumber,
  ASSET_PURCHASE_MATCH,
  TRANSACTION_TYPE,
} from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import type { AssetPurchaseCandidate, FixedAsset, FixedAssetInput, FixedAssetUpdateInput } from '@/types/finance';
import { amortizationCentsBetween } from '@/utils/amortization';
import { computeFiscalFields } from '@/utils/fiscal';
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

/**
 * The assets whose purchase is not linked — the ones being deducted twice.
 *
 * `TransactionID` is what makes getAssetTransactionIds() pull the purchase out of the IRPF models
 * (§ Amortización del inmovilizado). Without it the purchase stays a period expense **and** the
 * dotación is deducted on top: the same asset deducted twice, silently, for as long as its
 * schedule runs. Nothing else in the app notices, because both figures are individually correct.
 *
 * Same `year` semantics as getFixedAssets(): the assets with a dotación in that fiscal year, which
 * is exactly the set whose duplication reaches that year's modelos. Omit it for every asset.
 *
 * Deliberately just the assets: what the duplication *costs* is the dotación of a period, and the
 * caller already knows which period it is asking about. Returning a number computed against some
 * other period would be worse than returning none.
 */
export async function getUnlinkedFixedAssets(year?: number): Promise<FixedAsset[]> {
  const assets = await getFixedAssets(year);
  return assets.filter((asset) => asset.transactionId === null);
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
 *
 * **This is also how a purchase gets linked.** `transactionId` is an ordinary writable field, so
 * `{ transactionId }` on an asset returned by getUnlinkedFixedAssets() is the whole fix, and
 * UpdateFixedAssetSchema already accepts it. No dedicated link mutation exists because it would be
 * a second door onto the same column, and the two would eventually disagree.
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
// Purchase Matching (the fix for an unlinked asset)
// ============================================================

interface PurchaseCandidateRow {
  TransactionID: number;
  TransactionDate: Date | string;
  Description: string | null;
  VendorName: string | null;
  CategoryName: string;
  /** COALESCE("OriginalAmountCents", "AmountCents"): a shared expense stores its halved amount */
  FullAmountCents: number | string;
  /** NUMERIC(5,2) columns: the driver hands them over as strings */
  VatPercent: number | string;
  DeductionPercent: number | string;
  /** Already resolved against "DeductionPercent" by the view: never NULL here */
  VatDeductionPercent: number | string;
}

const MS_PER_DAY = 86_400_000;

/** Parse a 'YYYY-MM-DD' calendar day into a UTC timestamp. A DATE column is a day, not an instant. */
function dayToUtcMs(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year!, month! - 1, date!);
}

/** A calendar day shifted by whole days, 'YYYY-MM-DD'. */
function shiftDay(day: string, offsetDays: number): string {
  return new Date(dayToUtcMs(day) + offsetDays * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * What the movement would cost to amortize, i.e. the only figure comparable with
 * "FixedAssets"."BaseCents".
 *
 * **Two numbers that look comparable and are not.** The stored base is the acquisition cost *net of
 * deductible VAT*, while a transaction's amount is what left the account: VAT included, and halved
 * when the expense is shared. So the comparison needs both corrections, and both already have one
 * home each — "vw_FiscalQuarterly" un-halves the amount into "FullAmountCents" and resolves the
 * NULL "VatDeductionPercent" into the IRPF share, and computeFiscalFields() splits that into base
 * and cuota. Whatever input VAT is **not** deductible was never recovered from the Treasury, so it
 * is part of the cost and belongs in the base; on the live Lenovo the VAT is fully deductible and
 * this is exactly the 718,18 € stored on the asset.
 */
function amortizableCostOf(row: PurchaseCandidateRow): number {
  const { baseCents, ivaCents, ivaDeducibleCents } = computeFiscalFields(
    Number(row.FullAmountCents),
    Number(row.VatPercent),
    Number(row.DeductionPercent),
    Number(row.VatDeductionPercent),
  );

  return baseCents + ivaCents - ivaDeducibleCents;
}

/**
 * The movements that look like the purchase of an asset that has none linked.
 *
 * **The rule, stated once so it cannot drift into something looser.** A candidate is a *fiscally
 * coded expense* of this user whose amortizable cost is within
 * `ASSET_PURCHASE_MATCH.AMOUNT_TOLERANCE_PERCENT` of the asset's base (with a floor of
 * `AMOUNT_TOLERANCE_MIN_CENTS`, so a cheap asset still has a band), dated inside an asymmetric
 * window around the in-service date — `DAYS_BEFORE_IN_SERVICE` back, `DAYS_AFTER_IN_SERVICE`
 * forward — and **not already the purchase of another asset**. Ranked by how close the amount is,
 * then by how close the date is, and cut at `MAX_CANDIDATES`.
 *
 * Every one of those clauses is there to offer *fewer* rows. A wrong link is strictly worse than no
 * candidate: it makes a real purchase stop being deducted while the impostor keeps being deducted,
 * and it is silent in both directions. Nothing here links anything — the user picks, and
 * updateFixedAsset() writes it.
 *
 * **Why "vw_FiscalQuarterly" and not "vw_FiscalAccrual".** This computes no fiscal figure and fills
 * no casilla: it searches for a *movement*, and it needs that movement's own id and its own payment
 * date, which is precisely what the accrual view replaces for issued invoices (TransactionID 0, the
 * invoice date). For expense rows the two views are the same row, and the quarterly one is where
 * the two corrections the comparison depends on — "FullAmountCents" and the resolved
 * "VatDeductionPercent" — are already applied. Reading it here is not the mistake § Devengo vs.
 * caja warns about.
 *
 * @param assetId - Asset of the current user. A foreign one, a missing one or an already linked one
 *                  yields no candidates: an asset with a link is not a problem to be fixed.
 */
export async function getAssetPurchaseCandidates(assetId: number): Promise<AssetPurchaseCandidate[]> {
  const userId = await getUserIdOrThrow();
  const asset = await getFixedAssetById(assetId);
  if (!asset || asset.transactionId !== null) return [];

  const rows = await query<PurchaseCandidateRow>(
    `SELECT v."TransactionID", v."TransactionDate", v."Description", v."VendorName", v."CategoryName",
            v."FullAmountCents", v."VatPercent", v."DeductionPercent", v."VatDeductionPercent"
     FROM "vw_FiscalQuarterly" v
     WHERE v."UserID" = $1
       AND v."Type" = $2
       AND v."TransactionDate" BETWEEN $3 AND $4
       -- A movement already amortized as another asset can never be this one's purchase, and
       -- offering it invites linking the same cost twice
       AND NOT EXISTS (
         SELECT 1 FROM "FixedAssets" fa
         WHERE fa."UserID" = v."UserID" AND fa."TransactionID" = v."TransactionID"
       )
     ORDER BY v."TransactionDate", v."TransactionID"`,
    [
      userId,
      TRANSACTION_TYPE.EXPENSE,
      shiftDay(asset.inServiceDate, -ASSET_PURCHASE_MATCH.DAYS_BEFORE_IN_SERVICE),
      shiftDay(asset.inServiceDate, ASSET_PURCHASE_MATCH.DAYS_AFTER_IN_SERVICE),
    ],
  );

  const toleranceCents = Math.max(
    Math.round((asset.baseCents * ASSET_PURCHASE_MATCH.AMOUNT_TOLERANCE_PERCENT) / 100),
    ASSET_PURCHASE_MATCH.AMOUNT_TOLERANCE_MIN_CENTS,
  );

  return (
    rows
      .map<AssetPurchaseCandidate>((row) => {
        const amortizableCostCents = amortizableCostOf(row);
        const transactionDate = toDateString(row.TransactionDate);

        return {
          transactionId: row.TransactionID,
          transactionDate,
          description: row.Description,
          vendorName: row.VendorName,
          categoryName: row.CategoryName,
          fullAmountCents: Number(row.FullAmountCents),
          amortizableCostCents,
          amountDeltaCents: Math.abs(amortizableCostCents - asset.baseCents),
          daysBeforeInService: Math.round((dayToUtcMs(asset.inServiceDate) - dayToUtcMs(transactionDate)) / MS_PER_DAY),
        };
      })
      .filter((candidate) => candidate.amountDeltaCents <= toleranceCents)
      // Amount first: it is the discriminating signal. The date only breaks ties, because everything
      // that reached this point is already inside the window
      .sort(
        (a, b) =>
          a.amountDeltaCents - b.amountDeltaCents ||
          Math.abs(a.daysBeforeInService) - Math.abs(b.daysBeforeInService) ||
          b.transactionId - a.transactionId,
      )
      .slice(0, ASSET_PURCHASE_MATCH.MAX_CANDIDATES)
  );
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
 * They are skipped at read time rather than by zeroing the transaction's DeductionPercent. The
 * reason used to be that the one column drove the deductible VAT too, so zeroing it erased the
 * purchase's input VAT from Modelo 303 and Modelo 390 — on the real Lenovo, 150,82 € of the
 * 158,74 € in casilla 29 of an already filed 4T 2025. "VatDeductionPercent" now separates the two
 * shares, so that particular trap is gone, but the read-time exclusion stays for what it always
 * also was: DeductionPercent states what the law allows on that expense, and the exclusion states
 * that its cost is arriving through the amortization instead. Rewriting the first to express the
 * second overwrites a fiscal datum of a period that may already have been filed, and it breaks the
 * moment the asset's link is undone.
 *
 * VAT on an asset is deducted in full in the quarter of purchase and is never amortized, so the
 * 303 and the 390 must keep seeing the purchase whatever the IRPF models do with it.
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
