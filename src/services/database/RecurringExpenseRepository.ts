/**
 * BudgetGuard Recurring Expense Repository
 * Database operations for recurring expense rules and occurrences (user-scoped)
 */

import { OCCURRENCE_STATUS, TRANSACTION_TYPE } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import type {
  OccurrenceStatus,
  PendingOccurrenceMonth,
  PendingOccurrencesSummary,
  RecurringExpense,
  RecurringFrequency,
  RecurringOccurrence,
} from '@/types/finance';
import { toDateString } from '@/utils/helpers';
import { calculateAllPendingDates, getMonthFromDate } from '@/utils/recurring';
import { query } from './connection';
import { createTransaction } from './TransactionRepository';

function toISOString(val: Date | string): string {
  if (typeof val === 'string') return val;
  return val.toISOString();
}

// ============================================================
// Row Types
// ============================================================

interface RecurringExpenseRow {
  RecurringExpenseID: number;
  CategoryID: number;
  CategoryName: string;
  CategoryIcon: string | null;
  CategoryColor: string | null;
  ParentCategoryID: number | null;
  AmountCents: number;
  Description: string | null;
  Frequency: RecurringFrequency;
  DayOfWeek: number | null;
  DayOfMonth: number | null;
  MonthOfYear: number | null;
  StartDate: Date;
  EndDate: Date | null;
  IsActive: boolean;
  SharedDivisor: number;
  OriginalAmountCents: number | null;
  CreatedAt: Date;
  UpdatedAt: Date;
}

interface OccurrenceRow {
  OccurrenceID: number;
  RecurringExpenseID: number;
  OccurrenceDate: Date;
  Status: OccurrenceStatus;
  TransactionID: number | null;
  ModifiedAmountCents: number | null;
  ProcessedAt: Date | null;
  RE_CategoryID: number;
  RE_CategoryName: string;
  RE_CategoryIcon: string | null;
  RE_CategoryColor: string | null;
  RE_ParentCategoryID: number | null;
  RE_AmountCents: number;
  RE_Description: string | null;
  RE_Frequency: RecurringFrequency;
  RE_DayOfWeek: number | null;
  RE_DayOfMonth: number | null;
  RE_MonthOfYear: number | null;
  RE_StartDate: Date;
  RE_EndDate: Date | null;
  RE_IsActive: boolean;
  RE_SharedDivisor: number;
  RE_OriginalAmountCents: number | null;
  RE_CreatedAt: Date;
  RE_UpdatedAt: Date;
}

// ============================================================
// Row Transformers
// ============================================================

function rowToRecurringExpense(row: RecurringExpenseRow): RecurringExpense {
  return {
    recurringExpenseId: row.RecurringExpenseID,
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
    amountCents: row.AmountCents,
    description: row.Description,
    frequency: row.Frequency,
    dayOfWeek: row.DayOfWeek,
    dayOfMonth: row.DayOfMonth,
    monthOfYear: row.MonthOfYear,
    startDate: toDateString(row.StartDate),
    endDate: row.EndDate ? toDateString(row.EndDate) : null,
    isActive: row.IsActive,
    sharedDivisor: row.SharedDivisor,
    originalAmountCents: row.OriginalAmountCents,
    createdAt: toISOString(row.CreatedAt),
    updatedAt: toISOString(row.UpdatedAt),
  };
}

