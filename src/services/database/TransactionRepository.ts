/**
 * BudgetGuard Transaction Repository
 * Database operations for transactions (PostgreSQL, user-scoped)
 */

import { TRANSACTION_STATUS, TRANSACTION_TYPE } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import type {
  CategoryHistorySummary,
  CategorySummary,
  CategoryTrendRow,
  CategoryTrends,
  MonthlySummary,
  MonthlySummaryTrends,
  MonthlyTrendPoint,
  SubcategorySummary,
  Transaction,
  TransactionStatus,
  TransactionType,
} from '@/types/finance';
import { addMonths, toDateString } from '@/utils/helpers';
import { getPool, query } from './connection';

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
  TransactionDate: Date | string;
  Type: TransactionType;
  SharedDivisor: number;
  OriginalAmountCents: number | null;
  RecurringExpenseID: number | null;
  TransactionGroupID: number | null;
  TripID: number | null;
  TripName: string | null;
  VatPercent: number | null;
  DeductionPercent: number | null;
  VendorName: string | null;
  InvoiceNumber: string | null;
  Status: TransactionStatus;
  CompanyID: number | null;
  FiscalDocumentID: number | null;
  CreatedAt: Date | string;
  UpdatedAt: Date | string;
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
 * Convert a Date or string value to an ISO string
 */
function toISOString(val: Date | string): string {
  if (typeof val === 'string') return val;
  return val.toISOString();
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
      defaultVatPercent: null,
      defaultDeductionPercent: null,
    },
    parentCategory: row.ParentCategoryID
      ? { categoryId: row.ParentCategoryID, name: row.ParentCategoryName ?? '' }
      : null,
    amountCents: row.AmountCents,
    description: row.Description,
    transactionDate: toDateString(row.TransactionDate),
    type: row.Type,
    status: row.Status,
    sharedDivisor: row.SharedDivisor,
    originalAmountCents: row.OriginalAmountCents,
    recurringExpenseId: row.RecurringExpenseID,
    transactionGroupId: row.TransactionGroupID,
    tripId: row.TripID,
    tripName: row.TripName,
    vatPercent: row.VatPercent,
    deductionPercent: row.DeductionPercent,
    vendorName: row.VendorName,
    invoiceNumber: row.InvoiceNumber,
    companyId: row.CompanyID,
    fiscalDocumentId: row.FiscalDocumentID ?? null,
    createdAt: toISOString(row.CreatedAt),
    updatedAt: toISOString(row.UpdatedAt),
  };
}

/**
 * Get transactions for a specific month (user-scoped)
 */
export async function getTransactionsByMonth(
  month: string,
  filters?: { type?: TransactionType; categoryId?: number; status?: TransactionStatus },
): Promise<Transaction[]> {
  const userId = await getUserIdOrThrow();
  const params: unknown[] = [month, userId];
  let paramIndex = 3;

  let sql = `
    SELECT
      t."TransactionID", t."CategoryID", c."Name" AS "CategoryName",
      c."Icon" AS "CategoryIcon", c."Color" AS "CategoryColor",
      c."ParentCategoryID", parent."Name" AS "ParentCategoryName",
      t."AmountCents", t."Description", t."TransactionDate",
      t."Type", t."SharedDivisor", t."OriginalAmountCents",
      t."RecurringExpenseID", t."TransactionGroupID",
      t."TripID", trip."Name" AS "TripName",
      t."VatPercent", t."DeductionPercent", t."VendorName", t."InvoiceNumber",
      t."Status", t."CompanyID",
      (SELECT fd."DocumentID" FROM "FiscalDocuments" fd WHERE fd."TransactionID" = t."TransactionID" LIMIT 1) AS "FiscalDocumentID",
      t."CreatedAt", t."UpdatedAt"
    FROM "Transactions" t
    INNER JOIN "Categories" c ON t."CategoryID" = c."CategoryID"
    LEFT JOIN "Categories" parent ON c."ParentCategoryID" = parent."CategoryID"
    LEFT JOIN "Trips" trip ON t."TripID" = trip."TripID"
    LEFT JOIN (
      SELECT "TripID", MIN("TransactionDate") AS "TripStartDate"
      FROM "Transactions" WHERE "TripID" IS NOT NULL
      GROUP BY "TripID"
    ) "tripAgg" ON t."TripID" = "tripAgg"."TripID"
    WHERE t."UserID" = $2
      AND (
        (t."TripID" IS NULL AND TO_CHAR(t."TransactionDate", 'YYYY-MM') = $1)
        OR (t."TripID" IS NOT NULL AND TO_CHAR("tripAgg"."TripStartDate", 'YYYY-MM') = $1)
      )
  `;

  if (filters?.type) {
    params.push(filters.type);
    sql += ` AND t."Type" = $${paramIndex}`;
    paramIndex++;
  }

  if (filters?.categoryId) {
    params.push(filters.categoryId);
    sql += ` AND t."CategoryID" = $${paramIndex}`;
    paramIndex++;
  }

  if (filters?.status) {
    params.push(filters.status);
    sql += ` AND t."Status" = $${paramIndex}`;
    paramIndex++;
  }

  sql += ' ORDER BY t."TransactionDate" DESC, t."CreatedAt" DESC';

  const rows = await query<TransactionRow>(sql, params);
  return rows.map(rowToTransaction);
}

