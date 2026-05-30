/**
 * BudgetGuard Voucher ("bono") Repository
 * Database operations for prepaid vouchers (PostgreSQL, user-scoped).
 * Reads balance from vw_VoucherBalance (consumed/remaining computed in SQL).
 */

import { getUserIdOrThrow } from '@/libs/auth';
import type { Voucher } from '@/types/finance';
import { toDateString } from '@/utils/helpers';
import { query } from './connection';

interface VoucherRow {
  VoucherID: number;
  CategoryID: number;
  CategoryName: string | null;
  CategoryIcon: string | null;
  CategoryColor: string | null;
  Description: string | null;
  TotalAmountCents: number | string;
  TotalUnits: number | string | null;
  UnitLabel: string | null;
  PurchaseDate: Date | string;
  ExpiryDate: Date | string | null;
  ConsumedCents: number | string;
  RemainingCents: number | string;
  ConsumedUnits: number | string;
  ConsumptionCount: number | string;
  CreatedAt: Date | string;
  UpdatedAt: Date | string;
}

/**
 * Convert a Date or string value to an ISO string
 */
function toISOString(val: Date | string): string {
  if (typeof val === 'string') return val;
  return val.toISOString();
}

/**
 * Transform a vw_VoucherBalance row to the Voucher domain type.
 * PostgreSQL returns SUM()/NUMERIC columns as strings → coerce to number.
 */
function rowToVoucher(row: VoucherRow): Voucher {
  return {
    voucherId: row.VoucherID,
    categoryId: row.CategoryID,
    categoryName: row.CategoryName,
    categoryIcon: row.CategoryIcon,
    categoryColor: row.CategoryColor,
    description: row.Description,
    totalAmountCents: Number(row.TotalAmountCents),
    totalUnits: row.TotalUnits != null ? Number(row.TotalUnits) : null,
    unitLabel: row.UnitLabel,
    purchaseDate: toDateString(row.PurchaseDate),
    expiryDate: row.ExpiryDate != null ? toDateString(row.ExpiryDate) : null,
    consumedCents: Number(row.ConsumedCents),
    remainingCents: Number(row.RemainingCents),
    consumedUnits: Number(row.ConsumedUnits),
    consumptionCount: Number(row.ConsumptionCount),
    createdAt: toISOString(row.CreatedAt),
    updatedAt: toISOString(row.UpdatedAt),
  };
}

const SELECT_VOUCHER = `
  SELECT
    v."VoucherID", v."CategoryID", c."Name" AS "CategoryName",
    c."Icon" AS "CategoryIcon", c."Color" AS "CategoryColor",
    v."Description", v."TotalAmountCents", v."TotalUnits", v."UnitLabel",
    v."PurchaseDate", v."ExpiryDate",
    v."ConsumedCents", v."RemainingCents", v."ConsumedUnits", v."ConsumptionCount",
    v."CreatedAt", v."UpdatedAt"
  FROM "vw_VoucherBalance" v
  INNER JOIN "Categories" c ON v."CategoryID" = c."CategoryID"
`;

/**
 * List all vouchers with balance for the current user.
 * Active first (remaining desc), then depleted; newest purchase first within each.
 */
export async function getVouchers(): Promise<Voucher[]> {
  const userId = await getUserIdOrThrow();

  const rows = await query<VoucherRow>(
    `${SELECT_VOUCHER}
    WHERE v."UserID" = $1
    ORDER BY (v."RemainingCents" > 0) DESC, v."PurchaseDate" DESC, v."VoucherID" DESC`,
    [userId],
  );

  return rows.map(rowToVoucher);
}

/**
 * Get a single voucher with balance (verifies ownership)
 */
export async function getVoucherById(voucherId: number): Promise<Voucher | null> {
  const userId = await getUserIdOrThrow();

  const rows = await query<VoucherRow>(
    `${SELECT_VOUCHER}
    WHERE v."VoucherID" = $1 AND v."UserID" = $2`,
    [voucherId, userId],
  );

  const row = rows[0];
  return row ? rowToVoucher(row) : null;
}

