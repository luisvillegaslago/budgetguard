/**
 * BudgetGuard Skydive Repository
 * Database operations for skydive jumps, tunnel sessions, and stats (user-scoped)
 */

import { SKYDIVE_CATEGORY, TRANSACTION_TYPE } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import type { ImportJumpRow, ImportTunnelRow } from '@/schemas/skydive';
import type { Category } from '@/types/finance';
import type { ImportResult, JumpsByType, JumpsByYear, SkydiveJump, SkydiveStats, TunnelSession } from '@/types/skydive';
import { toDateString } from '@/utils/helpers';
import { query } from './connection';

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
    createdAt: toISOString(row.CreatedAt),
    updatedAt: toISOString(row.UpdatedAt),
  };
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
  const limit = Math.min(100, Math.max(1, filters?.limit ?? 50));
  const offset = (page - 1) * limit;

  params.push(limit, offset);

  const result = await query<JumpRow>(
    `SELECT "JumpID", "JumpNumber", "Title", "JumpDate", "Dropzone", "Canopy", "Wingsuit",
            "FreefallTimeSec", "JumpType", "Aircraft", "ExitAltitudeFt", "LandingDistanceM",
            "Comment", "PriceCents", "TransactionID", "CreatedAt", "UpdatedAt"
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
            "Comment", "PriceCents", "TransactionID", "CreatedAt", "UpdatedAt"
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
}): Promise<SkydiveJump> {
  const userId = await getUserIdOrThrow();

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
      data.priceCents ?? null,
      userId,
    ],
  );

  const row = result[0];
  if (!row) throw new Error('Failed to create jump');
  return rowToJump(row);
}

export async function updateJump(jumpId: number, data: Record<string, unknown>): Promise<SkydiveJump | null> {
  const userId = await getUserIdOrThrow();

  const fields: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

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
    priceCents: '"PriceCents"',
  };

  Object.entries(data).forEach(([key, value]) => {
    const col = allowedFields[key];
    if (col) {
      fields.push(`${col} = $${paramIdx}`);
      params.push(value ?? null);
      paramIdx++;
    }
  });

  if (fields.length === 0) return getJumpById(jumpId);

  params.push(jumpId, userId);

  const result = await query<JumpRow>(
    `UPDATE "SkydiveJumps" SET ${fields.join(', ')}
     WHERE "JumpID" = $${paramIdx} AND "UserID" = $${paramIdx + 1}
     RETURNING "JumpID", "JumpNumber", "Title", "JumpDate", "Dropzone", "Canopy", "Wingsuit",
       "FreefallTimeSec", "JumpType", "Aircraft", "ExitAltitudeFt", "LandingDistanceM",
       "Comment", "PriceCents", "TransactionID", "CreatedAt", "UpdatedAt"`,
    params,
  );

  const row = result[0];
  return row ? rowToJump(row) : null;
}

export async function deleteJump(jumpId: number): Promise<boolean> {
  const userId = await getUserIdOrThrow();

  const result = await query('DELETE FROM "SkydiveJumps" WHERE "JumpID" = $1 AND "UserID" = $2', [jumpId, userId]);

  return (result as unknown as { length: number }).length >= 0;
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
  const limit = Math.min(100, Math.max(1, filters?.limit ?? 50));
  const offset = (page - 1) * limit;

  params.push(limit, offset);

  const result = await query<TunnelRow>(
    `SELECT "SessionID", "SessionDate", "Location", "SessionType", "DurationSec",
            "Notes", "PriceCents", "TransactionID", "CreatedAt", "UpdatedAt"
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

export async function createTunnelSession(data: {
  sessionDate: Date | string;
  location?: string | null;
  sessionType?: string | null;
  durationSec: number;
  notes?: string | null;
  priceCents?: number | null;
}): Promise<TunnelSession> {
  const userId = await getUserIdOrThrow();

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
      data.priceCents ?? null,
      userId,
    ],
  );

  const row = result[0];
  if (!row) throw new Error('Failed to create tunnel session');
  return rowToTunnelSession(row);
}

export async function updateTunnelSession(
  sessionId: number,
  data: Record<string, unknown>,
): Promise<TunnelSession | null> {
  const userId = await getUserIdOrThrow();

  const fields: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  const allowedFields: Record<string, string> = {
    sessionDate: '"SessionDate"',
    location: '"Location"',
    sessionType: '"SessionType"',
    durationSec: '"DurationSec"',
    notes: '"Notes"',
    priceCents: '"PriceCents"',
  };

  Object.entries(data).forEach(([key, value]) => {
    const col = allowedFields[key];
    if (col) {
      fields.push(`${col} = $${paramIdx}`);
      params.push(value ?? null);
      paramIdx++;
    }
  });

  if (fields.length === 0) return null;

  params.push(sessionId, userId);

  const result = await query<TunnelRow>(
    `UPDATE "TunnelSessions" SET ${fields.join(', ')}
     WHERE "SessionID" = $${paramIdx} AND "UserID" = $${paramIdx + 1}
     RETURNING "SessionID", "SessionDate", "Location", "SessionType", "DurationSec",
       "Notes", "PriceCents", "TransactionID", "CreatedAt", "UpdatedAt"`,
    params,
  );

  const row = result[0];
  return row ? rowToTunnelSession(row) : null;
}

export async function deleteTunnelSession(sessionId: number): Promise<boolean> {
  const userId = await getUserIdOrThrow();

  const result = await query('DELETE FROM "TunnelSessions" WHERE "SessionID" = $1 AND "UserID" = $2', [
    sessionId,
    userId,
  ]);

  return (result as unknown as { length: number }).length >= 0;
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
          `INSERT INTO "Transactions" ("CategoryID", "AmountCents", "Description", "TransactionDate", "Type", "SharedDivisor", "UserID")
           VALUES ($1, $2, $3, $4, 'expense', 1, $5)
           RETURNING "TransactionID"`,
          [tunnelCategoryId, session.PriceCents, description, toDateString(session.SessionDate), userId],
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