/**
 * Get a single transaction by ID (verifies ownership)
 */
export async function getTransactionById(transactionId: number): Promise<Transaction | null> {
  const userId = await getUserIdOrThrow();

  const rows = await query<TransactionRow>(
    `
    SELECT
      t."TransactionID", t."CategoryID", c."Name" AS "CategoryName",
      c."Icon" AS "CategoryIcon", c."Color" AS "CategoryColor",
      c."ParentCategoryID", parent."Name" AS "ParentCategoryName",
      t."AmountCents", t."Description", t."TransactionDate",
      t."Type", t."SharedDivisor", t."OriginalAmountCents",
      t."RecurringExpenseID", t."TransactionGroupID",
      t."TripID", trip."Name" AS "TripName",
      t."VatPercent", t."DeductionPercent", t."VendorName", t."InvoiceNumber",
      t."Status", t."CompanyID",
      (SELECT fd."DocumentID" FROM "FiscalDocuments" fd WHERE fd."TransactionID" = t."TransactionID" LIMIT 1) AS "FiscalDocumentID",
      t."CreatedAt", t."UpdatedAt"
    FROM "Transactions" t
    INNER JOIN "Categories" c ON t."CategoryID" = c."CategoryID"
    LEFT JOIN "Categories" parent ON c."ParentCategoryID" = parent."CategoryID"
    LEFT JOIN "Trips" trip ON t."TripID" = trip."TripID"
    WHERE t."TransactionID" = $1 AND t."UserID" = $2
  `,
    [transactionId, userId],
  );

  const row = rows[0];
  return row ? rowToTransaction(row) : null;
}