function rowToOccurrence(row: OccurrenceRow): RecurringOccurrence {
  return {
    occurrenceId: row.OccurrenceID,
    recurringExpenseId: row.RecurringExpenseID,
    occurrenceDate: toDateString(row.OccurrenceDate),
    status: row.Status,
    transactionId: row.TransactionID,
    modifiedAmountCents: row.ModifiedAmountCents,
    processedAt: row.ProcessedAt ? toISOString(row.ProcessedAt) : null,
    recurringExpense: {
      recurringExpenseId: row.RecurringExpenseID,
      categoryId: row.RE_CategoryID,
      category: {
        categoryId: row.RE_CategoryID,
        name: row.RE_CategoryName,
        type: TRANSACTION_TYPE.EXPENSE,
        icon: row.RE_CategoryIcon,
        color: row.RE_CategoryColor,
        sortOrder: 0,
        isActive: true,
        parentCategoryId: row.RE_ParentCategoryID,
        defaultShared: false,
        defaultVatPercent: null,
        defaultDeductionPercent: null,
      },
      amountCents: row.RE_AmountCents,
      description: row.RE_Description,
      frequency: row.RE_Frequency,
      dayOfWeek: row.RE_DayOfWeek,
      dayOfMonth: row.RE_DayOfMonth,
      monthOfYear: row.RE_MonthOfYear,
      startDate: toDateString(row.RE_StartDate),
      endDate: row.RE_EndDate ? toDateString(row.RE_EndDate) : null,
      isActive: row.RE_IsActive,
      sharedDivisor: row.RE_SharedDivisor,
      originalAmountCents: row.RE_OriginalAmountCents,
      createdAt: toISOString(row.RE_CreatedAt),
      updatedAt: toISOString(row.RE_UpdatedAt),
    },
  };
}

// ============================================================
// Shared SQL fragments
// ============================================================

const RECURRING_EXPENSE_SELECT = `
  re."RecurringExpenseID", re."CategoryID",
  c."Name" AS "CategoryName", c."Icon" AS "CategoryIcon",
  c."Color" AS "CategoryColor", c."ParentCategoryID",
  re."AmountCents", re."Description", re."Frequency",
  re."DayOfWeek", re."DayOfMonth", re."MonthOfYear",
  re."StartDate", re."EndDate", re."IsActive",
  re."SharedDivisor", re."OriginalAmountCents",
  re."CreatedAt", re."UpdatedAt"
`;

const RECURRING_EXPENSE_JOIN = `
  FROM "RecurringExpenses" re
  INNER JOIN "Categories" c ON re."CategoryID" = c."CategoryID"
`;

// ============================================================
// CRUD Operations (user-scoped)
// ============================================================

/**
 * Get all recurring expenses for the current user
 */
export async function getRecurringExpenses(filters?: { isActive?: boolean }): Promise<RecurringExpense[]> {
  const userId = await getUserIdOrThrow();
  const params: unknown[] = [userId];
  let sql = `SELECT ${RECURRING_EXPENSE_SELECT} ${RECURRING_EXPENSE_JOIN} WHERE re."UserID" = $1`;

  if (filters?.isActive !== undefined) {
    params.push(filters.isActive);
    sql += ` AND re."IsActive" = $2`;
  }

  sql += ` ORDER BY re."CreatedAt" DESC`;

  const rows = await query<RecurringExpenseRow>(sql, params);
  return rows.map(rowToRecurringExpense);
}

/**
 * Get a single recurring expense by ID (verifies ownership)
 */
export async function getRecurringExpenseById(id: number): Promise<RecurringExpense | null> {
  const userId = await getUserIdOrThrow();

  const rows = await query<RecurringExpenseRow>(
    `SELECT ${RECURRING_EXPENSE_SELECT}
    ${RECURRING_EXPENSE_JOIN}
    WHERE re."RecurringExpenseID" = $1 AND re."UserID" = $2`,
    [id, userId],
  );

  const row = rows[0];
  return row ? rowToRecurringExpense(row) : null;
}

/**
 * Create a new recurring expense (user-scoped)
 */