/**
 * Create a new voucher (user-scoped). Amount is stored in cents.
 */
export async function createVoucher(data: {
  categoryId: number;
  description?: string | null;
  totalAmountCents: number;
  totalUnits?: number | null;
  unitLabel?: string | null;
  purchaseDate: Date;
  expiryDate?: Date | null;
}): Promise<Voucher> {
  const userId = await getUserIdOrThrow();

  const rows = await query<{ VoucherID: number }>(
    `
    INSERT INTO "Vouchers" (
      "CategoryID", "Description", "TotalAmountCents", "TotalUnits",
      "UnitLabel", "PurchaseDate", "ExpiryDate", "UserID"
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING "VoucherID"
  `,
    [
      data.categoryId,
      data.description ?? null,
      data.totalAmountCents,
      data.totalUnits ?? null,
      data.unitLabel ?? null,
      toDateString(data.purchaseDate),
      data.expiryDate ? toDateString(data.expiryDate) : null,
      userId,
    ],
  );

  const insertedId = rows[0]?.VoucherID;
  if (!insertedId) {
    throw new Error('Failed to create voucher');
  }

  const voucher = await getVoucherById(insertedId);
  if (!voucher) {
    throw new Error('Failed to retrieve created voucher');
  }

  return voucher;
}

/**
 * Update an existing voucher (verifies ownership). Amount is stored in cents.
 */
export async function updateVoucher(
  voucherId: number,
  data: Partial<{
    categoryId: number;
    description: string | null;
    totalAmountCents: number;
    totalUnits: number | null;
    unitLabel: string | null;
    purchaseDate: Date;
    expiryDate: Date | null;
  }>,
): Promise<Voucher | null> {
  const userId = await getUserIdOrThrow();

  const updates: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (data.categoryId !== undefined) {
    updates.push(`"CategoryID" = $${paramIndex++}`);
    params.push(data.categoryId);
  }
  if (data.description !== undefined) {
    updates.push(`"Description" = $${paramIndex++}`);
    params.push(data.description);
  }
  if (data.totalAmountCents !== undefined) {
    updates.push(`"TotalAmountCents" = $${paramIndex++}`);
    params.push(data.totalAmountCents);
  }
  if (data.totalUnits !== undefined) {
    updates.push(`"TotalUnits" = $${paramIndex++}`);
    params.push(data.totalUnits);
  }
  if (data.unitLabel !== undefined) {
    updates.push(`"UnitLabel" = $${paramIndex++}`);
    params.push(data.unitLabel);
  }
  if (data.purchaseDate !== undefined) {
    updates.push(`"PurchaseDate" = $${paramIndex++}`);
    params.push(toDateString(data.purchaseDate));
  }
  if (data.expiryDate !== undefined) {
    updates.push(`"ExpiryDate" = $${paramIndex++}`);
    params.push(data.expiryDate ? toDateString(data.expiryDate) : null);
  }

  if (updates.length === 0) {
    return getVoucherById(voucherId);
  }

  params.push(voucherId);
  params.push(userId);

  await query(
    `
    UPDATE "Vouchers"
    SET ${updates.join(', ')}
    WHERE "VoucherID" = $${paramIndex} AND "UserID" = $${paramIndex + 1}
  `,
    params,
  );

  return getVoucherById(voucherId);
}

/**
 * Delete a voucher (verifies ownership). Linked transactions keep their data;
 * their VoucherID is set to NULL by the FK ON DELETE SET NULL constraint.
 */
export async function deleteVoucher(voucherId: number): Promise<boolean> {
  const userId = await getUserIdOrThrow();

  const rows = await query<{ VoucherID: number }>(
    `
    DELETE FROM "Vouchers"
    WHERE "VoucherID" = $1 AND "UserID" = $2
    RETURNING "VoucherID"
  `,
    [voucherId, userId],
  );

  return rows.length > 0;
}
