/**
 * BudgetGuard Transaction Repository
 * Database operations for transactions
 */

import sql from 'mssql';
import type { CategorySummary, MonthlySummary, Transaction, TransactionType } from '@/types/finance';
import { getConnection } from './connection';

interface TransactionRow {
  TransactionID: number;
  CategoryID: number;
  CategoryName: string;
  CategoryIcon: string | null;
  CategoryColor: string | null;
  AmountCents: number;
  Description: string | null;
  TransactionDate: Date;
  Type: TransactionType;
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
    },
    amountCents: row.AmountCents,
    description: row.Description,
    transactionDate: row.TransactionDate.toISOString().split('T')[0] || '',
    type: row.Type,
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
      t.AmountCents, t.Description, t.TransactionDate,
      t.Type, t.CreatedAt, t.UpdatedAt
    FROM Transactions t
    INNER JOIN Categories c ON t.CategoryID = c.CategoryID
    WHERE FORMAT(t.TransactionDate, 'yyyy-MM') = @month
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
      t.AmountCents, t.Description, t.TransactionDate,
      t.Type, t.CreatedAt, t.UpdatedAt
    FROM Transactions t
    INNER JOIN Categories c ON t.CategoryID = c.CategoryID
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
}): Promise<Transaction> {
  const pool = await getConnection();
  const request = pool.request();

  request.input('categoryId', sql.Int, data.categoryId);
  request.input('amountCents', sql.Int, data.amountCents);
  request.input('description', sql.NVarChar(255), data.description ?? null);
  request.input('transactionDate', sql.Date, data.transactionDate);
  request.input('type', sql.NVarChar(10), data.type);

  const result = await request.query<{ TransactionID: number }>(`
    INSERT INTO Transactions (CategoryID, AmountCents, Description, TransactionDate, Type)
    OUTPUT INSERTED.TransactionID
    VALUES (@categoryId, @amountCents, @description, @transactionDate, @type)
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