/**
 * Create a new transaction (user-scoped)
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
  vatPercent?: number | null;
  deductionPercent?: number | null;
  vendorName?: string | null;
  invoiceNumber?: string | null;
  companyId?: number | null;
  status?: TransactionStatus;
}): Promise<Transaction> {
  const userId = await getUserIdOrThrow();

  const rows = await query<{ TransactionID: number }>(
    `
    INSERT INTO "Transactions" (
      "CategoryID", "AmountCents", "Description", "TransactionDate", "Type",
      "SharedDivisor", "OriginalAmountCents", "RecurringExpenseID",
      "TransactionGroupID", "TripID", "VatPercent", "DeductionPercent",
      "VendorName", "InvoiceNumber", "CompanyID", "Status", "UserID"
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING "TransactionID"
  `,
    [
      data.categoryId,
      data.amountCents,
      data.description ?? null,
      toDateString(data.transactionDate),
      data.type,
      data.sharedDivisor ?? 1,
      data.originalAmountCents ?? null,
      data.recurringExpenseId ?? null,
      data.transactionGroupId ?? null,
      data.tripId ?? null,
      data.vatPercent ?? null,
      data.deductionPercent ?? null,
      data.vendorName ?? null,
      data.invoiceNumber ?? null,
      data.companyId ?? null,
      data.status ?? TRANSACTION_STATUS.PAID,
      userId,
    ],
  );

  const insertedId = rows[0]?.TransactionID;
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
 * Update an existing transaction (verifies ownership)
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
    vatPercent: number | null;
    deductionPercent: number | null;
    vendorName: string | null;
    invoiceNumber: string | null;
    companyId: number | null;
    status: TransactionStatus;
  }>,
): Promise<Transaction | null> {
  const userId = await getUserIdOrThrow();

  const updates: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (data.categoryId !== undefined) {
    updates.push(`"CategoryID" = $${paramIndex++}`);
    params.push(data.categoryId);
  }
  if (data.amountCents !== undefined) {
    updates.push(`"AmountCents" = $${paramIndex++}`);
    params.push(data.amountCents);
  }
  if (data.description !== undefined) {
    updates.push(`"Description" = $${paramIndex++}`);
    params.push(data.description);
  }
  if (data.transactionDate !== undefined) {
    updates.push(`"TransactionDate" = $${paramIndex++}`);
    params.push(toDateString(data.transactionDate));
  }
  if (data.type !== undefined) {
    updates.push(`"Type" = $${paramIndex++}`);
    params.push(data.type);
  }
  if (data.sharedDivisor !== undefined) {
    updates.push(`"SharedDivisor" = $${paramIndex++}`);
    params.push(data.sharedDivisor);
  }
  if (data.originalAmountCents !== undefined) {
    updates.push(`"OriginalAmountCents" = $${paramIndex++}`);
    params.push(data.originalAmountCents);
  }
  if (data.vatPercent !== undefined) {
    updates.push(`"VatPercent" = $${paramIndex++}`);
    params.push(data.vatPercent);
  }
  if (data.deductionPercent !== undefined) {
    updates.push(`"DeductionPercent" = $${paramIndex++}`);
    params.push(data.deductionPercent);
  }
  if (data.vendorName !== undefined) {
    updates.push(`"VendorName" = $${paramIndex++}`);
    params.push(data.vendorName);
  }
  if (data.invoiceNumber !== undefined) {
    updates.push(`"InvoiceNumber" = $${paramIndex++}`);
    params.push(data.invoiceNumber);
  }
  if (data.companyId !== undefined) {
    updates.push(`"CompanyID" = $${paramIndex++}`);
    params.push(data.companyId);
  }
  if (data.status !== undefined) {
    updates.push(`"Status" = $${paramIndex++}`);
    params.push(data.status);
  }

  if (updates.length === 0) {
    return getTransactionById(transactionId);
  }

  params.push(transactionId);
  params.push(userId);

  await query(
    `
    UPDATE "Transactions"
    SET ${updates.join(', ')}
    WHERE "TransactionID" = $${paramIndex} AND "UserID" = $${paramIndex + 1}
  `,
    params,
  );

  return getTransactionById(transactionId);
}

/**
 * Delete a transaction (verifies ownership)
 */
export async function deleteTransaction(transactionId: number): Promise<boolean> {
  const userId = await getUserIdOrThrow();

  const rows = await query<{ TransactionID: number }>(
    `
    DELETE FROM "Transactions"
    WHERE "TransactionID" = $1 AND "UserID" = $2
    RETURNING "TransactionID"
  `,
    [transactionId, userId],
  );

  return rows.length > 0;
}

/**
 * Update only the status of a transaction (lightweight PATCH)
 */
export async function updateTransactionStatus(
  transactionId: number,
  status: TransactionStatus,
): Promise<Transaction | null> {
  const userId = await getUserIdOrThrow();

  const rows = await query<{ TransactionID: number }>(
    `
    UPDATE "Transactions"
    SET "Status" = $1
    WHERE "TransactionID" = $2 AND "UserID" = $3
    RETURNING "TransactionID"
  `,
    [status, transactionId, userId],
  );

  if (rows.length === 0) return null;
  return getTransactionById(transactionId);
}