export async function createRecurringExpense(data: {
  categoryId: number;
  amountCents: number;
  description?: string;
  frequency: RecurringFrequency;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  monthOfYear?: number | null;
  startDate: Date;
  endDate?: Date | null;
  sharedDivisor?: number;
  originalAmountCents?: number | null;
}): Promise<RecurringExpense> {
  const userId = await getUserIdOrThrow();

  const rows = await query<{ RecurringExpenseID: number }>(
    `INSERT INTO "RecurringExpenses" ("CategoryID", "AmountCents", "Description", "Frequency",
                                          "DayOfWeek", "DayOfMonth", "MonthOfYear",
                                          "StartDate", "EndDate", "SharedDivisor", "OriginalAmountCents", "UserID")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING "RecurringExpenseID"`,
    [
      data.categoryId,
      data.amountCents,
      data.description ?? null,
      data.frequency,
      data.dayOfWeek ?? null,
      data.dayOfMonth ?? null,
      data.monthOfYear ?? null,
      toDateString(data.startDate),
      data.endDate ? toDateString(data.endDate) : null,
      data.sharedDivisor ?? 1,
      data.originalAmountCents ?? null,
      userId,
    ],
  );

  const insertedId = rows[0]?.RecurringExpenseID;
  if (!insertedId) {
    throw new Error('Failed to create recurring expense');
  }

  const expense = await getRecurringExpenseById(insertedId);
  if (!expense) {
    throw new Error('Failed to retrieve created recurring expense');
  }

  return expense;
}

/**
 * Update an existing recurring expense (verifies ownership)
 */
export async function updateRecurringExpense(
  id: number,
  data: Partial<{
    categoryId: number;
    amountCents: number;
    description: string | null;
    frequency: RecurringFrequency;
    dayOfWeek: number | null;
    dayOfMonth: number | null;
    monthOfYear: number | null;
    startDate: Date;
    endDate: Date | null;
    isActive: boolean;
    sharedDivisor: number;
    originalAmountCents: number | null;
  }>,
): Promise<RecurringExpense | null> {
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
  if (data.frequency !== undefined) {
    updates.push(`"Frequency" = $${paramIndex++}`);
    params.push(data.frequency);
  }
  if (data.dayOfWeek !== undefined) {
    updates.push(`"DayOfWeek" = $${paramIndex++}`);
    params.push(data.dayOfWeek);
  }
  if (data.dayOfMonth !== undefined) {
    updates.push(`"DayOfMonth" = $${paramIndex++}`);
    params.push(data.dayOfMonth);
  }
  if (data.monthOfYear !== undefined) {
    updates.push(`"MonthOfYear" = $${paramIndex++}`);
    params.push(data.monthOfYear);
  }
  if (data.startDate !== undefined) {
    updates.push(`"StartDate" = $${paramIndex++}`);
    params.push(toDateString(data.startDate));
  }
  if (data.endDate !== undefined) {
    updates.push(`"EndDate" = $${paramIndex++}`);
    params.push(data.endDate ? toDateString(data.endDate) : null);
  }
  if (data.isActive !== undefined) {
    updates.push(`"IsActive" = $${paramIndex++}`);
    params.push(data.isActive);
  }
  if (data.sharedDivisor !== undefined) {
    updates.push(`"SharedDivisor" = $${paramIndex++}`);
    params.push(data.sharedDivisor);
  }
  if (data.originalAmountCents !== undefined) {
    updates.push(`"OriginalAmountCents" = $${paramIndex++}`);
    params.push(data.originalAmountCents);
  }

  if (updates.length === 0) {
    return getRecurringExpenseById(id);
  }

  params.push(id);
  params.push(userId);

  await query(
    `UPDATE "RecurringExpenses"
         SET ${updates.join(', ')}
         WHERE "RecurringExpenseID" = $${paramIndex}
           AND "UserID" = $${paramIndex + 1}`,
    params,
  );

  return getRecurringExpenseById(id);
}

/**
 * Soft-delete a recurring expense (verifies ownership)
 */
export async function deleteRecurringExpense(id: number): Promise<boolean> {
  const userId = await getUserIdOrThrow();

  const rows = await query<{ RecurringExpenseID: number }>(
    `UPDATE "RecurringExpenses"
         SET "IsActive" = false
         WHERE "RecurringExpenseID" = $1
           AND "UserID" = $2 RETURNING "RecurringExpenseID"`,
    [id, userId],
  );

  return rows.length > 0;
}

// ============================================================
// Occurrence Operations (user-scoped)
// ============================================================

/**
 * Get all pending occurrences for the current user
 */
