/**
 * BudgetGuard Recurring Expense Repository
 * Database operations for recurring expense rules and occurrences
 */

import sql from 'mssql';
import { OCCURRENCE_STATUS, TRANSACTION_TYPE } from '@/constants/finance';
import type {
  OccurrenceStatus,
  PendingOccurrenceMonth,
  PendingOccurrencesSummary,
  RecurringExpense,
  RecurringFrequency,
  RecurringOccurrence,
} from '@/types/finance';
import { calculateAllPendingDates, getMonthFromDate } from '@/utils/recurring';
import { getConnection } from './connection';
import { createTransaction } from './TransactionRepository';

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
  // Joined fields from RecurringExpenses + Categories
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
    startDate: row.StartDate.toISOString().split('T')[0] || '',
    endDate: row.EndDate ? row.EndDate.toISOString().split('T')[0] || '' : null,
    isActive: row.IsActive,
    sharedDivisor: row.SharedDivisor,
    originalAmountCents: row.OriginalAmountCents,
    createdAt: row.CreatedAt.toISOString(),
    updatedAt: row.UpdatedAt.toISOString(),
  };
}

function rowToOccurrence(row: OccurrenceRow): RecurringOccurrence {
  return {
    occurrenceId: row.OccurrenceID,
    recurringExpenseId: row.RecurringExpenseID,
    occurrenceDate: row.OccurrenceDate.toISOString().split('T')[0] || '',
    status: row.Status,
    transactionId: row.TransactionID,
    modifiedAmountCents: row.ModifiedAmountCents,
    processedAt: row.ProcessedAt ? row.ProcessedAt.toISOString() : null,
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
      startDate: row.RE_StartDate.toISOString().split('T')[0] || '',
      endDate: row.RE_EndDate ? row.RE_EndDate.toISOString().split('T')[0] || '' : null,
      isActive: row.RE_IsActive,
      sharedDivisor: row.RE_SharedDivisor,
      originalAmountCents: row.RE_OriginalAmountCents,
      createdAt: row.RE_CreatedAt.toISOString(),
      updatedAt: row.RE_UpdatedAt.toISOString(),
    },
  };
}

// ============================================================
// Shared SQL fragments
// ============================================================

const RECURRING_EXPENSE_SELECT = `
  re.RecurringExpenseID, re.CategoryID,
  c.Name AS CategoryName, c.Icon AS CategoryIcon,
  c.Color AS CategoryColor, c.ParentCategoryID,
  re.AmountCents, re.Description, re.Frequency,
  re.DayOfWeek, re.DayOfMonth, re.MonthOfYear,
  re.StartDate, re.EndDate, re.IsActive,
  re.SharedDivisor, re.OriginalAmountCents,
  re.CreatedAt, re.UpdatedAt
`;

const RECURRING_EXPENSE_JOIN = `
  FROM RecurringExpenses re
  INNER JOIN Categories c ON re.CategoryID = c.CategoryID
`;

// ============================================================
// CRUD Operations
// ============================================================

/**
 * Get all recurring expenses, optionally filtered
 */
export async function getRecurringExpenses(filters?: { isActive?: boolean }): Promise<RecurringExpense[]> {
  const pool = await getConnection();
  const request = pool.request();

  let query = `SELECT ${RECURRING_EXPENSE_SELECT} ${RECURRING_EXPENSE_JOIN}`;

  if (filters?.isActive !== undefined) {
    request.input('isActive', sql.Bit, filters.isActive);
    query += ' WHERE re.IsActive = @isActive';
  }

  query += ' ORDER BY re.CreatedAt DESC';

  const result = await request.query<RecurringExpenseRow>(query);
  return result.recordset.map(rowToRecurringExpense);
}

/**
 * Get a single recurring expense by ID
 */
export async function getRecurringExpenseById(id: number): Promise<RecurringExpense | null> {
  const pool = await getConnection();
  const request = pool.request();

  request.input('id', sql.Int, id);

  const result = await request.query<RecurringExpenseRow>(`
    SELECT ${RECURRING_EXPENSE_SELECT}
    ${RECURRING_EXPENSE_JOIN}
    WHERE re.RecurringExpenseID = @id
  `);

  const row = result.recordset[0];
  return row ? rowToRecurringExpense(row) : null;
}

