/**
 * BudgetGuard Transaction Repository
 * Database operations for transactions
 */

import sql from 'mssql';
import type {
  CategorySummary,
  MonthlySummary,
  SubcategorySummary,
  Transaction,
  TransactionType,
} from '@/types/finance';
import { getConnection } from './connection';

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
  Type: TransactionType;
  SharedDivisor: number;
  OriginalAmountCents: number | null;
  RecurringExpenseID: number | null;
  TransactionGroupID: number | null;
  TripID: number | null;
  TripName: string | null;
  CreatedAt: Date;
  UpdatedAt: Date;
}

interface SummaryRow {
  Month: string;
  Type: TransactionType;
  CategoryID: number;
  CategoryName: string;
  CategoryIcon: string | null;
  CategoryColor: string | null;
  TotalCents: number;
  TransactionCount: number;
}

interface SubcategorySummaryRow {
  Month: string;
  ParentCategoryID: number;
  SubcategoryID: number;
  SubcategoryName: string;
  SubcategoryIcon: string | null;
  SubcategoryColor: string | null;
  IsSubcategory: number | null;
  TotalCents: number;
  TransactionCount: number;
}

interface BalanceRow {
  Month: string;
  IncomeCents: number;
  ExpenseCents: number;
  BalanceCents: number;
}

/**
 * Transform database row to Transaction type
 */
function rowToTransaction(row: TransactionRow): Transaction {
  return {
    transactionId: row.TransactionID,
    categoryId: row.CategoryID,
    category: {
      categoryId: row.CategoryID,
      name: row.CategoryName,
      type: row.Type,
      icon: row.CategoryIcon,
      color: row.CategoryColor,
      sortOrder: 0,
      isActive: true,
      parentCategoryId: row.ParentCategoryID,
      defaultShared: false,
    },
    parentCategory: row.ParentCategoryID
      ? { categoryId: row.ParentCategoryID, name: row.ParentCategoryName ?? '' }
      : null,
    amountCents: row.AmountCents,
    description: row.Description,
    transactionDate: row.TransactionDate.toISOString().split('T')[0] || '',
    type: row.Type,
    sharedDivisor: row.SharedDivisor,
    originalAmountCents: row.OriginalAmountCents,
    recurringExpenseId: row.RecurringExpenseID,
    transactionGroupId: row.TransactionGroupID,
    tripId: row.TripID,
    tripName: row.TripName,
    createdAt: row.CreatedAt.toISOString(),
    updatedAt: row.UpdatedAt.toISOString(),
  };
}

/**
 * Get transactions for a specific month
 */
export async function getTransactionsByMonth(
  month: string,
  filters?: { type?: TransactionType; categoryId?: number },
): Promise<Transaction[]> {
  const pool = await getConnection();
  const request = pool.request();

  request.input('month', sql.NVarChar(7), month);

  let query = `
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
    LEFT JOIN (
      SELECT TripID, MIN(TransactionDate) AS TripStartDate
      FROM Transactions WHERE TripID IS NOT NULL
      GROUP BY TripID
    ) tripAgg ON t.TripID = tripAgg.TripID
    WHERE (
      (t.TripID IS NULL AND FORMAT(t.TransactionDate, 'yyyy-MM') = @month)
      OR (t.TripID IS NOT NULL AND FORMAT(tripAgg.TripStartDate, 'yyyy-MM') = @month)
    )
  `;

  if (filters?.type) {
    request.input('type', sql.NVarChar(10), filters.type);
    query += ' AND t.Type = @type';
  }

  if (filters?.categoryId) {
    request.input('categoryId', sql.Int, filters.categoryId);
    query += ' AND t.CategoryID = @categoryId';
  }

  query += ' ORDER BY t.TransactionDate DESC, t.CreatedAt DESC';

  const result = await request.query<TransactionRow>(query);
  return result.recordset.map(rowToTransaction);
}

/**
 * Get a single transaction by ID
 */
export async function getTransactionById(transactionId: number): Promise<Transaction | null> {
  const pool = await getConnection();
  const request = pool.request();

  request.input('transactionId', sql.Int, transactionId);

  const result = await request.query<TransactionRow>(`
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
    WHERE t.TransactionID = @transactionId
  `);

  const row = result.recordset[0];
  return row ? rowToTransaction(row) : null;
}

