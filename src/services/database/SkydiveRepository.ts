/**
 * BudgetGuard Skydive Repository
 * Database operations for skydive jumps, tunnel sessions, and stats (user-scoped)
 */

import {
  RECONCILE_ACTION,
  SHARED_EXPENSE,
  SKYDIVE_ACTIVITY_TYPE,
  SKYDIVE_CATEGORY,
  TRANSACTION_STATUS,
  TRANSACTION_TYPE,
} from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import type { ImportJumpRow, ImportTunnelRow } from '@/schemas/skydive';
import type { Category } from '@/types/finance';
import type {
  ImportResult,
  JumpsByType,
  JumpsByYear,
  ReconcileConsumptionResult,
  SkydiveActivityType,
  SkydiveJump,
  SkydiveStats,
  TunnelSession,
} from '@/types/skydive';
import { toDateString } from '@/utils/helpers';
import { getPool, query } from './connection';
import { getVoucherById } from './VoucherRepository';

// ============================================================
// Row types
// ============================================================

interface JumpRow {
  JumpID: number;
  JumpNumber: number;
  Title: string | null;
  JumpDate: Date;
  Dropzone: string | null;
  Canopy: string | null;
  Wingsuit: string | null;
  FreefallTimeSec: number | null;
  JumpType: string | null;
  Aircraft: string | null;
  ExitAltitudeFt: number | null;
  LandingDistanceM: number | null;
  Comment: string | null;
  PriceCents: number | null;
  TransactionID: number | null;
  VoucherID?: number | null;
  VoucherUnits?: number | string | null;
  CreatedAt: Date;
  UpdatedAt: Date;
}

interface TunnelRow {
  SessionID: number;
  SessionDate: Date;
  Location: string | null;
  SessionType: string | null;
  DurationSec: number;
  Notes: string | null;
  PriceCents: number | null;
  TransactionID: number | null;
  VoucherID?: number | null;
  VoucherUnits?: number | string | null;
  CreatedAt: Date;
  UpdatedAt: Date;
}

interface StatsRow {
  TotalJumps: number;
  TotalFreefallSec: number;
  UniqueDropzones: number;
  LastJumpDate: Date | null;
  TotalTunnelSec: number;
  TotalTunnelSessions: number;
}

interface JumpsByTypeRow {
  JumpType: string;
  Count: number;
  TotalFreefallSec: number;
}

interface JumpsByYearRow {
  Year: number;
  Count: number;
  TotalFreefallSec: number;
}

interface CategoryRow {
  CategoryID: number;
  Name: string;
  Type: string;
  Icon: string | null;
  Color: string | null;
  SortOrder: number;
  IsActive: boolean;
  ParentCategoryID: number | null;
  DefaultShared: boolean;
}

// ============================================================
// Transformers
// ============================================================

function toISOString(val: Date | string): string {
  if (typeof val === 'string') return val;
  return val.toISOString();
}

function rowToJump(row: JumpRow): SkydiveJump {
  return {
    jumpId: row.JumpID,
    jumpNumber: row.JumpNumber,
    title: row.Title,
    jumpDate: toDateString(row.JumpDate),
    dropzone: row.Dropzone,
    canopy: row.Canopy,
    wingsuit: row.Wingsuit,
    freefallTimeSec: row.FreefallTimeSec,
    jumpType: row.JumpType,
    aircraft: row.Aircraft,
    exitAltitudeFt: row.ExitAltitudeFt,
    landingDistanceM: row.LandingDistanceM,
    comment: row.Comment,
    priceCents: row.PriceCents,
    transactionId: row.TransactionID,
    voucherId: row.VoucherID ?? null,
    voucherUnits: row.VoucherUnits != null ? Number(row.VoucherUnits) : null,
    createdAt: toISOString(row.CreatedAt),
    updatedAt: toISOString(row.UpdatedAt),
  };
}

function rowToTunnelSession(row: TunnelRow): TunnelSession {
  return {
    sessionId: row.SessionID,
    sessionDate: toDateString(row.SessionDate),
    location: row.Location,
    sessionType: row.SessionType,
    durationSec: row.DurationSec,
    notes: row.Notes,
    priceCents: row.PriceCents,
    transactionId: row.TransactionID,
    voucherId: row.VoucherID ?? null,
    voucherUnits: row.VoucherUnits != null ? Number(row.VoucherUnits) : null,
    createdAt: toISOString(row.CreatedAt),
    updatedAt: toISOString(row.UpdatedAt),
  };
}

// ============================================================
// Subcategory Lookup
// ============================================================

/**
 * Find the CategoryID for a named subcategory under the "Paracaidismo" parent.
 * Returns null if the subcategory does not exist for this user.
 */
export async function findSkydiveSubcategoryId(subcategoryName: string, userId: number): Promise<number | null> {
  const result = await query<{ CategoryID: number }>(
    `SELECT sub."CategoryID"
     FROM "Categories" sub
     INNER JOIN "Categories" parent ON sub."ParentCategoryID" = parent."CategoryID"
     WHERE parent."Name" = $1 AND sub."Name" = $2
       AND parent."ParentCategoryID" IS NULL AND sub."UserID" = $3
     LIMIT 1`,
    [SKYDIVE_CATEGORY.NAME, subcategoryName, userId],
  );
  return result[0]?.CategoryID ?? null;
}

// ============================================================
// Voucher consumption
// ============================================================

interface VoucherConsumption {
  categoryId: number;
  priceCents: number;
  voucherUnits: number | null;
}

/**
 * Resolve how a jump/session paid with a voucher ("bono") consumes its balance.
 * - Unit vouchers (TotalUnits set): consume `units` (1 per jump, minutes for tunnel)
 *   and prorate the amount from the voucher's unit price.
 * - Monetary vouchers: deduct the manually entered price; no units consumed.
 * The resulting CategoryID is always the voucher's category so the linked
 * transaction matches vw_VoucherBalance.
 */
async function resolveVoucherConsumption(
  voucherId: number,
  opts: { units: number; manualPriceCents: number | null },
): Promise<VoucherConsumption> {
  const voucher = await getVoucherById(voucherId);
  if (!voucher) {
    throw new Error(`Voucher ${voucherId} not found`);
  }

  if (voucher.totalUnits != null && voucher.totalUnits > 0) {
    const unitPriceCents = voucher.totalAmountCents / voucher.totalUnits;
    return {
      categoryId: voucher.categoryId,
      priceCents: Math.round(unitPriceCents * opts.units),
      voucherUnits: opts.units,
    };
  }

  return {
    categoryId: voucher.categoryId,
    priceCents: opts.manualPriceCents ?? 0,
    voucherUnits: null,
  };
}