/**
 * Get monthly summary using database views (user-scoped)
 */
export async function getMonthlySummary(month: string): Promise<MonthlySummary> {
  const userId = await getUserIdOrThrow();

  const balanceRows = await query<BalanceRow>(
    `
    SELECT "Month", "IncomeCents", "ExpenseCents", "BalanceCents"
    FROM "vw_MonthlyBalance"
    WHERE "Month" = $1 AND "UserID" = $2
  `,
    [month, userId],
  );

  const categoryRows = await query<SummaryRow>(
    `
    SELECT "Month", "Type", "CategoryID", "CategoryName", "CategoryIcon",
           "CategoryColor", "TotalCents", "TransactionCount"
    FROM "vw_MonthlySummary"
    WHERE "Month" = $1 AND "UserID" = $2
    ORDER BY "Type", "TotalCents" DESC
  `,
    [month, userId],
  );

  const balance = balanceRows[0];
  // PG returns SUM()/bigint columns as strings; coerce so downstream maths never concatenates.
  const categories: CategorySummary[] = categoryRows.map((row) => ({
    categoryId: row.CategoryID,
    categoryName: row.CategoryName,
    categoryIcon: row.CategoryIcon,
    categoryColor: row.CategoryColor,
    type: row.Type,
    totalCents: Number(row.TotalCents),
    transactionCount: Number(row.TransactionCount),
  }));

  return {
    month,
    incomeCents: Number(balance?.IncomeCents ?? 0),
    expenseCents: Number(balance?.ExpenseCents ?? 0),
    balanceCents: Number(balance?.BalanceCents ?? 0),
    byCategory: categories,
  };
}

// Hard cap on the number of months returned, to bound the zero-fill loop.
const MAX_TREND_MONTHS = 600;

/**
 * Earliest month with balance activity for the current user (user-scoped).
 * Used to resolve the "all time" trend period. Returns null when there is no data.
 */
export async function getEarliestActivityMonth(): Promise<string | null> {
  const userId = await getUserIdOrThrow();

  const rows = await query<{ Month: string | null }>(
    `SELECT MIN("Month") AS "Month" FROM "vw_MonthlyBalance" WHERE "UserID" = $1`,
    [userId],
  );

  return rows[0]?.Month ?? null;
}

/**
 * Get monthly income/expense/balance trends across an inclusive month range
 * (user-scoped). Months with no data are zero-filled so charts have no gaps.
 */
export async function getMonthlyTrends(fromMonth: string, toMonth: string): Promise<MonthlySummaryTrends> {
  const userId = await getUserIdOrThrow();

  // Inverted ranges yield no points (string comparison is valid for YYYY-MM).
  if (fromMonth > toMonth) {
    return { fromMonth, toMonth, points: [] };
  }

  const balanceRows = await query<BalanceRow>(
    `
    SELECT "Month", "IncomeCents", "ExpenseCents", "BalanceCents"
    FROM "vw_MonthlyBalance"
    WHERE "Month" BETWEEN $1 AND $2 AND "UserID" = $3
    ORDER BY "Month"
  `,
    [fromMonth, toMonth, userId],
  );

  const byMonth = new Map(balanceRows.map((row) => [row.Month, row]));

  // Walk the continuous month sequence, zero-filling months without rows.
  const points: MonthlyTrendPoint[] = [];
  let cursor = fromMonth;
  while (cursor <= toMonth && points.length < MAX_TREND_MONTHS) {
    const row = byMonth.get(cursor);
    // PG returns SUM()/bigint columns as strings; coerce so downstream maths never concatenates.
    points.push({
      month: cursor,
      incomeCents: Number(row?.IncomeCents ?? 0),
      expenseCents: Number(row?.ExpenseCents ?? 0),
      balanceCents: Number(row?.BalanceCents ?? 0),
    });
    cursor = addMonths(cursor, 1);
  }

  return { fromMonth, toMonth, points };
}

