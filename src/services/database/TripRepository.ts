/**
 * BudgetGuard Trip Repository
 * Database operations for trips and trip expenses (user-scoped)
 */

import { TRANSACTION_TYPE } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import type { Category, Transaction, Trip, TripCategorySummary, TripDetail, TripDisplay } from '@/types/finance';
import { toDateString } from '@/utils/helpers';
import { getPool, query } from './connection';

function toISOString(val: Date | string): string {
  if (typeof val === 'string') return val;
  return val.toISOString();
}

// ============================================================
// Row types
// ============================================================

interface TripRow {
  TripID: number;
  Name: string;
  CreatedAt: Date;
  UpdatedAt: Date;
}

interface TripAggregateRow extends TripRow {
  ExpenseCount: number;
  TotalCents: number;
  StartDate: Date | null;
  EndDate: Date | null;
}

interface TripCategorySummaryRow {
  TripID: number;
  CategoryID: number;
  CategoryName: string;
  CategoryIcon: string | null;
  CategoryColor: string | null;
  TotalCents: number;
  Count: number;
}

interface TransactionRow {
  TransactionID: number;
  CategoryID: number;
  CategoryName: string;
  CategoryIcon: string | null;
  CategoryColor: string | null;
  ParentCategoryID: number | null;
  ParentCategoryName: string | null;
  AmountCents: number;
  Description: string | null;
  TransactionDate: Date;
  Type: string;
  SharedDivisor: number;
  OriginalAmountCents: number | null;
  RecurringExpenseID: number | null;
  TransactionGroupID: number | null;
  TripID: number | null;
  TripName: string | null;
  CreatedAt: Date;
  UpdatedAt: Date;
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

function rowToTrip(row: TripRow): Trip {
  return {
    tripId: row.TripID,
    name: row.Name,
    createdAt: toISOString(row.CreatedAt),
    updatedAt: toISOString(row.UpdatedAt),
  };
}

function rowToTransaction(row: TransactionRow): Transaction {
  return {
    transactionId: row.TransactionID,
    categoryId: row.CategoryID,
    category: {
      categoryId: row.CategoryID,
      name: row.CategoryName,
      type: TRANSACTION_TYPE.EXPENSE,
      icon: row.CategoryIcon,
      color: row.CategoryColor,
      sortOrder: 0,
      isActive: true,
      parentCategoryId: row.ParentCategoryID,
      defaultShared: false,
      defaultVatPercent: null,
      defaultDeductionPercent: null,
    },
    parentCategory: row.ParentCategoryID
      ? { categoryId: row.ParentCategoryID, name: row.ParentCategoryName ?? '' }
      : null,
    amountCents: row.AmountCents,
    description: row.Description,
    transactionDate: toDateString(row.TransactionDate),
    type: TRANSACTION_TYPE.EXPENSE,
    sharedDivisor: row.SharedDivisor,
    originalAmountCents: row.OriginalAmountCents,
    recurringExpenseId: row.RecurringExpenseID,
    transactionGroupId: row.TransactionGroupID,
    tripId: row.TripID,
    tripName: row.TripName,
    vatPercent: null,
    deductionPercent: null,
    vendorName: null,
    invoiceNumber: null,
    companyId: null,
    createdAt: toISOString(row.CreatedAt),
    updatedAt: toISOString(row.UpdatedAt),
  };
}

function rowToCategorySummary(row: TripCategorySummaryRow): TripCategorySummary {
  return {
    categoryId: row.CategoryID,
    categoryName: row.CategoryName,
    categoryIcon: row.CategoryIcon,
    categoryColor: row.CategoryColor,
    totalCents: row.TotalCents,
    count: row.Count,
  };
}

// ============================================================
// Queries (user-scoped)
// ============================================================

/**
 * Get all trips with aggregated data for the current user
 */
export async function getAllTrips(): Promise<TripDisplay[]> {
  const userId = await getUserIdOrThrow();

  const tripsResult = await query<TripAggregateRow>(
    `SELECT
      tr."TripID", tr."Name", tr."CreatedAt", tr."UpdatedAt",
      COALESCE(agg."ExpenseCount", 0) AS "ExpenseCount",
      COALESCE(agg."TotalCents", 0) AS "TotalCents",
      agg."StartDate", agg."EndDate"
    FROM "Trips" tr
    LEFT JOIN (
      SELECT "TripID",
        COUNT(*) AS "ExpenseCount",
        SUM("AmountCents") AS "TotalCents",
        MIN("TransactionDate") AS "StartDate",
        MAX("TransactionDate") AS "EndDate"
      FROM "Transactions"
      WHERE "TripID" IS NOT NULL
      GROUP BY "TripID"
    ) agg ON tr."TripID" = agg."TripID"
    WHERE tr."UserID" = $1
    ORDER BY tr."CreatedAt" DESC`,
    [userId],
  );

  if (tripsResult.length === 0) return [];

  const tripIds = tripsResult.map((r) => r.TripID);
  const categoryResult = await query<TripCategorySummaryRow>(
    `SELECT
      t."TripID",
      t."CategoryID",
      c."Name" AS "CategoryName",
      c."Icon" AS "CategoryIcon",
      c."Color" AS "CategoryColor",
      SUM(t."AmountCents") AS "TotalCents",
      COUNT(*) AS "Count"
    FROM "Transactions" t
    INNER JOIN "Categories" c ON t."CategoryID" = c."CategoryID"
    WHERE t."TripID" = ANY($1) AND t."UserID" = $2
    GROUP BY t."TripID", t."CategoryID", c."Name", c."Icon", c."Color"
    ORDER BY t."TripID", "TotalCents" DESC`,
    [tripIds, userId],
  );

  const categoryMap = new Map<number, TripCategorySummary[]>();
  categoryResult.forEach((row) => {
    const existing = categoryMap.get(row.TripID) ?? [];
    existing.push(rowToCategorySummary(row));
    categoryMap.set(row.TripID, existing);
  });

  return tripsResult.map(
    (row): TripDisplay => ({
      tripId: row.TripID,
      name: row.Name,
      createdAt: toISOString(row.CreatedAt),
      updatedAt: toISOString(row.UpdatedAt),
      expenseCount: row.ExpenseCount,
      totalCents: row.TotalCents,
      startDate: row.StartDate ? toDateString(row.StartDate) : null,
      endDate: row.EndDate ? toDateString(row.EndDate) : null,
      categorySummary: categoryMap.get(row.TripID) ?? [],
    }),
  );
}

/**
 * Get a single trip with full expense details (verifies ownership)
 */
export async function getTripById(tripId: number): Promise<TripDetail | null> {
  const userId = await getUserIdOrThrow();

  const tripResult = await query<TripRow>(
    `SELECT "TripID", "Name", "CreatedAt", "UpdatedAt"
    FROM "Trips"
    WHERE "TripID" = $1 AND "UserID" = $2`,
    [tripId, userId],
  );

  const tripRow = tripResult[0];
  if (!tripRow) return null;

  const txResult = await query<TransactionRow>(
    `SELECT
      t."TransactionID", t."CategoryID", c."Name" AS "CategoryName",
      c."Icon" AS "CategoryIcon", c."Color" AS "CategoryColor",
      c."ParentCategoryID", parent."Name" AS "ParentCategoryName",
      t."AmountCents", t."Description", t."TransactionDate",
      t."Type", t."SharedDivisor", t."OriginalAmountCents",
      t."RecurringExpenseID", t."TransactionGroupID",
      t."TripID", trip."Name" AS "TripName",
      t."CreatedAt", t."UpdatedAt"
    FROM "Transactions" t
    INNER JOIN "Categories" c ON t."CategoryID" = c."CategoryID"
    LEFT JOIN "Categories" parent ON c."ParentCategoryID" = parent."CategoryID"
    LEFT JOIN "Trips" trip ON t."TripID" = trip."TripID"
    WHERE t."TripID" = $1 AND t."UserID" = $2
    ORDER BY t."TransactionDate" DESC, t."CreatedAt" DESC`,
    [tripId, userId],
  );

  const catResult = await query<TripCategorySummaryRow>(
    `SELECT
      t."TripID",
      t."CategoryID",
      c."Name" AS "CategoryName",
      c."Icon" AS "CategoryIcon",
      c."Color" AS "CategoryColor",
      SUM(t."AmountCents") AS "TotalCents",
      COUNT(*) AS "Count"
    FROM "Transactions" t
    INNER JOIN "Categories" c ON t."CategoryID" = c."CategoryID"
    WHERE t."TripID" = $1 AND t."UserID" = $2
    GROUP BY t."TripID", t."CategoryID", c."Name", c."Icon", c."Color"
    ORDER BY "TotalCents" DESC`,
    [tripId, userId],
  );

  const expenses = txResult.map(rowToTransaction);
  const categorySummary = catResult.map(rowToCategorySummary);
  const totalCents = expenses.reduce((sum, tx) => sum + tx.amountCents, 0);

  return {
    ...rowToTrip(tripRow),
    expenses,
    categorySummary,
    totalCents,
    expenseCount: expenses.length,
  };
}

/**
 * Create a new trip (user-scoped)
 */
export async function createTrip(name: string): Promise<Trip> {
  const userId = await getUserIdOrThrow();

  const result = await query<TripRow>(
    `INSERT INTO "Trips" ("Name", "UserID")
    VALUES ($1, $2)
    RETURNING "TripID", "Name", "CreatedAt", "UpdatedAt"`,
    [name, userId],
  );

  const row = result[0];
  if (!row) throw new Error('Failed to create trip');

  return rowToTrip(row);
}

/**
 * Update a trip name (verifies ownership)
 */
export async function updateTrip(tripId: number, name: string): Promise<Trip | null> {
  const userId = await getUserIdOrThrow();

  const result = await query<TripRow>(
    `UPDATE "Trips" SET "Name" = $1
    WHERE "TripID" = $2 AND "UserID" = $3
    RETURNING "TripID", "Name", "CreatedAt", "UpdatedAt"`,
    [name, tripId, userId],
  );

  const row = result[0];
  return row ? rowToTrip(row) : null;
}

/**
 * Delete a trip and all its linked transactions (verifies ownership)
 */
export async function deleteTrip(tripId: number): Promise<boolean> {
  const userId = await getUserIdOrThrow();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM "Transactions" WHERE "TripID" = $1 AND "UserID" = $2', [tripId, userId]);

    const result = await client.query('DELETE FROM "Trips" WHERE "TripID" = $1 AND "UserID" = $2', [tripId, userId]);

    await client.query('COMMIT');

    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get subcategories under the "Viajes" parent category (user-scoped)
 */
export async function getTripCategories(): Promise<Category[]> {
  const userId = await getUserIdOrThrow();

  const result = await query<CategoryRow>(
    `SELECT sub."CategoryID", sub."Name", sub."Type", sub."Icon", sub."Color",
           sub."SortOrder", sub."IsActive", sub."ParentCategoryID", sub."DefaultShared"
    FROM "Categories" sub
    INNER JOIN "Categories" parent ON sub."ParentCategoryID" = parent."CategoryID"
    WHERE parent."Name" = 'Viajes'
      AND parent."Type" = 'expense'
      AND parent."ParentCategoryID" IS NULL
      AND sub."IsActive" = TRUE
      AND sub."UserID" = $1
    ORDER BY sub."SortOrder"`,
    [userId],
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

/**
 * Get the count of transactions linked to a trip (user-scoped)
 */
export async function getTripExpenseCount(tripId: number): Promise<number> {
  const userId = await getUserIdOrThrow();

  const result = await query<{ count: number }>(
    'SELECT COUNT(*) AS "count" FROM "Transactions" WHERE "TripID" = $1 AND "UserID" = $2',
    [tripId, userId],
  );

  return result[0]?.count ?? 0;
}