/**
 * Create a new recurring expense
 * @param data - amountCents already in cents
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
  const pool = await getConnection();
  const request = pool.request();

  request.input('categoryId', sql.Int, data.categoryId);
  request.input('amountCents', sql.Int, data.amountCents);
  request.input('description', sql.NVarChar(255), data.description ?? null);
  request.input('frequency', sql.NVarChar(10), data.frequency);
  request.input('dayOfWeek', sql.TinyInt, data.dayOfWeek ?? null);
  request.input('dayOfMonth', sql.TinyInt, data.dayOfMonth ?? null);
  request.input('monthOfYear', sql.TinyInt, data.monthOfYear ?? null);
  request.input('startDate', sql.Date, data.startDate);
  request.input('endDate', sql.Date, data.endDate ?? null);
  request.input('sharedDivisor', sql.TinyInt, data.sharedDivisor ?? 1);
  request.input('originalAmountCents', sql.Int, data.originalAmountCents ?? null);

  const result = await request.query<{ RecurringExpenseID: number }>(`
    DECLARE @out TABLE (RecurringExpenseID INT);
    INSERT INTO RecurringExpenses (
      CategoryID, AmountCents, Description, Frequency,
      DayOfWeek, DayOfMonth, MonthOfYear,
      StartDate, EndDate, SharedDivisor, OriginalAmountCents
    )
    OUTPUT INSERTED.RecurringExpenseID INTO @out
    VALUES (
      @categoryId, @amountCents, @description, @frequency,
      @dayOfWeek, @dayOfMonth, @monthOfYear,
      @startDate, @endDate, @sharedDivisor, @originalAmountCents
    );
    SELECT * FROM @out;
  `);

  const insertedId = result.recordset[0]?.RecurringExpenseID;
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
 * Update an existing recurring expense
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
  const pool = await getConnection();
  const request = pool.request();

  request.input('id', sql.Int, id);

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
  if (data.frequency !== undefined) {
    request.input('frequency', sql.NVarChar(10), data.frequency);
    updates.push('Frequency = @frequency');
  }
  if (data.dayOfWeek !== undefined) {
    request.input('dayOfWeek', sql.TinyInt, data.dayOfWeek);
    updates.push('DayOfWeek = @dayOfWeek');
  }
  if (data.dayOfMonth !== undefined) {
    request.input('dayOfMonth', sql.TinyInt, data.dayOfMonth);
    updates.push('DayOfMonth = @dayOfMonth');
  }
  if (data.monthOfYear !== undefined) {
    request.input('monthOfYear', sql.TinyInt, data.monthOfYear);
    updates.push('MonthOfYear = @monthOfYear');
  }
  if (data.startDate !== undefined) {
    request.input('startDate', sql.Date, data.startDate);
    updates.push('StartDate = @startDate');
  }
  if (data.endDate !== undefined) {
    request.input('endDate', sql.Date, data.endDate);
    updates.push('EndDate = @endDate');
  }
  if (data.isActive !== undefined) {
    request.input('isActive', sql.Bit, data.isActive);
    updates.push('IsActive = @isActive');
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
    return getRecurringExpenseById(id);
  }

  await request.query(`
    UPDATE RecurringExpenses
    SET ${updates.join(', ')}
    WHERE RecurringExpenseID = @id
  `);

  return getRecurringExpenseById(id);
}

/**
 * Soft-delete a recurring expense (set IsActive = 0)
 */
