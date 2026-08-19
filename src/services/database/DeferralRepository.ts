/**
 * BudgetGuard Deferral Repository
 *
 * Persistence for the AEAT aplazamientos/fraccionamientos: the "Deferrals" header and the pending
 * movements each fracción is booked as.
 *
 * **There is no fracciones table.** A fracción IS its movements — one row per legally distinct part
 * (principal, recargo, interés), all dated on the vencimiento and all linked back through
 * "DeferralID" / "DeferralFraccionNumber" / "DeferralPart". Storing ANEXO I a second time would
 * create a copy that can drift from the movements the user actually pays, and the only figure worth
 * trusting is the one that is going to be paid. {@link getDeferralFracciones} therefore rebuilds the
 * table by adding those rows back up, which is also what makes the stored letter verifiable against
 * itself long after the import (see `verifyDeferral`).
 *
 * The import is one transaction (BEGIN/COMMIT), like the atomic creations in InvoiceRepository and
 * SkydiveRepository: a resolution with only half its instalments booked is worse than no resolution.
 *
 * All queries are user-scoped through getUserIdOrThrow().
 */

import {
  API_ERROR,
  DEFERRAL_CANCELLABLE_MOVEMENT_STATUS,
  DEFERRAL_CANCELLED_MOVEMENT_STATUS,
  DEFERRAL_CATEGORY,
  DEFERRAL_PART,
  SHARED_EXPENSE,
  TRANSACTION_STATUS,
  TRANSACTION_TYPE,
} from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import type { DeferralFiltersInput } from '@/schemas/deferral';
import type {
  Deferral,
  DeferralFraccion,
  DeferralInput,
  DeferralPart,
  DeferralUpdateInput,
  TransactionStatus,
} from '@/types/finance';
import { ConflictError } from '@/utils/apiErrors';
import { toDateString } from '@/utils/helpers';
import { getPool, query } from './connection';

// ============================================================
// Row Types
// ============================================================

interface DeferralRow {
  DeferralID: number;
  ExpedienteNumber: string;
  ModeloType: string;
  FiscalYear: number;
  FiscalQuarter: number | null;
  LiquidacionNumber: string | null;
  InterestStartDate: Date | string;
  /** NUMERIC(6,3): the driver hands it over as a string */
  InterestRatePercent: number | string;
  PrincipalCents: number | string;
  SurchargeCents: number | string;
  InterestCents: number | string;
  FiscalDocumentID: number | null;
  CreatedAt: Date | string;
  UpdatedAt: Date | string;
}

/** One rebuilt row of ANEXO I: the movements of a fracción, folded back into their three parts */
interface FraccionRow {
  FraccionNumber: number;
  PrincipalCents: number | string;
  SurchargeCents: number | string;
  InterestCents: number | string;
  TotalCents: number | string;
  DueDate: Date | string;
}

/** One booked movement of a fracción, exactly as its "Transactions" row stands */
interface DeferralMovementRow {
  TransactionID: number;
  DeferralFraccionNumber: number;
  DeferralPart: string;
  AmountCents: number | string;
  TransactionDate: Date | string;
  Status: string;
}

/** Columns shared by every SELECT and by the RETURNING of the mutations */
const DEFERRAL_COLUMNS = `"DeferralID", "ExpedienteNumber", "ModeloType", "FiscalYear", "FiscalQuarter",
  "LiquidacionNumber", "InterestStartDate", "InterestRatePercent", "PrincipalCents", "SurchargeCents",
  "InterestCents", "FiscalDocumentID", "CreatedAt", "UpdatedAt"`;

/** Domain field -> column, for the INSERT and for the partial UPDATE (same order in both) */
const WRITABLE_COLUMNS: Record<keyof DeferralInput, string> = {
  expedienteNumber: '"ExpedienteNumber"',
  modeloType: '"ModeloType"',
  fiscalYear: '"FiscalYear"',
  fiscalQuarter: '"FiscalQuarter"',
  liquidacionNumber: '"LiquidacionNumber"',
  interestStartDate: '"InterestStartDate"',
  interestRatePercent: '"InterestRatePercent"',
  principalCents: '"PrincipalCents"',
  surchargeCents: '"SurchargeCents"',
  interestCents: '"InterestCents"',
  fiscalDocumentId: '"FiscalDocumentID"',
};