/**
 * Get expense totals per category across an inclusive month range (user-scoped).
 * Returns raw per-month/per-category rows; pivoting + top-N is done client-side.
 */
export async function getCategoryTrends(fromMonth: string, toMonth: string): Promise<CategoryTrends> {
  const userId = await getUserIdOrThrow();

  if (fromMonth > toMonth) {
    return { fromMonth, toMonth, rows: [] };
  }

  const rows = await query<SummaryRow>(
    `
    SELECT "Month", "Type", "CategoryID", "CategoryName", "CategoryColor", "TotalCents"
    FROM "vw_MonthlySummary"
    WHERE "Month" BETWEEN $1 AND $2 AND "UserID" = $3 AND "Type" = $4
    ORDER BY "Month"
  `,
    [fromMonth, toMonth, userId, TRANSACTION_TYPE.EXPENSE],
  );

  // PG returns SUM()/bigint columns as strings; coerce to numbers.
  const trendRows: CategoryTrendRow[] = rows.map((row) => ({
    month: row.Month,
    categoryId: row.CategoryID,
    categoryName: row.CategoryName,
    categoryColor: row.CategoryColor,
    totalCents: Number(row.TotalCents),
  }));

  return { fromMonth, toMonth, rows: trendRows };
}

/**
 * Get subcategory drill-down (user-scoped)
 */
export async function getSubcategorySummary(month: string, parentCategoryId: number): Promise<SubcategorySummary[]> {
  const userId = await getUserIdOrThrow();

  const rows = await query<SubcategorySummaryRow>(
    `
    SELECT "Month", "ParentCategoryID", "SubcategoryID", "SubcategoryName",
           "SubcategoryIcon", "SubcategoryColor", "IsSubcategory",
           "TotalCents", "TransactionCount"
    FROM "vw_SubcategorySummary"
    WHERE "Month" = $1 AND "ParentCategoryID" = $2 AND "UserID" = $3
    ORDER BY "TotalCents" DESC
  `,
    [month, parentCategoryId, userId],
  );

  // PG returns SUM()/bigint columns as strings; coerce so downstream maths never concatenates.
  return rows.map((row) => ({
    parentCategoryId: row.ParentCategoryID,
    subcategoryId: row.SubcategoryID,
    subcategoryName: row.SubcategoryName,
    subcategoryIcon: row.SubcategoryIcon,
    subcategoryColor: row.SubcategoryColor,
    isSubcategory: row.IsSubcategory !== null,
    totalCents: Number(row.TotalCents),
    transactionCount: Number(row.TransactionCount),
  }));
}

// ============================================================
// CATEGORY HISTORY
// ============================================================

/**
 * Get aggregated summary for a category across a date range (user-scoped)
 */
export async function getCategoryHistorySummary(
  categoryId: number,
  dateFrom: Date,
  dateTo: Date,
): Promise<CategoryHistorySummary> {
  const userId = await getUserIdOrThrow();

  const rows = await query<{
    TotalCents: number;
    TransactionCount: number;
    MonthCount: number;
  }>(
    `
    SELECT
      COALESCE(SUM(t."AmountCents"), 0) AS "TotalCents",
      COUNT(t."TransactionID") AS "TransactionCount",
      COUNT(DISTINCT TO_CHAR(t."TransactionDate", 'YYYY-MM')) AS "MonthCount"
    FROM "Transactions" t
    INNER JOIN "Categories" c ON t."CategoryID" = c."CategoryID"
    WHERE (t."CategoryID" = $1 OR c."ParentCategoryID" = $1)
      AND t."TransactionDate" >= $2
      AND t."TransactionDate" <= $3
      AND t."UserID" = $4
      AND t."Status" = 'paid'
  `,
    [categoryId, dateFrom, dateTo, userId],
  );

  const row = rows[0];
  const totalCents = Number(row?.TotalCents ?? 0);
  const transactionCount = Number(row?.TransactionCount ?? 0);
  const monthCount = Number(row?.MonthCount ?? 0);

  return {
    totalCents,
    transactionCount,
    monthCount,
    averagePerMonthCents: monthCount > 0 ? Math.round(totalCents / monthCount) : 0,
  };
}