export async function getAllPendingOccurrences(): Promise<PendingOccurrencesSummary> {
  const userId = await getUserIdOrThrow();

  const rules = await getRecurringExpenses({ isActive: true });

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Collect all dates to insert per rule, then batch INSERT with ON CONFLICT
  await Promise.all(
    rules.map((rule) => {
      const fromMonth = getMonthFromDate(rule.startDate);
      const toMonth = rule.endDate ? getMonthFromDate(rule.endDate) : currentMonth;
      const effectiveToMonth = toMonth < currentMonth ? toMonth : currentMonth;

      const expectedDates = calculateAllPendingDates(
        {
          frequency: rule.frequency,
          dayOfWeek: rule.dayOfWeek,
          dayOfMonth: rule.dayOfMonth,
          monthOfYear: rule.monthOfYear,
          startDate: rule.startDate,
          endDate: rule.endDate,
        },
        fromMonth,
        effectiveToMonth,
      );

      if (expectedDates.length === 0) return Promise.resolve();

      // Batch INSERT all dates for this rule in a single query
      const values = expectedDates.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ');

      const params = expectedDates.flatMap((dateStr) => [
        rule.recurringExpenseId,
        new Date(dateStr),
        OCCURRENCE_STATUS.PENDING,
      ]);

      return query(
        `INSERT INTO "RecurringExpenseOccurrences" ("RecurringExpenseID", "OccurrenceDate", "Status")
         VALUES ${values} ON CONFLICT ("RecurringExpenseID", "OccurrenceDate") DO NOTHING`,
        params,
      );
    }),
  );

  const rows = await query<OccurrenceRow>(
    `SELECT o."OccurrenceID",
                o."RecurringExpenseID",
                o."OccurrenceDate",
                o."Status",
                o."TransactionID",
                o."ModifiedAmountCents",
                o."ProcessedAt",
                re."CategoryID"          AS "RE_CategoryID",
                c."Name"                 AS "RE_CategoryName",
                c."Icon"                 AS "RE_CategoryIcon",
                c."Color"                AS "RE_CategoryColor",
                c."ParentCategoryID"     AS "RE_ParentCategoryID",
                re."AmountCents"         AS "RE_AmountCents",
                re."Description"         AS "RE_Description",
                re."Frequency"           AS "RE_Frequency",
                re."DayOfWeek"           AS "RE_DayOfWeek",
                re."DayOfMonth"          AS "RE_DayOfMonth",
                re."MonthOfYear"         AS "RE_MonthOfYear",
                re."StartDate"           AS "RE_StartDate",
                re."EndDate"             AS "RE_EndDate",
                re."IsActive"            AS "RE_IsActive",
                re."SharedDivisor"       AS "RE_SharedDivisor",
                re."OriginalAmountCents" AS "RE_OriginalAmountCents",
                re."CreatedAt"           AS "RE_CreatedAt",
                re."UpdatedAt"           AS "RE_UpdatedAt"
         FROM "RecurringExpenseOccurrences" o
                  INNER JOIN "RecurringExpenses" re ON o."RecurringExpenseID" = re."RecurringExpenseID"
                  INNER JOIN "Categories" c ON re."CategoryID" = c."CategoryID"
         WHERE o."Status" = 'pending'
           AND re."IsActive" = true
           AND re."UserID" = $1
         ORDER BY o."OccurrenceDate" ASC`,
    [userId],
  );

  const occurrences = rows.map(rowToOccurrence);

  const monthMap = new Map<string, RecurringOccurrence[]>();
  occurrences.forEach((occ) => {
    const month = getMonthFromDate(occ.occurrenceDate);
    const existing = monthMap.get(month) ?? [];
    existing.push(occ);
    monthMap.set(month, existing);
  });

  const months: PendingOccurrenceMonth[] = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, occs]) => ({
      month,
      occurrences: occs,
      totalPendingCents: occs.reduce((sum, o) => sum + o.recurringExpense.amountCents, 0),
      count: occs.length,
    }));

  return {
    months,
    totalCount: occurrences.length,
  };
}

/**
 * Confirm an occurrence (verifies ownership via recurring expense)
 */