/**
 * Create a new transaction
 * @param data - Transaction data (amount in cents)
 */
export async function createTransaction(data: {
  categoryId: number;
  amountCents: number;
  description?: string;
  transactionDate: Date;
  type: TransactionType;
  sharedDivisor?: number;
  originalAmountCents?: number | null;
  recurringExpenseId?: number | null;
  transactionGroupId?: number | null;
  tripId?: number | null;
}): Promise<Transaction> {
  const pool = await getConnection();
  const request = pool.request();

  request.input('categoryId', sql.Int, data.categoryId);
  request.input('amountCents', sql.Int, data.amountCents);
  request.input('description', sql.NVarChar(255), data.description ?? null);
  request.input('transactionDate', sql.Date, data.transactionDate);
  request.input('type', sql.NVarChar(10), data.type);
  request.input('sharedDivisor', sql.TinyInt, data.sharedDivisor ?? 1);
  request.input('originalAmountCents', sql.Int, data.originalAmountCents ?? null);
  request.input('recurringExpenseId', sql.Int, data.recurringExpenseId ?? null);
  request.input('transactionGroupId', sql.Int, data.transactionGroupId ?? null);
  request.input('tripId', sql.Int, data.tripId ?? null);

  const result = await request.query<{ TransactionID: number }>(`
    DECLARE @out TABLE (TransactionID INT);
    INSERT INTO Transactions (CategoryID, AmountCents, Description, TransactionDate, Type, SharedDivisor, OriginalAmountCents, RecurringExpenseID, TransactionGroupID, TripID)
    OUTPUT INSERTED.TransactionID INTO @out
    VALUES (@categoryId, @amountCents, @description, @transactionDate, @type, @sharedDivisor, @originalAmountCents, @recurringExpenseId, @transactionGroupId, @tripId);
    SELECT * FROM @out;
  `);

  const insertedId = result.recordset[0]?.TransactionID;
  if (!insertedId) {
    throw new Error('Failed to create transaction');
  }

  const transaction = await getTransactionById(insertedId);
  if (!transaction) {
    throw new Error('Failed to retrieve created transaction');
  }

  return transaction;
}

/**
 * Update an existing transaction
 */
export async function updateTransaction(
  transactionId: number,
  data: Partial<{
    categoryId: number;
    amountCents: number;
    description: string | null;
    transactionDate: Date;
    type: TransactionType;
    sharedDivisor: number;
    originalAmountCents: number | null;
  }>,
): Promise<Transaction | null> {
  const pool = await getConnection();
  const request = pool.request();

  request.input('transactionId', sql.Int, transactionId);

  const updates: string[] = [];

  if (data.categoryId !== undefined) {
    request.input('categoryId', sql.Int, data.categoryId);
    updates.push('CategoryID = @categoryId');
  }
  if (data.amountCents !== undefined) {
    request.input('amountCents', sql.Int, data.amountCents);
    updates.push('AmountCents = @amountCents');
  }
  if (data.description !== undefined) {
    request.input('description', sql.NVarChar(255), data.description);
    updates.push('Description = @description');
  }
  if (data.transactionDate !== undefined) {
    request.input('transactionDate', sql.Date, data.transactionDate);
    updates.push('TransactionDate = @transactionDate');
  }
  if (data.type !== undefined) {
    request.input('type', sql.NVarChar(10), data.type);
    updates.push('Type = @type');
  }
  if (data.sharedDivisor !== undefined) {
    request.input('sharedDivisor', sql.TinyInt, data.sharedDivisor);
    updates.push('SharedDivisor = @sharedDivisor');
  }
  if (data.originalAmountCents !== undefined) {
    request.input('originalAmountCents', sql.Int, data.originalAmountCents);
    updates.push('OriginalAmountCents = @originalAmountCents');
  }

  if (updates.length === 0) {
    return getTransactionById(transactionId);
  }

  await request.query(`
    UPDATE Transactions
    SET ${updates.join(', ')}
    WHERE TransactionID = @transactionId
  `);

  return getTransactionById(transactionId);
}

/**
 * Delete a transaction
 */