// Minimal structural client type shared by Neon and pg pool clients.
type TxClient = {
  query: <T = unknown>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
};

/**
 * Reconcile the expense transaction linked to a jump/session inside an open
 * transaction. Creates, updates, or deletes the transaction to match the desired
 * payment state and returns the resulting TransactionID (or null when none).
 * Deleting a transaction frees any voucher balance and nulls the FK via
 * ON DELETE SET NULL.
 */
async function syncLinkedExpenseTransaction(
  client: TxClient,
  opts: {
    existingTxId: number | null;
    shouldHaveTx: boolean;
    categoryId: number | null;
    priceCents: number | null;
    description: string;
    transactionDate: string;
    voucherId: number | null;
    voucherUnits: number | null;
    userId: number;
  },
): Promise<number | null> {
  const { existingTxId, shouldHaveTx } = opts;

  if (!shouldHaveTx) {
    if (existingTxId != null) {
      await client.query('DELETE FROM "Transactions" WHERE "TransactionID" = $1 AND "UserID" = $2', [
        existingTxId,
        opts.userId,
      ]);
    }
    return null;
  }

  if (existingTxId != null) {
    await client.query(
      `UPDATE "Transactions"
       SET "CategoryID" = $1, "AmountCents" = $2, "Description" = $3, "TransactionDate" = $4,
           "VoucherID" = $5, "VoucherUnits" = $6
       WHERE "TransactionID" = $7 AND "UserID" = $8`,
      [
        opts.categoryId,
        opts.priceCents,
        opts.description,
        opts.transactionDate,
        opts.voucherId,
        opts.voucherUnits,
        existingTxId,
        opts.userId,
      ],
    );
    return existingTxId;
  }

  const txResult = await client.query<{ TransactionID: number }>(
    `INSERT INTO "Transactions" ("CategoryID", "AmountCents", "Description", "TransactionDate", "Type", "SharedDivisor", "Status", "VoucherID", "VoucherUnits", "UserID")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING "TransactionID"`,
    [
      opts.categoryId,
      opts.priceCents,
      opts.description,
      opts.transactionDate,
      TRANSACTION_TYPE.EXPENSE,
      SHARED_EXPENSE.DEFAULT_DIVISOR,
      TRANSACTION_STATUS.PAID,
      opts.voucherId,
      opts.voucherUnits,
      opts.userId,
    ],
  );
  return txResult.rows[0]?.TransactionID ?? null;
}