export async function deleteRecurringExpense(id: number): Promise<boolean> {
  const pool = await getConnection();
  const request = pool.request();

  request.input('id', sql.Int, id);

  const result = await request.query(`
    UPDATE RecurringExpenses
    SET IsActive = 0
    WHERE RecurringExpenseID = @id
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}

// ============================================================
// Occurrence Operations
// ============================================================

/**
 * Get all pending occurrences retroactively.
 * 1. Gets all active rules
 * 2. Calculates expected dates from each rule's startDate to current month
 * 3. Creates 'pending' records for dates without existing occurrences
 * 4. Returns all 'pending' occurrences grouped by month
 */
export async function getAllPendingOccurrences(): Promise<PendingOccurrencesSummary> {
  const pool = await getConnection();

  // Get all active recurring expenses
  const rules = await getRecurringExpenses({ isActive: true });

  // Current month
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Generate missing occurrences for each rule
  await Promise.all(
    rules.map(async (rule) => {
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

      // Insert missing occurrences (ignore duplicates via unique constraint)
      await Promise.all(
        expectedDates.map(async (dateStr) => {
          const req = pool.request();
          req.input('recurringExpenseId', sql.Int, rule.recurringExpenseId);
          req.input('occurrenceDate', sql.Date, new Date(dateStr));
          req.input('status', sql.NVarChar(10), OCCURRENCE_STATUS.PENDING);

          // Use a merge to avoid duplicate inserts
          await req.query(`
            IF NOT EXISTS (
              SELECT 1 FROM RecurringExpenseOccurrences
              WHERE RecurringExpenseID = @recurringExpenseId
                AND OccurrenceDate = @occurrenceDate
            )
            INSERT INTO RecurringExpenseOccurrences (RecurringExpenseID, OccurrenceDate, Status)
            VALUES (@recurringExpenseId, @occurrenceDate, @status)
          `);
        }),
      );
    }),
  );

  // Fetch all pending occurrences
  const result = await pool.request().query<OccurrenceRow>(`
    SELECT
      o.OccurrenceID, o.RecurringExpenseID, o.OccurrenceDate,
      o.Status, o.TransactionID, o.ModifiedAmountCents, o.ProcessedAt,
      re.CategoryID AS RE_CategoryID,
      c.Name AS RE_CategoryName,
      c.Icon AS RE_CategoryIcon,
      c.Color AS RE_CategoryColor,
      c.ParentCategoryID AS RE_ParentCategoryID,
      re.AmountCents AS RE_AmountCents,
      re.Description AS RE_Description,
      re.Frequency AS RE_Frequency,
      re.DayOfWeek AS RE_DayOfWeek,
      re.DayOfMonth AS RE_DayOfMonth,
      re.MonthOfYear AS RE_MonthOfYear,
      re.StartDate AS RE_StartDate,
      re.EndDate AS RE_EndDate,
      re.IsActive AS RE_IsActive,
      re.SharedDivisor AS RE_SharedDivisor,
      re.OriginalAmountCents AS RE_OriginalAmountCents,
      re.CreatedAt AS RE_CreatedAt,
      re.UpdatedAt AS RE_UpdatedAt
    FROM RecurringExpenseOccurrences o
    INNER JOIN RecurringExpenses re ON o.RecurringExpenseID = re.RecurringExpenseID
    INNER JOIN Categories c ON re.CategoryID = c.CategoryID
    WHERE o.Status = 'pending'
      AND re.IsActive = 1
    ORDER BY o.OccurrenceDate ASC
  `);

  const occurrences = result.recordset.map(rowToOccurrence);

  // Group by month
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
 * Confirm an occurrence: creates a real transaction and marks it as confirmed
 */
export async function confirmOccurrence(
  occurrenceId: number,
  modifiedAmountCents?: number,
): Promise<RecurringOccurrence> {
  const pool = await getConnection();

  // Get the occurrence with its recurring expense details
  const occResult = await pool
    .request()
    .input('occurrenceId', sql.Int, occurrenceId)
    .query<OccurrenceRow>(`
    SELECT
      o.OccurrenceID, o.RecurringExpenseID, o.OccurrenceDate,
      o.Status, o.TransactionID, o.ModifiedAmountCents, o.ProcessedAt,
      re.CategoryID AS RE_CategoryID,
      c.Name AS RE_CategoryName,
      c.Icon AS RE_CategoryIcon,
      c.Color AS RE_CategoryColor,
      c.ParentCategoryID AS RE_ParentCategoryID,
      re.AmountCents AS RE_AmountCents,
      re.Description AS RE_Description,
      re.Frequency AS RE_Frequency,
      re.DayOfWeek AS RE_DayOfWeek,
      re.DayOfMonth AS RE_DayOfMonth,
      re.MonthOfYear AS RE_MonthOfYear,
      re.StartDate AS RE_StartDate,
      re.EndDate AS RE_EndDate,
      re.IsActive AS RE_IsActive,
      re.SharedDivisor AS RE_SharedDivisor,
      re.OriginalAmountCents AS RE_OriginalAmountCents,
      re.CreatedAt AS RE_CreatedAt,
      re.UpdatedAt AS RE_UpdatedAt
    FROM RecurringExpenseOccurrences o
    INNER JOIN RecurringExpenses re ON o.RecurringExpenseID = re.RecurringExpenseID
    INNER JOIN Categories c ON re.CategoryID = c.CategoryID
    WHERE o.OccurrenceID = @occurrenceId
  `);

  const row = occResult.recordset[0];
  if (!row) {
    throw new Error('Occurrence not found');
  }

  if (row.Status !== OCCURRENCE_STATUS.PENDING) {
    throw new Error('Occurrence is not pending');
  }

  const amountCents = modifiedAmountCents ?? row.RE_AmountCents;

  // Create the real transaction
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

  // Update occurrence status
  await pool
    .request()
    .input('occurrenceId', sql.Int, occurrenceId)
    .input('transactionId', sql.Int, transaction.transactionId)
    .input('modifiedAmountCents', sql.Int, modifiedAmountCents ?? null)
    .input('status', sql.NVarChar(10), OCCURRENCE_STATUS.CONFIRMED)
    .input('processedAt', sql.DateTime2, new Date())
    .query(`
    UPDATE RecurringExpenseOccurrences
    SET Status = @status,
        TransactionID = @transactionId,
        ModifiedAmountCents = @modifiedAmountCents,
        ProcessedAt = @processedAt
    WHERE OccurrenceID = @occurrenceId
  `);

  return rowToOccurrence({ ...row, Status: OCCURRENCE_STATUS.CONFIRMED, TransactionID: transaction.transactionId });
}

/**
 * Skip an occurrence
 */
export async function skipOccurrence(occurrenceId: number): Promise<boolean> {
  const pool = await getConnection();
  const request = pool.request();

  request.input('occurrenceId', sql.Int, occurrenceId);
  request.input('status', sql.NVarChar(10), OCCURRENCE_STATUS.SKIPPED);
  request.input('processedAt', sql.DateTime2, new Date());

  const result = await request.query(`
    UPDATE RecurringExpenseOccurrences
    SET Status = @status, ProcessedAt = @processedAt
    WHERE OccurrenceID = @occurrenceId AND Status = 'pending'
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}