/**
 * Get transactions for a category across a date range (user-scoped)
 */
export async function getCategoryHistoryTransactions(
  categoryId: number,
  dateFrom: Date,
  dateTo: Date,
): Promise<Transaction[]> {
  const userId = await getUserIdOrThrow();

  const rows = await query<TransactionRow>(
    `
    SELECT
      t."TransactionID", t."CategoryID", c."Name" AS "CategoryName",
      c."Icon" AS "CategoryIcon", c."Color" AS "CategoryColor",
      c."ParentCategoryID", parent."Name" AS "ParentCategoryName",
      t."AmountCents", t."Description", t."TransactionDate",
      t."Type", t."SharedDivisor", t."OriginalAmountCents",
      t."RecurringExpenseID", t."TransactionGroupID",
      t."TripID", trip."Name" AS "TripName",
      t."VatPercent", t."DeductionPercent", t."VendorName", t."InvoiceNumber",
      t."Status", t."CompanyID", t."CreatedAt", t."UpdatedAt"
    FROM "Transactions" t
    INNER JOIN "Categories" c ON t."CategoryID" = c."CategoryID"
    LEFT JOIN "Categories" parent ON c."ParentCategoryID" = parent."CategoryID"
    LEFT JOIN "Trips" trip ON t."TripID" = trip."TripID"
    WHERE (t."CategoryID" = $1 OR c."ParentCategoryID" = $1)
      AND t."TransactionDate" >= $2
      AND t."TransactionDate" <= $3
      AND t."UserID" = $4
    ORDER BY t."TransactionDate" DESC, t."CreatedAt" DESC
  `,
    [categoryId, dateFrom, dateTo, userId],
  );

  return rows.map(rowToTransaction);
}

/**
 * Get all transactions for a company within a date range (user-scoped)
 */
export async function getCompanyTransactions(companyId: number, dateFrom: Date, dateTo: Date): Promise<Transaction[]> {
  const userId = await getUserIdOrThrow();

  const rows = await query<TransactionRow>(
    `
    SELECT
      t."TransactionID", t."CategoryID", c."Name" AS "CategoryName",
      c."Icon" AS "CategoryIcon", c."Color" AS "CategoryColor",
      c."ParentCategoryID", parent."Name" AS "ParentCategoryName",
      t."AmountCents", t."Description", t."TransactionDate",
      t."Type", t."SharedDivisor", t."OriginalAmountCents",
      t."RecurringExpenseID", t."TransactionGroupID",
      t."TripID", trip."Name" AS "TripName",
      t."VatPercent", t."DeductionPercent", t."VendorName", t."InvoiceNumber",
      t."Status", t."CompanyID", t."CreatedAt", t."UpdatedAt"
    FROM "Transactions" t
    INNER JOIN "Categories" c ON t."CategoryID" = c."CategoryID"
    LEFT JOIN "Categories" parent ON c."ParentCategoryID" = parent."CategoryID"
    LEFT JOIN "Trips" trip ON t."TripID" = trip."TripID"
    WHERE t."CompanyID" = $1
      AND t."TransactionDate" >= $2
      AND t."TransactionDate" <= $3
      AND t."UserID" = $4
    ORDER BY t."TransactionDate" DESC, t."CreatedAt" DESC
  `,
    [companyId, dateFrom, dateTo, userId],
  );

  return rows.map(rowToTransaction);
}

/**
 * Get summary stats for a company's transactions within a date range (user-scoped)
 */