const WRITABLE_FIELDS = Object.keys(WRITABLE_COLUMNS) as (keyof DeferralInput)[];

/**
 * Columns of one booked part of a fracción, in the order the batch INSERT writes them.
 *
 * There is no "VatPercent" here, and therefore deliberately no "VatDeductionPercent" either: no
 * part of a deferral carries input VAT — the principal *is* the IVA, already declared in the
 * quarter it accrued — so there is nothing for an IVA share to apply to. "DeductionPercent" is the
 * IRPF one, 0 for principal and recargo (art. 15.c LIS) and 100 for the interés.
 */
const MOVEMENT_COLUMNS = `"CategoryID", "AmountCents", "Description", "TransactionDate", "Type",
  "SharedDivisor", "Status", "DeductionPercent", "VendorName", "TransactionGroupID",
  "DeferralID", "DeferralFraccionNumber", "DeferralPart", "UserID"`;

const MOVEMENT_COLUMN_COUNT = 14;

/**
 * Columns every read of a booked movement asks for, and the RETURNING of the cancellation.
 *
 * Deliberately not the whole row: what a fracción is worth, when it falls due and where it stands
 * is all a cancellation needs, and a repository that hands back the description and the category
 * invites the caller to start re-deciding them.
 */
const MOVEMENT_READ_COLUMNS = `"TransactionID", "DeferralFraccionNumber", "DeferralPart", "AmountCents",
  "TransactionDate", "Status"`;

/** Fracción order, then insertion order inside it — the order ANEXO I and the import both use */
const MOVEMENT_ORDER = 'ORDER BY "DeferralFraccionNumber", "TransactionID"';

/** SQLSTATE of a UNIQUE breach — here, "UQ_Deferrals_UserExpediente" */
const PG_UNIQUE_VIOLATION = '23505';

/** PostgreSQL surfaces constraint breaches as errors carrying a SQLSTATE `code`. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === PG_UNIQUE_VIOLATION;
}

// ============================================================
// Transformers
// ============================================================

function toISOString(val: Date | string): string {
  return typeof val === 'string' ? val : val.toISOString();
}

function rowToDeferral(row: DeferralRow): Deferral {
  return {
    deferralId: row.DeferralID,
    expedienteNumber: row.ExpedienteNumber,
    // CK_Deferrals_Quarter and the "ModeloType" CHECK keep these two inside their domains
    modeloType: row.ModeloType as Deferral['modeloType'],
    fiscalYear: row.FiscalYear,
    fiscalQuarter: row.FiscalQuarter as Deferral['fiscalQuarter'],
    liquidacionNumber: row.LiquidacionNumber,
    interestStartDate: toDateString(row.InterestStartDate),
    interestRatePercent: Number(row.InterestRatePercent),
    principalCents: Number(row.PrincipalCents),
    surchargeCents: Number(row.SurchargeCents),
    interestCents: Number(row.InterestCents),
    fiscalDocumentId: row.FiscalDocumentID,
    createdAt: toISOString(row.CreatedAt),
    updatedAt: toISOString(row.UpdatedAt),
  };
}

function rowToFraccion(row: FraccionRow): DeferralFraccion {
  return {
    fraccionNumber: row.FraccionNumber,
    principalCents: Number(row.PrincipalCents),
    surchargeCents: Number(row.SurchargeCents),
    interestCents: Number(row.InterestCents),
    totalCents: Number(row.TotalCents),
    dueDate: toDateString(row.DueDate),
  };
}

function rowToMovement(row: DeferralMovementRow): DeferralMovementRecord {
  return {
    transactionId: row.TransactionID,
    fraccionNumber: row.DeferralFraccionNumber,
    // CK_Transactions_Deferral and the "Status" CHECK keep both of these inside their domains
    part: row.DeferralPart as DeferralPart,
    amountCents: Number(row.AmountCents),
    dueDate: toDateString(row.TransactionDate),
    status: row.Status as TransactionStatus,
  };
}

/** A DATE column takes a calendar day: an ISO instant would shift it by one day for half the year */
function toParam(field: keyof DeferralInput, value: DeferralUpdateInput[keyof DeferralInput]): unknown {
  if (field === 'interestStartDate' && typeof value === 'string') return toDateString(value);
  return value ?? null;
}

