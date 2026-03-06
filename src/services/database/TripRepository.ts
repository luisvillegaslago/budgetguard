/**
 * BudgetGuard Trip Repository
 * Database operations for trips and trip expenses
 */

import sql from 'mssql';
import { TRANSACTION_TYPE } from '@/constants/finance';
import type { Category, Transaction, Trip, TripCategorySummary, TripDetail, TripDisplay } from '@/types/finance';
import { getConnection } from './connection';

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
  IsActive: number;
  ParentCategoryID: number | null;
  DefaultShared: number;
}

// ============================================================
// Transformers
// ============================================================

function rowToTrip(row: TripRow): Trip {
  return {
    tripId: row.TripID,
    name: row.Name,
    createdAt: row.CreatedAt.toISOString(),
    updatedAt: row.UpdatedAt.toISOString(),
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
    transactionDate: row.TransactionDate.toISOString().split('T')[0] || '',
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
    createdAt: row.CreatedAt.toISOString(),
    updatedAt: row.UpdatedAt.toISOString(),
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
// Queries
// ============================================================

/**
 * Get all trips with aggregated data (expense count, total, date range, category summary)
 */
export async function getAllTrips(): Promise<TripDisplay[]> {
  const pool = await getConnection();

  // Query 1: Trips with aggregates
  const tripsResult = await pool.request().query<TripAggregateRow>(`
    SELECT
      tr.TripID, tr.Name, tr.CreatedAt, tr.UpdatedAt,
      ISNULL(agg.ExpenseCount, 0) AS ExpenseCount,
      ISNULL(agg.TotalCents, 0) AS TotalCents,
      agg.StartDate, agg.EndDate
    FROM Trips tr
    LEFT JOIN (
      SELECT TripID,
        COUNT(*) AS ExpenseCount,
        SUM(AmountCents) AS TotalCents,
        MIN(TransactionDate) AS StartDate,
        MAX(TransactionDate) AS EndDate
      FROM Transactions
      WHERE TripID IS NOT NULL
      GROUP BY TripID
    ) agg ON tr.TripID = agg.TripID
    ORDER BY tr.CreatedAt DESC
  `);

  if (tripsResult.recordset.length === 0) return [];

  // Query 2: Category summary per trip
  const categoryResult = await pool.request().query<TripCategorySummaryRow>(`
    SELECT
      t.TripID,
      t.CategoryID,
      c.Name AS CategoryName,
      c.Icon AS CategoryIcon,
      c.Color AS CategoryColor,
      SUM(t.AmountCents) AS TotalCents,
      COUNT(*) AS Count
    FROM Transactions t
    INNER JOIN Categories c ON t.CategoryID = c.CategoryID
    WHERE t.TripID IS NOT NULL
    GROUP BY t.TripID, t.CategoryID, c.Name, c.Icon, c.Color
    ORDER BY t.TripID, TotalCents DESC
  `);

  // Build a Map of tripId → categorySummary[]
  const categoryMap = new Map<number, TripCategorySummary[]>();
  categoryResult.recordset.forEach((row) => {
    const existing = categoryMap.get(row.TripID) ?? [];
    existing.push(rowToCategorySummary(row));
    categoryMap.set(row.TripID, existing);
  });

  return tripsResult.recordset.map(
    (row): TripDisplay => ({
      tripId: row.TripID,
      name: row.Name,
      createdAt: row.CreatedAt.toISOString(),
      updatedAt: row.UpdatedAt.toISOString(),
      expenseCount: row.ExpenseCount,
      totalCents: row.TotalCents,
      startDate: row.StartDate ? row.StartDate.toISOString().split('T')[0] || null : null,
      endDate: row.EndDate ? row.EndDate.toISOString().split('T')[0] || null : null,
      categorySummary: categoryMap.get(row.TripID) ?? [],
    }),
  );
}

/**
 * Get a single trip with full expense details and category summary
 */
export async function getTripById(tripId: number): Promise<TripDetail | null> {
  const pool = await getConnection();
  const request = pool.request();
  request.input('tripId', sql.Int, tripId);

  // Get trip row
  const tripResult = await request.query<TripRow>(`
    SELECT TripID, Name, CreatedAt, UpdatedAt
    FROM Trips
    WHERE TripID = @tripId
  `);

  const tripRow = tripResult.recordset[0];
  if (!tripRow) return null;

  // Get all transactions for this trip
  const txResult = await pool
    .request()
    .input('tripId', sql.Int, tripId)
    .query<TransactionRow>(`
    SELECT
      t.TransactionID, t.CategoryID, c.Name AS CategoryName,
      c.Icon AS CategoryIcon, c.Color AS CategoryColor,
      c.ParentCategoryID, parent.Name AS ParentCategoryName,
      t.AmountCents, t.Description, t.TransactionDate,
      t.Type, t.SharedDivisor, t.OriginalAmountCents,
      t.RecurringExpenseID, t.TransactionGroupID,
      t.TripID, trip.Name AS TripName,
      t.CreatedAt, t.UpdatedAt
    FROM Transactions t
    INNER JOIN Categories c ON t.CategoryID = c.CategoryID
    LEFT JOIN Categories parent ON c.ParentCategoryID = parent.CategoryID
    LEFT JOIN Trips trip ON t.TripID = trip.TripID
    WHERE t.TripID = @tripId
    ORDER BY t.TransactionDate DESC, t.CreatedAt DESC
  `);

  // Get category summary
  const catResult = await pool
    .request()
    .input('tripId', sql.Int, tripId)
    .query<TripCategorySummaryRow>(`
    SELECT
      t.TripID,
      t.CategoryID,
      c.Name AS CategoryName,
      c.Icon AS CategoryIcon,
      c.Color AS CategoryColor,
      SUM(t.AmountCents) AS TotalCents,
      COUNT(*) AS Count
    FROM Transactions t
    INNER JOIN Categories c ON t.CategoryID = c.CategoryID
    WHERE t.TripID = @tripId
    GROUP BY t.TripID, t.CategoryID, c.Name, c.Icon, c.Color
    ORDER BY TotalCents DESC
  `);

  const expenses = txResult.recordset.map(rowToTransaction);
  const categorySummary = catResult.recordset.map(rowToCategorySummary);
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
 * Create a new trip
 */
export async function createTrip(name: string): Promise<Trip> {
  const pool = await getConnection();
  const request = pool.request();
  request.input('name', sql.NVarChar(100), name);

  const result = await request.query<TripRow>(`
    DECLARE @out TABLE (TripID INT, Name NVARCHAR(100), CreatedAt DATETIME2, UpdatedAt DATETIME2);
    INSERT INTO Trips (Name)
    OUTPUT INSERTED.TripID, INSERTED.Name, INSERTED.CreatedAt, INSERTED.UpdatedAt INTO @out
    VALUES (@name);
    SELECT * FROM @out;
  `);

  const row = result.recordset[0];
  if (!row) throw new Error('Failed to create trip');

  return rowToTrip(row);
}

/**
 * Update a trip name
 */
export async function updateTrip(tripId: number, name: string): Promise<Trip | null> {
  const pool = await getConnection();
  const request = pool.request();
  request.input('tripId', sql.Int, tripId);
  request.input('name', sql.NVarChar(100), name);

  const result = await request.query<TripRow>(`
    UPDATE Trips SET Name = @name WHERE TripID = @tripId;
    SELECT TripID, Name, CreatedAt, UpdatedAt FROM Trips WHERE TripID = @tripId;
  `);

  const row = result.recordset[0];
  return row ? rowToTrip(row) : null;
}

/**
 * Delete a trip and all its linked transactions
 * Uses SQL transaction for atomicity (same pattern as deleteTransactionGroup)
 */
export async function deleteTrip(tripId: number): Promise<boolean> {
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);

  await transaction.begin();

  try {
    // Delete all transactions linked to this trip
    await new sql.Request(transaction)
      .input('tripId', sql.Int, tripId)
      .query('DELETE FROM Transactions WHERE TripID = @tripId');

    // Delete the trip
    const result = await new sql.Request(transaction)
      .input('tripId', sql.Int, tripId)
      .query('DELETE FROM Trips WHERE TripID = @tripId');

    await transaction.commit();

    return (result.rowsAffected[0] ?? 0) > 0;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Get subcategories under the "Viajes" parent category
 * Used to populate the trip expense form category selector
 */
export async function getTripCategories(): Promise<Category[]> {
  const pool = await getConnection();

  const result = await pool.request().query<CategoryRow>(`
    SELECT sub.CategoryID, sub.Name, sub.Type, sub.Icon, sub.Color,
           sub.SortOrder, sub.IsActive, sub.ParentCategoryID, sub.DefaultShared
    FROM Categories sub
    INNER JOIN Categories parent ON sub.ParentCategoryID = parent.CategoryID
    WHERE parent.Name = 'Viajes'
      AND parent.Type = 'expense'
      AND parent.ParentCategoryID IS NULL
      AND sub.IsActive = 1
    ORDER BY sub.SortOrder
  `);

  return result.recordset.map(
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
 * Get the count of transactions linked to a trip
 */
export async function getTripExpenseCount(tripId: number): Promise<number> {
  const pool = await getConnection();
  const request = pool.request();
  request.input('tripId', sql.Int, tripId);

  const result = await request.query<{ count: number }>(
    'SELECT COUNT(*) AS count FROM Transactions WHERE TripID = @tripId',
  );

  return result.recordset[0]?.count ?? 0;
}