export async function getCompanyTransactionsSummary(
  companyId: number,
  dateFrom: Date,
  dateTo: Date,
): Promise<CategoryHistorySummary> {
  const userId = await getUserIdOrThrow();

  const rows = await query<{
    TotalCents: number;
    TransactionCount: number;
    MonthCount: number;
  }>(
    `
    SELECT
      COALESCE(SUM(t."AmountCents"), 0) AS "TotalCents",
      COUNT(t."TransactionID") AS "TransactionCount",
      COUNT(DISTINCT TO_CHAR(t."TransactionDate", 'YYYY-MM')) AS "MonthCount"
    FROM "Transactions" t
    WHERE t."CompanyID" = $1
      AND t."TransactionDate" >= $2
      AND t."TransactionDate" <= $3
      AND t."UserID" = $4
      AND t."Status" = 'paid'
  `,
    [companyId, dateFrom, dateTo, userId],
  );

  const row = rows[0];
  const totalCents = Number(row?.TotalCents ?? 0);
  const transactionCount = Number(row?.TransactionCount ?? 0);
  const monthCount = Number(row?.MonthCount ?? 0);

  return {
    totalCents,
    transactionCount,
    monthCount,
    averagePerMonthCents: monthCount > 0 ? Math.round(totalCents / monthCount) : 0,
  };
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
 * Create a transaction group with multiple linked transactions (user-scoped)
 */
export async function createTransactionGroup(data: {
  description: string;
  transactionDate: Date;
  type: TransactionType;
  sharedDivisor: number;
  items: TransactionGroupItem[];
}): Promise<Transaction[]> {
  const userId = await getUserIdOrThrow();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const groupResult = await client.query<{ TransactionGroupID: number }>(
      'INSERT INTO "TransactionGroups" ("UserID") VALUES ($1) RETURNING "TransactionGroupID"',
      [userId],
    );

    const groupId = groupResult.rows[0]?.TransactionGroupID;
    if (!groupId) {
      throw new Error('Failed to create transaction group');
    }

    // Batch INSERT all items in a single query
    const dateStr = toDateString(data.transactionDate);
    const values = data.items
      .map(
        (_, i) =>
          `($${i * 9 + 1}, $${i * 9 + 2}, $${i * 9 + 3}, $${i * 9 + 4}, $${i * 9 + 5}, $${i * 9 + 6}, $${i * 9 + 7}, $${i * 9 + 8}, $${i * 9 + 9})`,
      )
      .join(', ');

    const params = data.items.flatMap((item) => [
      item.categoryId,
      item.amountCents,
      data.description,
      dateStr,
      data.type,
      data.sharedDivisor,
      item.originalAmountCents,
      groupId,
      userId,
    ]);

    await client.query(
      `INSERT INTO "Transactions" (
        "CategoryID", "AmountCents", "Description", "TransactionDate",
        "Type", "SharedDivisor", "OriginalAmountCents", "TransactionGroupID", "UserID"
      ) VALUES ${values}`,
      params,
    );

    await client.query('COMMIT');

    return getTransactionsByGroupId(groupId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get all transactions belonging to a group (user-scoped)
 */
export async function getTransactionsByGroupId(groupId: number): Promise<Transaction[]> {
  const userId = await getUserIdOrThrow();

  const rows = await query<TransactionRow>(
    `
    SELECT
      t."TransactionID", t."CategoryID", c."Name" AS "CategoryName",
      c."Icon" AS "CategoryIcon", c."Color" AS "CategoryColor",
      c."ParentCategoryID", parent."Name" AS "ParentCategoryName",
      t."AmountCents", t."Description", t."TransactionDate",
      t."Type", t."SharedDivisor", t."OriginalAmountCents",
      t."RecurringExpenseID", t."TransactionGroupID",
      t."TripID", trip."Name" AS "TripName",
      t."VatPercent", t."DeductionPercent", t."VendorName", t."InvoiceNumber",
      t."Status", t."CompanyID", t."CreatedAt", t."UpdatedAt"
    FROM "Transactions" t
    INNER JOIN "Categories" c ON t."CategoryID" = c."CategoryID"
    LEFT JOIN "Categories" parent ON c."ParentCategoryID" = parent."CategoryID"
    LEFT JOIN "Trips" trip ON t."TripID" = trip."TripID"
    WHERE t."TransactionGroupID" = $1 AND t."UserID" = $2
    ORDER BY t."TransactionID"
  `,
    [groupId, userId],
  );

  return rows.map(rowToTransaction);
}

/**
 * Delete an entire transaction group and all its transactions (verifies ownership)
 */
export async function deleteTransactionGroup(groupId: number): Promise<boolean> {
  const userId = await getUserIdOrThrow();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM "Transactions" WHERE "TransactionGroupID" = $1 AND "UserID" = $2', [
      groupId,
      userId,
    ]);

    const result = await client.query<{ TransactionGroupID: number }>(
      'DELETE FROM "TransactionGroups" WHERE "TransactionGroupID" = $1 AND "UserID" = $2 RETURNING "TransactionGroupID"',
      [groupId, userId],
    );

    await client.query('COMMIT');

    return result.rows.length > 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update a transaction group's shared fields and synchronize its line items
 * (verifies ownership). Description/date/type/sharedDivisor are propagated to
 * every transaction. Items are reconciled by category: existing rows are
 * updated, new categories inserted, and removed categories deleted — all
 * within a single transaction so the group never ends up partially updated.
 */
export async function updateTransactionGroup(
  groupId: number,
  data: {
    description: string;
    transactionDate: Date;
    type: TransactionType;
    sharedDivisor: number;
    items: TransactionGroupItem[];
  },
): Promise<Transaction[]> {
  const userId = await getUserIdOrThrow();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existing = await client.query<{ TransactionID: number; CategoryID: number }>(
      'SELECT "TransactionID", "CategoryID" FROM "Transactions" WHERE "TransactionGroupID" = $1 AND "UserID" = $2',
      [groupId, userId],
    );

    const existingByCategory = new Map(existing.rows.map((row) => [row.CategoryID, row.TransactionID]));
    const newCategoryIds = new Set(data.items.map((item) => item.categoryId));
    const dateStr = toDateString(data.transactionDate);

    // Delete line items whose category is no longer part of the group
    const idsToDelete = existing.rows
      .filter((row) => !newCategoryIds.has(row.CategoryID))
      .map((row) => row.TransactionID);

    if (idsToDelete.length > 0) {
      await client.query('DELETE FROM "Transactions" WHERE "TransactionID" = ANY($1::int[]) AND "UserID" = $2', [
        idsToDelete,
        userId,
      ]);
    }

    // Upsert each item: update when the category already exists, insert otherwise.
    // Queued sequentially on the same client (node-postgres serializes per client).
    await Promise.all(
      data.items.map((item) => {
        const existingId = existingByCategory.get(item.categoryId);
        if (existingId !== undefined) {
          return client.query(
            `UPDATE "Transactions"
             SET "AmountCents" = $1, "OriginalAmountCents" = $2, "Description" = $3,
                 "TransactionDate" = $4, "Type" = $5, "SharedDivisor" = $6
             WHERE "TransactionID" = $7 AND "UserID" = $8`,
            [
              item.amountCents,
              item.originalAmountCents,
              data.description,
              dateStr,
              data.type,
              data.sharedDivisor,
              existingId,
              userId,
            ],
          );
        }
        return client.query(
          `INSERT INTO "Transactions" (
            "CategoryID", "AmountCents", "Description", "TransactionDate",
            "Type", "SharedDivisor", "OriginalAmountCents", "TransactionGroupID", "UserID"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            item.categoryId,
            item.amountCents,
            data.description,
            dateStr,
            data.type,
            data.sharedDivisor,
            item.originalAmountCents,
            groupId,
            userId,
          ],
        );
      }),
    );

    await client.query('COMMIT');

    return getTransactionsByGroupId(groupId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Clean up orphaned transaction groups
 */
export async function cleanupOrphanedGroup(groupId: number): Promise<boolean> {
  const countRows = await query<{ count: number }>(
    'SELECT COUNT(*) AS "count" FROM "Transactions" WHERE "TransactionGroupID" = $1',
    [groupId],
  );

  const remaining = countRows[0]?.count ?? 0;

  if (remaining === 0) {
    await query('DELETE FROM "TransactionGroups" WHERE "TransactionGroupID" = $1', [groupId]);
    return true;
  }

  return false;
}