// ============================================================
// Queries
// ============================================================

/**
 * Resolutions of the current user, most recent period first.
 *
 * `year` filters on the period being deferred, not on the year the instalments fall due: a 2T 2026
 * deferral paid off through February 2027 belongs to 2026, which is the year its Modelo 130 was.
 */
export async function getDeferrals(filters: DeferralFiltersInput = {}): Promise<Deferral[]> {
  const userId = await getUserIdOrThrow();
  const params: unknown[] = [userId];
  const conditions: string[] = [];

  if (filters.year !== undefined) {
    params.push(filters.year);
    conditions.push(`AND "FiscalYear" = $${params.length}`);
  }
  if (filters.modeloType !== undefined) {
    params.push(filters.modeloType);
    conditions.push(`AND "ModeloType" = $${params.length}`);
  }

  const rows = await query<DeferralRow>(
    `SELECT ${DEFERRAL_COLUMNS}
     FROM "Deferrals"
     WHERE "UserID" = $1 ${conditions.join(' ')}
     ORDER BY "FiscalYear" DESC, "FiscalQuarter" DESC NULLS LAST, "DeferralID" DESC`,
    params,
  );
  return rows.map(rowToDeferral);
}

export async function getDeferralById(deferralId: number): Promise<Deferral | null> {
  const userId = await getUserIdOrThrow();
  const rows = await query<DeferralRow>(
    `SELECT ${DEFERRAL_COLUMNS} FROM "Deferrals" WHERE "DeferralID" = $1 AND "UserID" = $2`,
    [deferralId, userId],
  );
  return rows[0] ? rowToDeferral(rows[0]) : null;
}

/**
 * ANEXO I of a stored resolution, rebuilt from the movements it was booked as.
 *
 * A part worth 0,00 € has no movement — a zero-euro expense is noise in every list — so its column
 * comes back as the zero it is, and the fracción still adds up. Cancelled and already paid rows are
 * included on purpose: this is what the letter says, not what is left to pay.
 *
 * The vencimiento is taken as the MIN of the parts' dates, which are all the same day at import.
 * They only diverge if the user moved one movement by hand, and then the earliest is the honest
 * answer — the letter itself is the record, and the verdict on it will say so.
 */
export async function getDeferralFracciones(deferralId: number): Promise<DeferralFraccion[]> {
  const userId = await getUserIdOrThrow();

  const rows = await query<FraccionRow>(
    `SELECT "DeferralFraccionNumber" AS "FraccionNumber",
            COALESCE(SUM("AmountCents") FILTER (WHERE "DeferralPart" = $3), 0) AS "PrincipalCents",
            COALESCE(SUM("AmountCents") FILTER (WHERE "DeferralPart" = $4), 0) AS "SurchargeCents",
            COALESCE(SUM("AmountCents") FILTER (WHERE "DeferralPart" = $5), 0) AS "InterestCents",
            SUM("AmountCents") AS "TotalCents",
            MIN("TransactionDate") AS "DueDate"
     FROM "Transactions"
     WHERE "DeferralID" = $1 AND "UserID" = $2
     GROUP BY "DeferralFraccionNumber"
     ORDER BY "DeferralFraccionNumber"`,
    [deferralId, userId, DEFERRAL_PART.PRINCIPAL, DEFERRAL_PART.SURCHARGE, DEFERRAL_PART.INTEREST],
  );
  return rows.map(rowToFraccion);
}

/**
 * One booked movement of a resolution, as it stands. The read counterpart of
 * {@link DeferralMovementDraft}: the draft says what to write, this says what is there now.
 *
 * The status is the movement's own, never the fracción's. The three parts of an instalment are
 * three rows and can disagree — one marked paid by hand while the other two are still pending —
 * and folding them into a single status is a decision, so it belongs to the service.
 */
export interface DeferralMovementRecord {
  transactionId: number;
  /** 1..N of ANEXO I. Movements sharing this number are the parts of the same instalment */
  fraccionNumber: number;
  part: DeferralPart;
  amountCents: number;
  /** "TransactionDate": the vencimiento the part was booked on, 'YYYY-MM-DD' */
  dueDate: string;
  status: TransactionStatus;
}