export async function confirmOccurrence(
  occurrenceId: number,
  modifiedAmountCents?: number,
): Promise<RecurringOccurrence> {
  const userId = await getUserIdOrThrow();

  const rows = await query<OccurrenceRow>(
    `SELECT o."OccurrenceID",
                o."RecurringExpenseID",
                o."OccurrenceDate",
                o."Status",
                o."TransactionID",
                o."ModifiedAmountCents",
                o."ProcessedAt",
                re."CategoryID"          AS "RE_CategoryID",
                c."Name"                 AS "RE_CategoryName",
                c."Icon"                 AS "RE_CategoryIcon",
                c."Color"                AS "RE_CategoryColor",
                c."ParentCategoryID"     AS "RE_ParentCategoryID",
                re."AmountCents"         AS "RE_AmountCents",
                re."Description"         AS "RE_Description",
                re."Frequency"           AS "RE_Frequency",
                re."DayOfWeek"           AS "RE_DayOfWeek",
                re."DayOfMonth"          AS "RE_DayOfMonth",
                re."MonthOfYear"         AS "RE_MonthOfYear",
                re."StartDate"           AS "RE_StartDate",
                re."EndDate"             AS "RE_EndDate",
                re."IsActive"            AS "RE_IsActive",
                re."SharedDivisor"       AS "RE_SharedDivisor",
                re."OriginalAmountCents" AS "RE_OriginalAmountCents",
                re."CreatedAt"           AS "RE_CreatedAt",
                re."UpdatedAt"           AS "RE_UpdatedAt"
         FROM "RecurringExpenseOccurrences" o
                  INNER JOIN "RecurringExpenses" re ON o."RecurringExpenseID" = re."RecurringExpenseID"
                  INNER JOIN "Categories" c ON re."CategoryID" = c."CategoryID"
         WHERE o."OccurrenceID" = $1
           AND re."UserID" = $2`,
    [occurrenceId, userId],
  );

  const row = rows[0];
  if (!row) {
    throw new Error('Occurrence not found');
  }

  if (row.Status !== OCCURRENCE_STATUS.PENDING) {
    throw new Error('Occurrence is not pending');
  }

  const amountCents = modifiedAmountCents ?? row.RE_AmountCents;

  const transaction = await createTransaction({
    categoryId: row.RE_CategoryID,
    amountCents,
    description: row.RE_Description ?? undefined,
    transactionDate: row.OccurrenceDate,
    type: TRANSACTION_TYPE.EXPENSE,
    sharedDivisor: row.RE_SharedDivisor,
    originalAmountCents: row.RE_OriginalAmountCents,
    recurringExpenseId: row.RecurringExpenseID,
  });

  await query(
    `UPDATE "RecurringExpenseOccurrences"
         SET "Status"              = $1,
             "TransactionID"       = $2,
             "ModifiedAmountCents" = $3,
             "ProcessedAt"         = $4
         WHERE "OccurrenceID" = $5`,
    [OCCURRENCE_STATUS.CONFIRMED, transaction.transactionId, modifiedAmountCents ?? null, new Date(), occurrenceId],
  );

  return rowToOccurrence({ ...row, Status: OCCURRENCE_STATUS.CONFIRMED, TransactionID: transaction.transactionId });
}

/**
 * Skip an occurrence (verifies ownership via recurring expense)
 */
export async function skipOccurrence(occurrenceId: number): Promise<boolean> {
  const userId = await getUserIdOrThrow();

  const rows = await query<{ OccurrenceID: number }>(
    `UPDATE "RecurringExpenseOccurrences"
         SET "Status" = $1,
             "ProcessedAt" = $2
         WHERE "OccurrenceID" = $3
           AND "Status" = 'pending'
           AND "RecurringExpenseID" IN (SELECT "RecurringExpenseID"
                                        FROM "RecurringExpenses"
                                        WHERE "UserID" = $4)
             RETURNING "OccurrenceID"`,
    [OCCURRENCE_STATUS.SKIPPED, new Date(), occurrenceId, userId],
  );

  return rows.length > 0;
}