// ============================================================
// Jump Queries (user-scoped)
// ============================================================

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function getAllJumps(filters?: {
  year?: number;
  dropzone?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResult<SkydiveJump>> {
  const userId = await getUserIdOrThrow();
  const conditions = ['"UserID" = $1'];
  const params: unknown[] = [userId];

  if (filters?.year) {
    params.push(filters.year);
    conditions.push(`EXTRACT(YEAR FROM "JumpDate")::INT = $${params.length}`);
  }

  if (filters?.dropzone) {
    params.push(filters.dropzone);
    conditions.push(`"Dropzone" = $${params.length}`);
  }

  const whereClause = conditions.join(' AND ');

  // Count total matching rows
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM "SkydiveJumps" WHERE ${whereClause}`,
    params,
  );
  const total = Number(countResult[0]?.count ?? 0);

  // Apply pagination
  const page = Math.max(1, filters?.page ?? 1);
  const limit = Math.min(10000, Math.max(1, filters?.limit ?? 10000));
  const offset = (page - 1) * limit;

  params.push(limit, offset);

  const result = await query<JumpRow>(
    `SELECT "JumpID", "JumpNumber", "Title", "JumpDate", "Dropzone", "Canopy", "Wingsuit",
            "FreefallTimeSec", "JumpType", "Aircraft", "ExitAltitudeFt", "LandingDistanceM",
            "Comment", "PriceCents", "TransactionID", "CreatedAt", "UpdatedAt",
            (SELECT t."VoucherID" FROM "Transactions" t WHERE t."TransactionID" = "SkydiveJumps"."TransactionID") AS "VoucherID",
            (SELECT t."VoucherUnits" FROM "Transactions" t WHERE t."TransactionID" = "SkydiveJumps"."TransactionID") AS "VoucherUnits"
     FROM "SkydiveJumps"
     WHERE ${whereClause}
     ORDER BY "JumpNumber" DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    items: result.map(rowToJump),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getJumpById(jumpId: number): Promise<SkydiveJump | null> {
  const userId = await getUserIdOrThrow();

  const result = await query<JumpRow>(
    `SELECT "JumpID", "JumpNumber", "Title", "JumpDate", "Dropzone", "Canopy", "Wingsuit",
            "FreefallTimeSec", "JumpType", "Aircraft", "ExitAltitudeFt", "LandingDistanceM",
            "Comment", "PriceCents", "TransactionID", "CreatedAt", "UpdatedAt",
            (SELECT t."VoucherID" FROM "Transactions" t WHERE t."TransactionID" = "SkydiveJumps"."TransactionID") AS "VoucherID",
            (SELECT t."VoucherUnits" FROM "Transactions" t WHERE t."TransactionID" = "SkydiveJumps"."TransactionID") AS "VoucherUnits"
     FROM "SkydiveJumps"
     WHERE "JumpID" = $1 AND "UserID" = $2`,
    [jumpId, userId],
  );

  const row = result[0];
  return row ? rowToJump(row) : null;
}

export async function createJump(data: {
  jumpNumber: number;
  title?: string | null;
  jumpDate: Date | string;
  dropzone?: string | null;
  canopy?: string | null;
  wingsuit?: string | null;
  freefallTimeSec?: number | null;
  jumpType?: string | null;
  aircraft?: string | null;
  exitAltitudeFt?: number | null;
  landingDistanceM?: number | null;
  comment?: string | null;
  priceCents?: number | null;
  voucherId?: number | null;
}): Promise<SkydiveJump> {
  const userId = await getUserIdOrThrow();

  // Resolve how the jump is paid: from a voucher (its own category) or as a cash
  // expense filed under the "Saltos" subcategory.
  const voucherId = data.voucherId ?? null;
  let effectivePriceCents = data.priceCents ?? null;
  let categoryId: number | null = null;
  let voucherUnits: number | null = null;
  if (voucherId != null) {
    const consumption = await resolveVoucherConsumption(voucherId, {
      units: 1,
      manualPriceCents: data.priceCents ?? null,
    });
    effectivePriceCents = consumption.priceCents;
    categoryId = consumption.categoryId;
    voucherUnits = consumption.voucherUnits;
  } else if (effectivePriceCents != null && effectivePriceCents > 0) {
    categoryId = await findSkydiveSubcategoryId(SKYDIVE_CATEGORY.SUBCATEGORY.JUMPS, userId);
  }

  const shouldLinkTransaction =
    voucherId != null || (effectivePriceCents != null && effectivePriceCents > 0 && categoryId != null);

  // Simple insert when no transaction linking is needed
  if (!shouldLinkTransaction) {
    const result = await query<JumpRow>(
      `INSERT INTO "SkydiveJumps" ("JumpNumber", "Title", "JumpDate", "Dropzone", "Canopy", "Wingsuit",
        "FreefallTimeSec", "JumpType", "Aircraft", "ExitAltitudeFt", "LandingDistanceM", "Comment", "PriceCents", "UserID")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING "JumpID", "JumpNumber", "Title", "JumpDate", "Dropzone", "Canopy", "Wingsuit",
         "FreefallTimeSec", "JumpType", "Aircraft", "ExitAltitudeFt", "LandingDistanceM",
         "Comment", "PriceCents", "TransactionID", "CreatedAt", "UpdatedAt"`,
      [
        data.jumpNumber,
        data.title ?? null,
        data.jumpDate,
        data.dropzone ?? null,
        data.canopy ?? null,
        data.wingsuit ?? null,
        data.freefallTimeSec ?? null,
        data.jumpType ?? null,
        data.aircraft ?? null,
        data.exitAltitudeFt ?? null,
        data.landingDistanceM ?? null,
        data.comment ?? null,
        effectivePriceCents,
        userId,
      ],
    );
    const row = result[0];
    if (!row) throw new Error('Failed to create jump');
    return rowToJump(row);
  }

  // Atomic transaction: insert jump + linked expense transaction
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const jumpResult = await client.query<JumpRow>(
      `INSERT INTO "SkydiveJumps" ("JumpNumber", "Title", "JumpDate", "Dropzone", "Canopy", "Wingsuit",
        "FreefallTimeSec", "JumpType", "Aircraft", "ExitAltitudeFt", "LandingDistanceM", "Comment", "PriceCents", "UserID")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING "JumpID", "JumpNumber", "Title", "JumpDate", "Dropzone", "Canopy", "Wingsuit",
         "FreefallTimeSec", "JumpType", "Aircraft", "ExitAltitudeFt", "LandingDistanceM",
         "Comment", "PriceCents", "TransactionID", "CreatedAt", "UpdatedAt"`,
      [
        data.jumpNumber,
        data.title ?? null,
        data.jumpDate,
        data.dropzone ?? null,
        data.canopy ?? null,
        data.wingsuit ?? null,
        data.freefallTimeSec ?? null,
        data.jumpType ?? null,
        data.aircraft ?? null,
        data.exitAltitudeFt ?? null,
        data.landingDistanceM ?? null,
        data.comment ?? null,
        effectivePriceCents,
        userId,
      ],
    );

    const jumpRow = jumpResult.rows[0];
    if (!jumpRow) throw new Error('Failed to create jump');

    const description = data.dropzone ? `Salto – ${data.dropzone}` : 'Salto paracaidismo';
    const jumpDate = typeof data.jumpDate === 'string' ? data.jumpDate : toDateString(data.jumpDate);

    const txResult = await client.query<{ TransactionID: number }>(
      `INSERT INTO "Transactions" ("CategoryID", "AmountCents", "Description", "TransactionDate", "Type", "SharedDivisor", "Status", "VoucherID", "VoucherUnits", "UserID")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING "TransactionID"`,
      [
        categoryId,
        effectivePriceCents,
        description,
        jumpDate,
        TRANSACTION_TYPE.EXPENSE,
        SHARED_EXPENSE.DEFAULT_DIVISOR,
        TRANSACTION_STATUS.PAID,
        voucherId,
        voucherUnits,
        userId,
      ],
    );

    const txId = txResult.rows[0]?.TransactionID;
    if (txId) {
      await client.query('UPDATE "SkydiveJumps" SET "TransactionID" = $1 WHERE "JumpID" = $2', [txId, jumpRow.JumpID]);
      jumpRow.TransactionID = txId;
    }
    jumpRow.VoucherID = voucherId;
    jumpRow.VoucherUnits = voucherUnits;

    await client.query('COMMIT');
    return rowToJump(jumpRow);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateJump(
  jumpId: number,
  data: {
    jumpNumber?: number;
    title?: string | null;
    jumpDate?: Date | string;
    dropzone?: string | null;
    canopy?: string | null;
    wingsuit?: string | null;
    freefallTimeSec?: number | null;
    jumpType?: string | null;
    aircraft?: string | null;
    exitAltitudeFt?: number | null;
    landingDistanceM?: number | null;
    comment?: string | null;
    priceCents?: number | null;
    voucherId?: number | null;
  },
): Promise<SkydiveJump | null> {
  const userId = await getUserIdOrThrow();

  const existing = await getJumpById(jumpId);
  if (!existing) return null;

  // Resolve the desired payment state: voucher (its own category) or cash expense
  // filed under the "Saltos" subcategory. A voucher consumes 1 unit per jump.
  const voucherId = data.voucherId ?? null;
  let effectivePriceCents = data.priceCents !== undefined ? data.priceCents : existing.priceCents;
  let categoryId: number | null = null;
  let voucherUnits: number | null = null;
  if (voucherId != null) {
    const consumption = await resolveVoucherConsumption(voucherId, {
      units: 1,
      manualPriceCents: effectivePriceCents,
    });
    effectivePriceCents = consumption.priceCents;
    categoryId = consumption.categoryId;
    voucherUnits = consumption.voucherUnits;
  } else if (effectivePriceCents != null && effectivePriceCents > 0) {
    categoryId = await findSkydiveSubcategoryId(SKYDIVE_CATEGORY.SUBCATEGORY.JUMPS, userId);
  }
  const shouldHaveTx =
    voucherId != null || (effectivePriceCents != null && effectivePriceCents > 0 && categoryId != null);

  // Scalar jump fields that can be updated (PriceCents is synced separately).
  const allowedFields: Record<string, string> = {
    jumpNumber: '"JumpNumber"',
    title: '"Title"',
    jumpDate: '"JumpDate"',
    dropzone: '"Dropzone"',
    canopy: '"Canopy"',
    wingsuit: '"Wingsuit"',
    freefallTimeSec: '"FreefallTimeSec"',
    jumpType: '"JumpType"',
    aircraft: '"Aircraft"',
    exitAltitudeFt: '"ExitAltitudeFt"',
    landingDistanceM: '"LandingDistanceM"',
    comment: '"Comment"',
  };

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Update scalar fields + keep PriceCents in sync with the effective amount.
    const fields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;
    Object.entries(data).forEach(([key, value]) => {
      const col = allowedFields[key];
      if (col) {
        fields.push(`${col} = $${paramIdx}`);
        params.push(value ?? null);
        paramIdx++;
      }
    });
    fields.push(`"PriceCents" = $${paramIdx}`);
    params.push(effectivePriceCents);
    paramIdx++;
    params.push(jumpId, userId);
    await client.query(
      `UPDATE "SkydiveJumps" SET ${fields.join(', ')}
       WHERE "JumpID" = $${paramIdx} AND "UserID" = $${paramIdx + 1}`,
      params,
    );

    // 2. Reconcile the linked expense transaction.
    const dropzone = data.dropzone !== undefined ? data.dropzone : existing.dropzone;
    const description = dropzone ? `Salto – ${dropzone}` : 'Salto paracaidismo';
    const jumpDateVal = data.jumpDate !== undefined ? data.jumpDate : existing.jumpDate;
    const transactionDate = typeof jumpDateVal === 'string' ? jumpDateVal : toDateString(jumpDateVal);

    const newTxId = await syncLinkedExpenseTransaction(client, {
      existingTxId: existing.transactionId,
      shouldHaveTx,
      categoryId,
      priceCents: effectivePriceCents,
      description,
      transactionDate,
      voucherId,
      voucherUnits,
      userId,
    });

    if (existing.transactionId == null && newTxId != null) {
      await client.query('UPDATE "SkydiveJumps" SET "TransactionID" = $1 WHERE "JumpID" = $2', [newTxId, jumpId]);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return getJumpById(jumpId);
}

export async function deleteJump(jumpId: number): Promise<boolean> {
  const userId = await getUserIdOrThrow();

  const result = await query('DELETE FROM "SkydiveJumps" WHERE "JumpID" = $1 AND "UserID" = $2', [jumpId, userId]);

  return (result as unknown as { length: number }).length >= 0;
}

export async function getDistinctDropzones(): Promise<string[]> {
  const userId = await getUserIdOrThrow();
  const result = await query<{ Dropzone: string }>(
    `SELECT DISTINCT "Dropzone"
     FROM "SkydiveJumps"
     WHERE "UserID" = $1 AND "Dropzone" IS NOT NULL AND "Dropzone" <> ''
     ORDER BY "Dropzone" ASC`,
    [userId],
  );
  return result.map((r) => r.Dropzone);
}

export async function bulkCreateJumps(rows: ImportJumpRow[]): Promise<ImportResult> {
  const userId = await getUserIdOrThrow();

  if (rows.length === 0) return { inserted: 0, skipped: 0, total: 0 };

  const values: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  rows.forEach((row) => {
    values.push(
      `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9}, $${paramIdx + 10}, $${paramIdx + 11}, $${paramIdx + 12})`,
    );
    params.push(
      row.jumpNumber,
      row.title ?? null,
      row.jumpDate,
      row.dropzone ?? null,
      row.canopy ?? null,
      row.wingsuit ?? null,
      row.freefallTimeSec ?? null,
      row.jumpType ?? null,
      row.aircraft ?? null,
      row.exitAltitudeFt ?? null,
      row.landingDistanceM ?? null,
      row.comment ?? null,
      userId,
    );
    paramIdx += 13;
  });

  const result = await query<{ JumpID: number }>(
    `INSERT INTO "SkydiveJumps" ("JumpNumber", "Title", "JumpDate", "Dropzone", "Canopy", "Wingsuit",
      "FreefallTimeSec", "JumpType", "Aircraft", "ExitAltitudeFt", "LandingDistanceM", "Comment", "UserID")
     VALUES ${values.join(', ')}
     ON CONFLICT ("JumpNumber", "UserID") DO NOTHING
     RETURNING "JumpID"`,
    params,
  );

  const inserted = result.length;
  return { inserted, skipped: rows.length - inserted, total: rows.length };
}

// ============================================================
// Tunnel Session Queries (user-scoped)
// ============================================================

export async function getAllTunnelSessions(filters?: {
  year?: number;
  location?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResult<TunnelSession>> {
  const userId = await getUserIdOrThrow();
  const conditions = ['"UserID" = $1'];
  const params: unknown[] = [userId];

  if (filters?.year) {
    params.push(filters.year);
    conditions.push(`EXTRACT(YEAR FROM "SessionDate")::INT = $${params.length}`);
  }

  if (filters?.location) {
    params.push(filters.location);
    conditions.push(`"Location" = $${params.length}`);
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM "TunnelSessions" WHERE ${whereClause}`,
    params,
  );
  const total = Number(countResult[0]?.count ?? 0);

  const page = Math.max(1, filters?.page ?? 1);
  const limit = Math.min(10000, Math.max(1, filters?.limit ?? 10000));
  const offset = (page - 1) * limit;

  params.push(limit, offset);

  const result = await query<TunnelRow>(
    `SELECT "SessionID", "SessionDate", "Location", "SessionType", "DurationSec",
            "Notes", "PriceCents", "TransactionID", "CreatedAt", "UpdatedAt",
            (SELECT t."VoucherID" FROM "Transactions" t WHERE t."TransactionID" = "TunnelSessions"."TransactionID") AS "VoucherID",
            (SELECT t."VoucherUnits" FROM "Transactions" t WHERE t."TransactionID" = "TunnelSessions"."TransactionID") AS "VoucherUnits"
     FROM "TunnelSessions"
     WHERE ${whereClause}
     ORDER BY "SessionDate" DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    items: result.map(rowToTunnelSession),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getTunnelSessionById(sessionId: number): Promise<TunnelSession | null> {
  const userId = await getUserIdOrThrow();

  const result = await query<TunnelRow>(
    `SELECT "SessionID", "SessionDate", "Location", "SessionType", "DurationSec",
            "Notes", "PriceCents", "TransactionID", "CreatedAt", "UpdatedAt",
            (SELECT t."VoucherID" FROM "Transactions" t WHERE t."TransactionID" = "TunnelSessions"."TransactionID") AS "VoucherID",
            (SELECT t."VoucherUnits" FROM "Transactions" t WHERE t."TransactionID" = "TunnelSessions"."TransactionID") AS "VoucherUnits"
     FROM "TunnelSessions"
     WHERE "SessionID" = $1 AND "UserID" = $2`,
    [sessionId, userId],
  );

  const row = result[0];
  return row ? rowToTunnelSession(row) : null;
}

export async function createTunnelSession(data: {
  sessionDate: Date | string;
  location?: string | null;
  sessionType?: string | null;
  durationSec: number;
  notes?: string | null;
  priceCents?: number | null;
  voucherId?: number | null;
}): Promise<TunnelSession> {
  const userId = await getUserIdOrThrow();

  // Resolve how the session is paid: from a voucher (its own category) or as a cash
  // expense filed under the "Túnel de viento" subcategory.
  const voucherId = data.voucherId ?? null;
  let effectivePriceCents = data.priceCents ?? null;
  let categoryId: number | null = null;
  let voucherUnits: number | null = null;
  if (voucherId != null) {
    const consumption = await resolveVoucherConsumption(voucherId, {
      units: data.durationSec / 60,
      manualPriceCents: data.priceCents ?? null,
    });
    effectivePriceCents = consumption.priceCents;
    categoryId = consumption.categoryId;
    voucherUnits = consumption.voucherUnits;
  } else if (effectivePriceCents != null && effectivePriceCents > 0) {
    categoryId = await findSkydiveSubcategoryId(SKYDIVE_CATEGORY.SUBCATEGORY.TUNNEL, userId);
  }

  const shouldLinkTransaction =
    voucherId != null || (effectivePriceCents != null && effectivePriceCents > 0 && categoryId != null);

  // Simple insert when no transaction linking is needed
  if (!shouldLinkTransaction) {
    const result = await query<TunnelRow>(
      `INSERT INTO "TunnelSessions" ("SessionDate", "Location", "SessionType", "DurationSec", "Notes", "PriceCents", "UserID")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING "SessionID", "SessionDate", "Location", "SessionType", "DurationSec",
         "Notes", "PriceCents", "TransactionID", "CreatedAt", "UpdatedAt"`,
      [
        data.sessionDate,
        data.location ?? null,
        data.sessionType ?? null,
        data.durationSec,
        data.notes ?? null,
        effectivePriceCents,
        userId,
      ],
    );
    const row = result[0];
    if (!row) throw new Error('Failed to create tunnel session');
    return rowToTunnelSession(row);
  }

  // Atomic transaction: insert session + linked expense transaction
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sessionResult = await client.query<TunnelRow>(
      `INSERT INTO "TunnelSessions" ("SessionDate", "Location", "SessionType", "DurationSec", "Notes", "PriceCents", "UserID")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING "SessionID", "SessionDate", "Location", "SessionType", "DurationSec",
         "Notes", "PriceCents", "TransactionID", "CreatedAt", "UpdatedAt"`,
      [
        data.sessionDate,
        data.location ?? null,
        data.sessionType ?? null,
        data.durationSec,
        data.notes ?? null,
        effectivePriceCents,
        userId,
      ],
    );

    const sessionRow = sessionResult.rows[0];
    if (!sessionRow) throw new Error('Failed to create tunnel session');

    const description = data.location ? `Túnel – ${data.location}` : 'Túnel de viento';
    const sessionDate = typeof data.sessionDate === 'string' ? data.sessionDate : toDateString(data.sessionDate);

    const txResult = await client.query<{ TransactionID: number }>(
      `INSERT INTO "Transactions" ("CategoryID", "AmountCents", "Description", "TransactionDate", "Type", "SharedDivisor", "Status", "VoucherID", "VoucherUnits", "UserID")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING "TransactionID"`,
      [
        categoryId,
        effectivePriceCents,
        description,
        sessionDate,
        TRANSACTION_TYPE.EXPENSE,
        SHARED_EXPENSE.DEFAULT_DIVISOR,
        TRANSACTION_STATUS.PAID,
        voucherId,
        voucherUnits,
        userId,
      ],
    );

    const txId = txResult.rows[0]?.TransactionID;
    if (txId) {
      await client.query('UPDATE "TunnelSessions" SET "TransactionID" = $1 WHERE "SessionID" = $2', [
        txId,
        sessionRow.SessionID,
      ]);
      sessionRow.TransactionID = txId;
    }
    sessionRow.VoucherID = voucherId;
    sessionRow.VoucherUnits = voucherUnits;

    await client.query('COMMIT');
    return rowToTunnelSession(sessionRow);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateTunnelSession(
  sessionId: number,
  data: {
    sessionDate?: Date | string;
    location?: string | null;
    sessionType?: string | null;
    durationSec?: number;
    notes?: string | null;
    priceCents?: number | null;
    voucherId?: number | null;
  },
): Promise<TunnelSession | null> {
  const userId = await getUserIdOrThrow();

  const existing = await getTunnelSessionById(sessionId);
  if (!existing) return null;

  // Resolve the desired payment state: voucher (its own category) or cash expense
  // filed under the "Túnel de viento" subcategory. A voucher consumes the minutes.
  const voucherId = data.voucherId ?? null;
  let effectivePriceCents = data.priceCents !== undefined ? data.priceCents : existing.priceCents;
  let categoryId: number | null = null;
  let voucherUnits: number | null = null;
  const durationSec = data.durationSec !== undefined ? data.durationSec : existing.durationSec;
  if (voucherId != null) {
    const consumption = await resolveVoucherConsumption(voucherId, {
      units: durationSec / 60,
      manualPriceCents: effectivePriceCents,
    });
    effectivePriceCents = consumption.priceCents;
    categoryId = consumption.categoryId;
    voucherUnits = consumption.voucherUnits;
  } else if (effectivePriceCents != null && effectivePriceCents > 0) {
    categoryId = await findSkydiveSubcategoryId(SKYDIVE_CATEGORY.SUBCATEGORY.TUNNEL, userId);
  }
  const shouldHaveTx =
    voucherId != null || (effectivePriceCents != null && effectivePriceCents > 0 && categoryId != null);

  // Scalar session fields that can be updated (PriceCents is synced separately).
  const allowedFields: Record<string, string> = {
    sessionDate: '"SessionDate"',
    location: '"Location"',
    sessionType: '"SessionType"',
    durationSec: '"DurationSec"',
    notes: '"Notes"',
  };

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Update scalar fields + keep PriceCents in sync with the effective amount.
    const fields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;
    Object.entries(data).forEach(([key, value]) => {
      const col = allowedFields[key];
      if (col) {
        fields.push(`${col} = $${paramIdx}`);
        params.push(value ?? null);
        paramIdx++;
      }
    });
    fields.push(`"PriceCents" = $${paramIdx}`);
    params.push(effectivePriceCents);
    paramIdx++;
    params.push(sessionId, userId);
    await client.query(
      `UPDATE "TunnelSessions" SET ${fields.join(', ')}
       WHERE "SessionID" = $${paramIdx} AND "UserID" = $${paramIdx + 1}`,
      params,
    );

    // 2. Reconcile the linked expense transaction.
    const location = data.location !== undefined ? data.location : existing.location;
    const description = location ? `Túnel – ${location}` : 'Túnel de viento';
    const sessionDateVal = data.sessionDate !== undefined ? data.sessionDate : existing.sessionDate;
    const transactionDate = typeof sessionDateVal === 'string' ? sessionDateVal : toDateString(sessionDateVal);

    const newTxId = await syncLinkedExpenseTransaction(client, {
      existingTxId: existing.transactionId,
      shouldHaveTx,
      categoryId,
      priceCents: effectivePriceCents,
      description,
      transactionDate,
      voucherId,
      voucherUnits,
      userId,
    });

    if (existing.transactionId == null && newTxId != null) {
      await client.query('UPDATE "TunnelSessions" SET "TransactionID" = $1 WHERE "SessionID" = $2', [
        newTxId,
        sessionId,
      ]);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return getTunnelSessionById(sessionId);
}

export async function deleteTunnelSession(sessionId: number): Promise<boolean> {
  const userId = await getUserIdOrThrow();

  const result = await query('DELETE FROM "TunnelSessions" WHERE "SessionID" = $1 AND "UserID" = $2', [
    sessionId,
    userId,
  ]);

  return (result as unknown as { length: number }).length >= 0;
}

export async function getDistinctTunnelLocations(): Promise<string[]> {
  const userId = await getUserIdOrThrow();
  const result = await query<{ Location: string }>(
    `SELECT DISTINCT "Location"
     FROM "TunnelSessions"
     WHERE "UserID" = $1 AND "Location" IS NOT NULL AND "Location" <> ''
     ORDER BY "Location" ASC`,
    [userId],
  );
  return result.map((r) => r.Location);
}

export async function bulkCreateTunnelSessions(
  rows: ImportTunnelRow[],
  tunnelCategoryId?: number | null,
): Promise<ImportResult> {
  const userId = await getUserIdOrThrow();

  if (rows.length === 0) return { inserted: 0, skipped: 0, total: 0 };

  const values: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  rows.forEach((row) => {
    values.push(
      `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6})`,
    );
    params.push(
      row.sessionDate,
      row.location ?? null,
      row.sessionType ?? null,
      row.durationSec,
      row.notes ?? null,
      row.priceCents ?? null,
      userId,
    );
    paramIdx += 7;
  });

  const result = await query<{
    SessionID: number;
    SessionDate: Date;
    PriceCents: number | null;
    Location: string | null;
    TransactionID: number | null;
    was_updated: boolean;
  }>(
    `INSERT INTO "TunnelSessions" ("SessionDate", "Location", "SessionType", "DurationSec", "Notes", "PriceCents", "UserID")
     VALUES ${values.join(', ')}
     ON CONFLICT ("SessionDate", "Location", "DurationSec", "UserID") DO UPDATE
       SET "PriceCents" = COALESCE(EXCLUDED."PriceCents", "TunnelSessions"."PriceCents"),
           "Notes" = COALESCE(EXCLUDED."Notes", "TunnelSessions"."Notes"),
           "SessionType" = COALESCE(EXCLUDED."SessionType", "TunnelSessions"."SessionType"),
           "UpdatedAt" = NOW()
     RETURNING "SessionID", "SessionDate", "PriceCents", "Location", "TransactionID",
       (xmax <> 0) AS was_updated`,
    params,
  );

  // Create linked transactions for sessions that have a price but no transaction yet
  if (tunnelCategoryId) {
    const sessionsNeedingTx = result.filter((r) => r.PriceCents != null && r.PriceCents > 0 && r.TransactionID == null);
    await Promise.all(
      sessionsNeedingTx.map(async (session) => {
        const description = session.Location ? `Túnel – ${session.Location}` : 'Túnel de viento';
        const txResult = await query<{ TransactionID: number }>(
          `INSERT INTO "Transactions" ("CategoryID", "AmountCents", "Description", "TransactionDate", "Type", "SharedDivisor", "Status", "UserID")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING "TransactionID"`,
          [
            tunnelCategoryId,
            session.PriceCents,
            description,
            toDateString(session.SessionDate),
            TRANSACTION_TYPE.EXPENSE,
            SHARED_EXPENSE.DEFAULT_DIVISOR,
            TRANSACTION_STATUS.PAID,
            userId,
          ],
        );
        const tx = txResult[0];
        if (tx) {
          await query('UPDATE "TunnelSessions" SET "TransactionID" = $1 WHERE "SessionID" = $2', [
            tx.TransactionID,
            session.SessionID,
          ]);
        }
      }),
    );
  }

  const inserted = result.filter((r) => !r.was_updated).length;
  const updated = result.filter((r) => r.was_updated).length;
  return { inserted, skipped: rows.length - result.length, updated, total: rows.length };
}

// ============================================================
// Stats (user-scoped, computed in SQL)
// ============================================================

export async function getSkydiveStats(): Promise<SkydiveStats> {
  const userId = await getUserIdOrThrow();

  const [statsResult, typeResult, yearResult, costResult] = await Promise.all([
    query<StatsRow>('SELECT * FROM "vw_SkydivingStats" WHERE "UserID" = $1', [userId]),
    query<JumpsByTypeRow>(
      'SELECT "JumpType", "Count", "TotalFreefallSec" FROM "vw_JumpsByType" WHERE "UserID" = $1 ORDER BY "Count" DESC',
      [userId],
    ),
    query<JumpsByYearRow>(
      'SELECT "Year", "Count", "TotalFreefallSec" FROM "vw_JumpsByYear" WHERE "UserID" = $1 ORDER BY "Year" DESC',
      [userId],
    ),
    query<{ TotalCostCents: number }>(
      `SELECT COALESCE(SUM(t."AmountCents"), 0) AS "TotalCostCents"
       FROM "TunnelSessions" ts
       INNER JOIN "Transactions" t ON ts."TransactionID" = t."TransactionID"
       WHERE ts."UserID" = $1`,
      [userId],
    ),
  ]);

  const stats = statsResult[0];

  const jumpsByType: JumpsByType[] = typeResult.map((r) => ({
    jumpType: r.JumpType,
    count: Number(r.Count),
    totalFreefallSec: Number(r.TotalFreefallSec),
  }));

  const jumpsByYear: JumpsByYear[] = yearResult.map((r) => ({
    year: r.Year,
    count: Number(r.Count),
    totalFreefallSec: Number(r.TotalFreefallSec),
  }));

  const totalCostCents = Number(costResult[0]?.TotalCostCents ?? 0);

  if (!stats) {
    return {
      totalJumps: 0,
      totalFreefallSec: 0,
      uniqueDropzones: 0,
      lastJumpDate: null,
      totalTunnelSec: 0,
      totalTunnelSessions: 0,
      totalCostCents,
      jumpsByType,
      jumpsByYear,
    };
  }

  return {
    totalJumps: Number(stats.TotalJumps),
    totalFreefallSec: Number(stats.TotalFreefallSec),
    uniqueDropzones: Number(stats.UniqueDropzones),
    lastJumpDate: stats.LastJumpDate ? toDateString(stats.LastJumpDate) : null,
    totalTunnelSec: Number(stats.TotalTunnelSec),
    totalTunnelSessions: Number(stats.TotalTunnelSessions),
    totalCostCents,
    jumpsByType,
    jumpsByYear,
  };
}

// ============================================================
// Skydive Categories (subcategories of Paracaidismo)
// ============================================================

export async function getSkydiveCategories(): Promise<Category[]> {
  const userId = await getUserIdOrThrow();

  const result = await query<CategoryRow>(
    `SELECT sub."CategoryID", sub."Name", sub."Type", sub."Icon", sub."Color",
           sub."SortOrder", sub."IsActive", sub."ParentCategoryID", sub."DefaultShared"
    FROM "Categories" sub
    INNER JOIN "Categories" parent ON sub."ParentCategoryID" = parent."CategoryID"
    WHERE parent."Name" = $1
      AND parent."Type" = 'expense'
      AND parent."ParentCategoryID" IS NULL
      AND sub."IsActive" = TRUE
      AND sub."UserID" = $2
    ORDER BY sub."SortOrder"`,
    [SKYDIVE_CATEGORY.NAME, userId],
  );

  return result.map(
    (row): Category => ({
      categoryId: row.CategoryID,
      name: row.Name,
      type: TRANSACTION_TYPE.EXPENSE,
      icon: row.Icon,
      color: row.Color,
      sortOrder: row.SortOrder,
      isActive: Boolean(row.IsActive),
      parentCategoryId: row.ParentCategoryID,
      defaultShared: Boolean(row.DefaultShared),
      defaultVatPercent: null,
      defaultDeductionPercent: null,
    }),
  );
}

// ============================================================
// Voucher Consumption Reconciliation (user-scoped)
// ============================================================

// Transaction Description prefixes written by createJump/createTunnelSession.
// Used to recover the Dropzone/Location when reconciling a consumption.
const JUMP_DESCRIPTION_PREFIX = 'Salto – ';
const TUNNEL_DESCRIPTION_PREFIX = 'Túnel – ';

interface ConsumptionTxRow {
  TransactionID: number;
  VoucherID: number | null;
  VoucherUnits: number | string | null;
  AmountCents: number;
  Description: string | null;
  TransactionDate: Date | string;
  CategoryName: string;
  ParentCategoryName: string | null;
}

/**
 * Recover the free-text label (Dropzone/Location) embedded in a consumption's
 * Description, e.g. "Salto – Empuriabrava" -> "Empuriabrava". Returns null when
 * the description does not match the expected prefix.
 */
function parseActivityLabel(description: string | null, prefix: string): string | null {
  if (!description || !description.startsWith(prefix)) return null;
  const label = description.slice(prefix.length).trim();
  return label.length > 0 ? label : null;
}

/**
 * Given a voucher, return the consumption transactions that have NO linked
 * skydiving activity of the matching type. Returns null when the voucher is not
 * a skydive voucher (its category's parent is not "Paracaidismo"), so callers
 * can skip the reconcile affordance entirely.
 */
export async function getUnlinkedSkydiveConsumptions(
  voucherId: number,
): Promise<{ transactionIds: number[]; activityType: SkydiveActivityType } | null> {
  const userId = await getUserIdOrThrow();

  const categoryRows = await query<{ CategoryName: string; ParentCategoryName: string | null }>(
    `SELECT c."Name" AS "CategoryName", parent."Name" AS "ParentCategoryName"
     FROM "Vouchers" v
     INNER JOIN "Categories" c ON v."CategoryID" = c."CategoryID"
     LEFT JOIN "Categories" parent ON c."ParentCategoryID" = parent."CategoryID"
     WHERE v."VoucherID" = $1 AND v."UserID" = $2`,
    [voucherId, userId],
  );

  const categoryRow = categoryRows[0];
  if (!categoryRow || categoryRow.ParentCategoryName !== SKYDIVE_CATEGORY.NAME) return null;

  const activityType =
    categoryRow.CategoryName === SKYDIVE_CATEGORY.SUBCATEGORY.TUNNEL
      ? SKYDIVE_ACTIVITY_TYPE.TUNNEL
      : SKYDIVE_ACTIVITY_TYPE.JUMP;

  // Activity table is a controlled constant (never user input), safe to interpolate.
  const activityTable = activityType === SKYDIVE_ACTIVITY_TYPE.TUNNEL ? '"TunnelSessions"' : '"SkydiveJumps"';

  const rows = await query<{ TransactionID: number }>(
    `SELECT t."TransactionID"
     FROM "Transactions" t
     WHERE t."VoucherID" = $1 AND t."UserID" = $2
       AND NOT EXISTS (
         SELECT 1 FROM ${activityTable} a
         WHERE a."TransactionID" = t."TransactionID" AND a."UserID" = t."UserID"
       )
     ORDER BY t."TransactionID"`,
    [voucherId, userId],
  );

  return { transactionIds: rows.map((r) => r.TransactionID), activityType };
}

/**
 * Reconcile a voucher consumption transaction to a skydiving activity (Option A,
 * link-or-create). Idempotent: if the transaction is already linked to an
 * activity of its type, no change is made. Otherwise an existing unlinked
 * activity on the same date is linked, or a new activity is created against the
 * SAME transaction (never re-consuming the voucher). All steps run in one
 * BEGIN/COMMIT. Throws when the transaction is missing or is not a skydive
 * voucher consumption (the route maps that to 400/500).
 */
export async function reconcileConsumptionToActivity(transactionId: number): Promise<ReconcileConsumptionResult> {
  const userId = await getUserIdOrThrow();

  // 1. Load + validate the consumption transaction (with category + parent).
  const txRows = await query<ConsumptionTxRow>(
    `SELECT t."TransactionID", t."VoucherID", t."VoucherUnits", t."AmountCents",
            t."Description", t."TransactionDate",
            c."Name" AS "CategoryName", parent."Name" AS "ParentCategoryName"
     FROM "Transactions" t
     INNER JOIN "Categories" c ON t."CategoryID" = c."CategoryID"
     LEFT JOIN "Categories" parent ON c."ParentCategoryID" = parent."CategoryID"
     WHERE t."TransactionID" = $1 AND t."UserID" = $2`,
    [transactionId, userId],
  );

  const tx = txRows[0];
  if (!tx) throw new Error(`Transaction ${transactionId} not found`);
  if (tx.VoucherID == null) throw new Error(`Transaction ${transactionId} is not a voucher consumption`);
  if (tx.ParentCategoryName !== SKYDIVE_CATEGORY.NAME) {
    throw new Error(`Transaction ${transactionId} is not a skydiving consumption`);
  }

  const isTunnel = tx.CategoryName === SKYDIVE_CATEGORY.SUBCATEGORY.TUNNEL;
  const isJump = tx.CategoryName === SKYDIVE_CATEGORY.SUBCATEGORY.JUMPS;
  if (!isTunnel && !isJump) {
    throw new Error(`Transaction ${transactionId} category "${tx.CategoryName}" is not reconcilable`);
  }

  // 2. Resolve the activity type and shared derived values.
  const activityType = isTunnel ? SKYDIVE_ACTIVITY_TYPE.TUNNEL : SKYDIVE_ACTIVITY_TYPE.JUMP;
  const transactionDate = toDateString(tx.TransactionDate);
  const amountCents = tx.AmountCents;
  const voucherUnits = tx.VoucherUnits != null ? Number(tx.VoucherUnits) : 0;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let result: ReconcileConsumptionResult;

    if (isTunnel) {
      // 3. Already linked to a tunnel session? Idempotent no-op.
      const linked = await client.query<{ SessionID: number }>(
        'SELECT "SessionID" FROM "TunnelSessions" WHERE "TransactionID" = $1 AND "UserID" = $2 LIMIT 1',
        [transactionId, userId],
      );
      const linkedId = linked.rows[0]?.SessionID;
      if (linkedId != null) {
        result = { activityType, action: RECONCILE_ACTION.ALREADY_LINKED, id: linkedId };
      } else {
        // 4. Link an existing unlinked session on the same date, if any.
        const existing = await client.query<{ SessionID: number }>(
          `SELECT "SessionID" FROM "TunnelSessions"
           WHERE "UserID" = $1 AND "SessionDate" = $2::date AND "TransactionID" IS NULL
           ORDER BY "SessionID" LIMIT 1`,
          [userId, transactionDate],
        );
        const existingId = existing.rows[0]?.SessionID;
        if (existingId != null) {
          await client.query(
            `UPDATE "TunnelSessions"
             SET "TransactionID" = $1, "PriceCents" = COALESCE("PriceCents", $2), "UpdatedAt" = NOW()
             WHERE "SessionID" = $3 AND "UserID" = $4`,
            [transactionId, amountCents, existingId, userId],
          );
          result = { activityType, action: RECONCILE_ACTION.LINKED, id: existingId };
        } else {
          // 5. Create a new session linked to the existing transaction.
          const location = parseActivityLabel(tx.Description, TUNNEL_DESCRIPTION_PREFIX);
          const durationSec = voucherUnits > 0 ? Math.round(voucherUnits * 60) : 0;
          const created = await client.query<{ SessionID: number }>(
            `INSERT INTO "TunnelSessions" ("SessionDate", "Location", "DurationSec", "PriceCents", "TransactionID", "UserID")
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING "SessionID"`,
            [transactionDate, location, durationSec, amountCents, transactionId, userId],
          );
          const createdId = created.rows[0]?.SessionID;
          if (createdId == null) throw new Error('Failed to create tunnel session');
          result = { activityType, action: RECONCILE_ACTION.CREATED, id: createdId };
        }
      }
    } else {
      // 3. Already linked to a jump? Idempotent no-op.
      const linked = await client.query<{ JumpID: number }>(
        'SELECT "JumpID" FROM "SkydiveJumps" WHERE "TransactionID" = $1 AND "UserID" = $2 LIMIT 1',
        [transactionId, userId],
      );
      const linkedId = linked.rows[0]?.JumpID;
      if (linkedId != null) {
        result = { activityType, action: RECONCILE_ACTION.ALREADY_LINKED, id: linkedId };
      } else {
        // 4. Link an existing unlinked jump on the same date, if any.
        const existing = await client.query<{ JumpID: number }>(
          `SELECT "JumpID" FROM "SkydiveJumps"
           WHERE "UserID" = $1 AND "JumpDate" = $2::date AND "TransactionID" IS NULL
           ORDER BY "JumpID" LIMIT 1`,
          [userId, transactionDate],
        );
        const existingId = existing.rows[0]?.JumpID;
        if (existingId != null) {
          await client.query(
            `UPDATE "SkydiveJumps"
             SET "TransactionID" = $1, "PriceCents" = COALESCE("PriceCents", $2), "UpdatedAt" = NOW()
             WHERE "JumpID" = $3 AND "UserID" = $4`,
            [transactionId, amountCents, existingId, userId],
          );
          result = { activityType, action: RECONCILE_ACTION.LINKED, id: existingId };
        } else {
          // 5. Create a new jump linked to the existing transaction.
          const dropzone = parseActivityLabel(tx.Description, JUMP_DESCRIPTION_PREFIX);
          const nextNumber = await client.query<{ NextNumber: number }>(
            'SELECT COALESCE(MAX("JumpNumber"), 0) + 1 AS "NextNumber" FROM "SkydiveJumps" WHERE "UserID" = $1',
            [userId],
          );
          const jumpNumber = Number(nextNumber.rows[0]?.NextNumber ?? 1);
          const created = await client.query<{ JumpID: number }>(
            `INSERT INTO "SkydiveJumps" ("JumpNumber", "JumpDate", "Dropzone", "PriceCents", "TransactionID", "UserID")
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING "JumpID"`,
            [jumpNumber, transactionDate, dropzone, amountCents, transactionId, userId],
          );
          const createdId = created.rows[0]?.JumpID;
          if (createdId == null) throw new Error('Failed to create jump');
          result = { activityType, action: RECONCILE_ACTION.CREATED, id: createdId };
        }
      }
    }

    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