/**
 * Every movement a resolution was booked as, part by part, in printed order.
 *
 * Unlike {@link getDeferralFracciones}, which folds the parts back into ANEXO I, this keeps them
 * apart and carries their status: it is the input to deciding what a cancellation may touch, and
 * that decision is per movement, not per fracción.
 *
 * Paid and cancelled rows come back too. A cancellation has to show what it will NOT touch just as
 * clearly as what it will.
 */
export async function getDeferralMovements(deferralId: number): Promise<DeferralMovementRecord[]> {
  const userId = await getUserIdOrThrow();

  const rows = await query<DeferralMovementRow>(
    `SELECT ${MOVEMENT_READ_COLUMNS}
     FROM "Transactions"
     WHERE "DeferralID" = $1 AND "UserID" = $2
     ${MOVEMENT_ORDER}`,
    [deferralId, userId],
  );
  return rows.map(rowToMovement);
}

/** The two subcategories a fracción is booked into. Null when the user no longer has one of them. */
export interface DeferralCategoryIds {
  /** "Intereses de demora" — casilla 0203, the only deductible part */
  interestCategoryId: number;
  /** "Impuestos" — where the principal and the recargo land, both at 0 % deduction */
  taxCategoryId: number;
}

/**
 * Resolve the subcategories the parts of a fracción are booked into, by name under "Trabajo".
 *
 * Same lookup shape as findBankFeeSubcategoryIdInTx / findSkydiveSubcategoryId. Read outside the
 * import transaction on purpose: a category deleted between this lookup and the INSERT would break
 * FK_Transactions_Category and roll the whole import back anyway, so locking buys nothing.
 */
export async function getDeferralCategoryIds(): Promise<DeferralCategoryIds | null> {
  const userId = await getUserIdOrThrow();

  const rows = await query<{ CategoryID: number; Name: string }>(
    `SELECT sub."CategoryID", sub."Name"
     FROM "Categories" sub
     INNER JOIN "Categories" parent ON sub."ParentCategoryID" = parent."CategoryID"
     WHERE parent."Name" = $1 AND parent."ParentCategoryID" IS NULL
       AND sub."UserID" = $2 AND sub."Name" IN ($3, $4)`,
    [
      DEFERRAL_CATEGORY.PARENT_NAME,
      userId,
      DEFERRAL_CATEGORY.INTEREST_SUBCATEGORY_NAME,
      DEFERRAL_CATEGORY.TAX_SUBCATEGORY_NAME,
    ],
  );

  const byName = new Map(rows.map((row) => [row.Name, row.CategoryID]));
  const interestCategoryId = byName.get(DEFERRAL_CATEGORY.INTEREST_SUBCATEGORY_NAME);
  const taxCategoryId = byName.get(DEFERRAL_CATEGORY.TAX_SUBCATEGORY_NAME);

  if (interestCategoryId === undefined || taxCategoryId === undefined) return null;
  return { interestCategoryId, taxCategoryId };
}

// ============================================================
// Mutations
// ============================================================

/**
 * One movement to book for one part of one fracción, already resolved by the import service.
 *
 * The repository does not decide any of this: which parts exist, what they are worth and how much
 * of each is deductible is fiscal policy, and it lives in DeferralImportService.
 */
export interface DeferralMovementDraft {
  /** 1..N of ANEXO I. Movements sharing this number are the parts of the same instalment */
  fraccionNumber: number;
  part: DeferralPart;
  categoryId: number;
  amountCents: number;
  /** "Fecha de vencimiento" of the fracción, 'YYYY-MM-DD' */
  dueDate: string;
  description: string;
  /** 0 for principal and recargo, 100 for the interés — never a preference */
  deductionPercent: number;
  vendorName: string;
}

/**
 * A pool client inside an open transaction, narrowed to the rows the helper reads.
 *
 * Structural like the tx-scoped helpers of InvoiceRepository: the connection is a Neon pool or a
 * pg one depending on the URL, and neither client type needs naming here.
 */