export async function deleteTransaction(transactionId: number): Promise<boolean> {
  const pool = await getConnection();
  const request = pool.request();

  request.input('transactionId', sql.Int, transactionId);

  const result = await request.query(`
    DELETE FROM Transactions
    WHERE TransactionID = @transactionId
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}

/**
 * Get monthly summary using database views
 * All calculations are done in SQL, not in JavaScript
 */
export async function getMonthlySummary(month: string): Promise<MonthlySummary> {
  const pool = await getConnection();
  const request = pool.request();

  request.input('month', sql.NVarChar(7), month);

  // Get balance totals from view
  const balanceResult = await request.query<BalanceRow>(`
    SELECT Month, IncomeCents, ExpenseCents, BalanceCents
    FROM vw_MonthlyBalance
    WHERE Month = @month
  `);

  // Get category breakdown from view
  const categoryResult = await pool
    .request()
    .input('month', sql.NVarChar(7), month)
    .query<SummaryRow>(`
    SELECT Month, Type, CategoryID, CategoryName, CategoryIcon, CategoryColor, TotalCents, TransactionCount
    FROM vw_MonthlySummary
    WHERE Month = @month
    ORDER BY Type, TotalCents DESC
  `);

  const balance = balanceResult.recordset[0];
  const categories: CategorySummary[] = categoryResult.recordset.map((row) => ({
    categoryId: row.CategoryID,
    categoryName: row.CategoryName,
    categoryIcon: row.CategoryIcon,
    categoryColor: row.CategoryColor,
    type: row.Type,
    totalCents: row.TotalCents,
    transactionCount: row.TransactionCount,
  }));

  return {
    month,
    incomeCents: balance?.IncomeCents ?? 0,
    expenseCents: balance?.ExpenseCents ?? 0,
    balanceCents: balance?.BalanceCents ?? 0,
    byCategory: categories,
  };
}

/**
 * Get subcategory drill-down for a parent category in a given month
 * Uses vw_SubcategorySummary view
 */
export async function getSubcategorySummary(month: string, parentCategoryId: number): Promise<SubcategorySummary[]> {
  const pool = await getConnection();
  const request = pool.request();

  request.input('month', sql.NVarChar(7), month);
  request.input('parentCategoryId', sql.Int, parentCategoryId);

  const result = await request.query<SubcategorySummaryRow>(`
    SELECT Month, ParentCategoryID, SubcategoryID, SubcategoryName,
           SubcategoryIcon, SubcategoryColor, IsSubcategory,
           TotalCents, TransactionCount
    FROM vw_SubcategorySummary
    WHERE Month = @month AND ParentCategoryID = @parentCategoryId
    ORDER BY TotalCents DESC
  `);

  return result.recordset.map((row) => ({
    parentCategoryId: row.ParentCategoryID,
    subcategoryId: row.SubcategoryID,
    subcategoryName: row.SubcategoryName,
    subcategoryIcon: row.SubcategoryIcon,
    subcategoryColor: row.SubcategoryColor,
    isSubcategory: row.IsSubcategory !== null,
    totalCents: row.TotalCents,
    transactionCount: row.TransactionCount,
  }));
}

// ============================================================
// TRANSACTION GROUPS
// ============================================================

interface TransactionGroupItem {
  categoryId: number;
  amountCents: number;
  originalAmountCents: number | null;
}

/**
 * Create a transaction group with multiple linked transactions
 * Uses SQL transaction for atomicity. Sequential inserts (mssql doesn't support
 * concurrent requests on the same SQL transaction).
 */
export async function createTransactionGroup(data: {
  description: string;
  transactionDate: Date;
  type: TransactionType;
  sharedDivisor: number;
  items: TransactionGroupItem[];
}): Promise<Transaction[]> {
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);

  await transaction.begin();

  try {
    // Create the group row
    const groupResult = await new sql.Request(transaction).query<{ TransactionGroupID: number }>(
      'INSERT INTO TransactionGroups DEFAULT VALUES; SELECT SCOPE_IDENTITY() AS TransactionGroupID;',
    );

    const groupId = groupResult.recordset[0]?.TransactionGroupID;
    if (!groupId) {
      throw new Error('Failed to create transaction group');
    }

    // Insert transactions sequentially using .reduce() pattern
    await data.items.reduce(async (prev, item, index) => {
      await prev;
      const req = new sql.Request(transaction);
      req.input(`categoryId_${index}`, sql.Int, item.categoryId);
      req.input(`amountCents_${index}`, sql.Int, item.amountCents);
      req.input(`originalAmountCents_${index}`, sql.Int, item.originalAmountCents);
      req.input(`description_${index}`, sql.NVarChar(255), data.description);
      req.input(`transactionDate_${index}`, sql.Date, data.transactionDate);
      req.input(`type_${index}`, sql.NVarChar(10), data.type);
      req.input(`sharedDivisor_${index}`, sql.TinyInt, data.sharedDivisor);
      req.input(`groupId_${index}`, sql.Int, groupId);

      await req.query(`
        INSERT INTO Transactions (CategoryID, AmountCents, Description, TransactionDate, Type, SharedDivisor, OriginalAmountCents, TransactionGroupID)
        VALUES (@categoryId_${index}, @amountCents_${index}, @description_${index}, @transactionDate_${index}, @type_${index}, @sharedDivisor_${index}, @originalAmountCents_${index}, @groupId_${index})
      `);
    }, Promise.resolve());

    await transaction.commit();

    // Fetch the created transactions with full category info
    return getTransactionsByGroupId(groupId);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Get all transactions belonging to a group
 */
export async function getTransactionsByGroupId(groupId: number): Promise<Transaction[]> {
  const pool = await getConnection();
  const request = pool.request();
  request.input('groupId', sql.Int, groupId);

  const result = await request.query<TransactionRow>(`
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
    WHERE t.TransactionGroupID = @groupId
    ORDER BY t.TransactionID
  `);

  return result.recordset.map(rowToTransaction);
}

/**
 * Delete an entire transaction group and all its transactions
 */
export async function deleteTransactionGroup(groupId: number): Promise<boolean> {
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);

  await transaction.begin();

  try {
    // Delete all transactions in the group
    await new sql.Request(transaction)
      .input('groupId', sql.Int, groupId)
      .query('DELETE FROM Transactions WHERE TransactionGroupID = @groupId');

    // Delete the group row
    const result = await new sql.Request(transaction)
      .input('groupId', sql.Int, groupId)
      .query('DELETE FROM TransactionGroups WHERE TransactionGroupID = @groupId');

    await transaction.commit();

    return (result.rowsAffected[0] ?? 0) > 0;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Update a transaction group's description and/or date (propagates to all transactions)
 */
export async function updateTransactionGroup(
  groupId: number,
  data: { description?: string; transactionDate?: Date },
): Promise<Transaction[]> {
  const pool = await getConnection();
  const request = pool.request();
  request.input('groupId', sql.Int, groupId);

  const updates: string[] = [];

  if (data.description !== undefined) {
    request.input('description', sql.NVarChar(255), data.description);
    updates.push('Description = @description');
  }
  if (data.transactionDate !== undefined) {
    request.input('transactionDate', sql.Date, data.transactionDate);
    updates.push('TransactionDate = @transactionDate');
  }

  if (updates.length > 0) {
    await request.query(`
      UPDATE Transactions
      SET ${updates.join(', ')}
      WHERE TransactionGroupID = @groupId
    `);
  }

  return getTransactionsByGroupId(groupId);
}

/**
 * Clean up orphaned transaction groups (groups with no remaining transactions)
 * Called after deleting an individual transaction that belongs to a group
 */
export async function cleanupOrphanedGroup(groupId: number): Promise<boolean> {
  const pool = await getConnection();
  const request = pool.request();
  request.input('groupId', sql.Int, groupId);

  // Check if any transactions still reference this group
  const countResult = await request.query<{ count: number }>(
    'SELECT COUNT(*) AS count FROM Transactions WHERE TransactionGroupID = @groupId',
  );

  const remaining = countResult.recordset[0]?.count ?? 0;

  if (remaining === 0) {
    await pool
      .request()
      .input('groupId', sql.Int, groupId)
      .query('DELETE FROM TransactionGroups WHERE TransactionGroupID = @groupId');
    return true;
  }

  return false;
}