interface TransactionClientFor<TRow> {
  query: (text: string, params: unknown[]) => Promise<{ rows: TRow[] }>;
}

/**
 * One "TransactionGroups" row per fracción that books more than one part, so the UI shows the
 * principal, the recargo and the interés of an instalment as the single payment they are.
 *
 * A fracción with a single movement gets no group: a group of one is a row that says nothing.
 *
 * The ids are sorted before being handed out. RETURNING has no ordering guarantee, but the SERIAL
 * is drawn once per generated row in order, so ascending id IS insertion order — and sorting makes
 * that independent of how the driver returns them.
 */
async function createFraccionGroups(
  client: TransactionClientFor<{ TransactionGroupID: number }>,
  userId: number,
  fraccionNumbers: readonly number[],
): Promise<Map<number, number>> {
  if (fraccionNumbers.length === 0) return new Map();

  const result = await client.query(
    `INSERT INTO "TransactionGroups" ("UserID")
     SELECT $1 FROM generate_series(1, $2)
     RETURNING "TransactionGroupID"`,
    [userId, fraccionNumbers.length],
  );

  const groupIds = result.rows.map((row) => row.TransactionGroupID).sort((a, b) => a - b);
  return new Map(fraccionNumbers.map((fraccionNumber, index) => [fraccionNumber, groupIds[index]!]));
}

/** Fracciones that book more than one part, in printed order — the ones that need a group. */
function fraccionesNeedingGroup(movements: readonly DeferralMovementDraft[]): number[] {
  const counts = movements.reduce(
    (acc, movement) => acc.set(movement.fraccionNumber, (acc.get(movement.fraccionNumber) ?? 0) + 1),
    new Map<number, number>(),
  );

  return [...counts.entries()].filter(([, count]) => count > 1).map(([fraccionNumber]) => fraccionNumber);
}

/** Every movement of the resolution in a single multi-row INSERT, as the other batch writes do. */
async function insertMovements(
  client: TransactionClientFor<{ TransactionID: number }>,
  userId: number,
  deferralId: number,
  movements: readonly DeferralMovementDraft[],
  groupIds: Map<number, number>,
): Promise<number> {
  // Unreachable through the schema (a deferral has a principal, so some fracción books one), but a
  // VALUES list with nothing in it is a syntax error, not an empty write
  if (movements.length === 0) return 0;

  const rows = movements.map((_, index) => {
    const base = index * MOVEMENT_COLUMN_COUNT;
    const placeholders = Array.from({ length: MOVEMENT_COLUMN_COUNT }, (_, offset) => `$${base + offset + 1}`);
    return `(${placeholders.join(', ')})`;
  });

  const params = movements.flatMap((movement) => [
    movement.categoryId,
    movement.amountCents,
    movement.description,
    movement.dueDate,
    TRANSACTION_TYPE.EXPENSE,
    SHARED_EXPENSE.DEFAULT_DIVISOR,
    // Nothing is paid yet: the whole point of the resolution is that these fall due later, and
    // pending rows stay out of every summary view and fiscal report until they are settled.
    TRANSACTION_STATUS.PENDING,
    movement.deductionPercent,
    movement.vendorName,
    groupIds.get(movement.fraccionNumber) ?? null,
    deferralId,
    movement.fraccionNumber,
    movement.part,
    userId,
  ]);

  const result = await client.query(
    `INSERT INTO "Transactions" (${MOVEMENT_COLUMNS})
     VALUES ${rows.join(', ')}
     RETURNING "TransactionID"`,
    params,
  );
  return result.rows.length;
}

/** What an import wrote: the stored resolution and how many movements it booked. */
export interface CreatedDeferral {
  deferral: Deferral;
  movementCount: number;
}

/**
 * Store a resolution and book every movement of its fracciones — atomically.
 *
 * Idempotency is the database's, not a pre-check's: "UQ_Deferrals_UserExpediente" is what makes
 * importing the same letter twice impossible, and it holds against two requests racing each other,
 * which a SELECT-then-INSERT does not. The unique breach becomes a {@link ConflictError} and the
 * route answers 409 — with the transaction rolled back, so the second import books no movement at
 * all rather than a duplicate set of them.
 */
export async function createDeferralWithMovements(
  input: DeferralInput,
  movements: readonly DeferralMovementDraft[],
): Promise<CreatedDeferral> {
  const userId = await getUserIdOrThrow();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const columns = WRITABLE_FIELDS.map((field) => WRITABLE_COLUMNS[field]);
    const placeholders = WRITABLE_FIELDS.map((_, index) => `$${index + 2}`);

    const deferralResult = await client.query<DeferralRow>(
      `INSERT INTO "Deferrals" ("UserID", ${columns.join(', ')})
       VALUES ($1, ${placeholders.join(', ')})
       RETURNING ${DEFERRAL_COLUMNS}`,
      [userId, ...WRITABLE_FIELDS.map((field) => toParam(field, input[field]))],
    );

    const deferralRow = deferralResult.rows[0];
    if (!deferralRow) throw new Error('Failed to create deferral');

    const groupIds = await createFraccionGroups(client, userId, fraccionesNeedingGroup(movements));
    const movementCount = await insertMovements(client, userId, deferralRow.DeferralID, movements, groupIds);

    await client.query('COMMIT');
    return { deferral: rowToDeferral(deferralRow), movementCount };
  } catch (error) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(error)) throw new ConflictError(API_ERROR.CONFLICT.DEFERRAL_EXPEDIENTE_EXISTS);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update the header of a stored resolution. An omitted field keeps its value.
 *
 * The fracciones are untouched: they are movements now, and a paid instalment is corrected on its
 * own row, never by rewriting the letter it came from.
 */
export async function updateDeferral(deferralId: number, input: DeferralUpdateInput): Promise<Deferral | null> {
  const userId = await getUserIdOrThrow();

  const changed = WRITABLE_FIELDS.filter((field) => input[field] !== undefined);
  if (changed.length === 0) return getDeferralById(deferralId);

  const assignments = changed.map((field, index) => `${WRITABLE_COLUMNS[field]} = $${index + 1}`);
  const idPlaceholder = changed.length + 1;

  try {
    const rows = await query<DeferralRow>(
      `UPDATE "Deferrals" SET ${assignments.join(', ')}
       WHERE "DeferralID" = $${idPlaceholder} AND "UserID" = $${idPlaceholder + 1}
       RETURNING ${DEFERRAL_COLUMNS}`,
      [...changed.map((field) => toParam(field, input[field])), deferralId, userId],
    );
    return rows[0] ? rowToDeferral(rows[0]) : null;
  } catch (error) {
    // Renaming a resolution onto another one's expediente is the same collision as importing it
    if (isUniqueViolation(error)) throw new ConflictError(API_ERROR.CONFLICT.DEFERRAL_EXPEDIENTE_EXISTS);
    throw error;
  }
}

/** What a delete removed: the resolution, and the instalments that had not been paid yet. */
export interface DeletedDeferral {
  deleted: boolean;
  removedMovements: number;
}

/**
 * Delete a resolution and the movements it booked that are still pending.
 *
 * Pending only. A movement already marked paid is money that really left the account, and the
 * import being wrong does not undo the payment — those rows survive, with "DeferralID" nulled by
 * FK_Transactions_Deferral (ON DELETE SET NULL), keeping their fracción number and their part so
 * they still say what they were. Cancelled rows are kept for the same reason: they are a decision
 * the user took, not something this import owns.
 *
 * The groups of the deleted movements go too, but only once they are empty — a group still holding
 * a paid part is what keeps that payment readable.
 */
export async function deleteDeferral(deferralId: number): Promise<DeletedDeferral> {
  const userId = await getUserIdOrThrow();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const removed = await client.query<{ TransactionGroupID: number | null }>(
      `DELETE FROM "Transactions"
       WHERE "DeferralID" = $1 AND "UserID" = $2 AND "Status" = $3
       RETURNING "TransactionGroupID"`,
      [deferralId, userId, TRANSACTION_STATUS.PENDING],
    );

    const groupIds = [...new Set(removed.rows.map((row) => row.TransactionGroupID).filter((id) => id !== null))];

    if (groupIds.length > 0) {
      await client.query(
        `DELETE FROM "TransactionGroups" g
         WHERE g."TransactionGroupID" = ANY($1::int[]) AND g."UserID" = $2
           AND NOT EXISTS (
             SELECT 1 FROM "Transactions" t WHERE t."TransactionGroupID" = g."TransactionGroupID"
           )`,
        [groupIds, userId],
      );
    }

    const deleted = await client.query<{ DeferralID: number }>(
      `DELETE FROM "Deferrals" WHERE "DeferralID" = $1 AND "UserID" = $2 RETURNING "DeferralID"`,
      [deferralId, userId],
    );

    await client.query('COMMIT');
    return { deleted: deleted.rows.length > 0, removedMovements: removed.rows.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** What a cancellation found and what it wrote. */
export interface CancelledDeferralMovements {
  /** Null when no resolution with that id belongs to the current user — a 404, not a conflict */
  deferral: Deferral | null;
  /**
   * The rows this call moved to cancelled, with their new status. Empty when nothing was pending,
   * which is what tells the caller there was nothing left to cancel — never a pre-check.
   */
  cancelled: DeferralMovementRecord[];
  /** Every movement of the resolution AFTER the update, so the state reported is the written one */
  movements: DeferralMovementRecord[];
}

/**
 * Cancel a resolution: every fracción movement still pending becomes cancelled, atomically.
 *
 * **The "Deferrals" row survives, and nothing on it changes.** Three reasons, in order of weight:
 *
 * 1. "UQ_Deferrals_UserExpediente" is what stops the same letter being imported twice, and the
 *    expediente is that key. Deleting the row frees it, so the very next upload of the same PDF
 *    would silently re-book the instalments the user has just decided to cancel.
 * 2. The cancelled movements keep pointing at it through "DeferralID". The letter is the only
 *    thing that explains what those rows were, and FK_Transactions_Deferral would null the link.
 * 3. There is no status column to set: DEFERRAL_STATUS is derived from the movements every time it
 *    is read, so a resolution whose fracciones are all cancelled already reads as cancelled.
 *
 * Deleting a resolution is a different operation and it already exists ({@link deleteDeferral}):
 * that one is for an import that was wrong, this one is for a deferral that really was cancelled.
 *
 * **The guard is in the UPDATE, not in a check before it.** Only rows still
 * DEFERRAL_CANCELLABLE_MOVEMENT_STATUS are matched, so an instalment marked paid between the
 * preview and the confirmation is not rewritten, and two cancellations racing each other cannot
 * both claim the same fracción — the second matches nothing and its caller answers 409.
 */
export async function cancelDeferralPendingMovements(deferralId: number): Promise<CancelledDeferralMovements> {
  const userId = await getUserIdOrThrow();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const deferralResult = await client.query<DeferralRow>(
      `SELECT ${DEFERRAL_COLUMNS} FROM "Deferrals" WHERE "DeferralID" = $1 AND "UserID" = $2`,
      [deferralId, userId],
    );

    const deferralRow = deferralResult.rows[0];
    if (!deferralRow) {
      await client.query('ROLLBACK');
      return { deferral: null, cancelled: [], movements: [] };
    }

    const cancelledResult = await client.query<DeferralMovementRow>(
      `UPDATE "Transactions" SET "Status" = $3
       WHERE "DeferralID" = $1 AND "UserID" = $2 AND "Status" = $4
       RETURNING ${MOVEMENT_READ_COLUMNS}`,
      [deferralId, userId, DEFERRAL_CANCELLED_MOVEMENT_STATUS, DEFERRAL_CANCELLABLE_MOVEMENT_STATUS],
    );

    // Read back inside the same transaction: the caller derives the resolution's state from this,
    // and it has to be the state the COMMIT leaves behind, not the one the update intended.
    const movementsResult = await client.query<DeferralMovementRow>(
      `SELECT ${MOVEMENT_READ_COLUMNS}
       FROM "Transactions"
       WHERE "DeferralID" = $1 AND "UserID" = $2
       ${MOVEMENT_ORDER}`,
      [deferralId, userId],
    );

    await client.query('COMMIT');

    return {
      deferral: rowToDeferral(deferralRow),
      cancelled: cancelledResult.rows.map(rowToMovement),
      movements: movementsResult.rows.map(rowToMovement),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
