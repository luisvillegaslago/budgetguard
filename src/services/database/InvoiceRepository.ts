/**
 * BudgetGuard Invoice Repository
 * Database operations for billing profiles, invoice prefixes, and invoices (user-scoped)
 */

import { del } from '@vercel/blob';
import {
  API_ERROR,
  BANK_FEE_CATEGORY,
  CROSS_QUARTER_CASE,
  FISCAL_DOCUMENT_TYPE,
  FISCAL_STATUS,
  INVOICE_STATUS,
  ISSUED_INVOICE_STATUSES,
  TRANSACTION_STATUS,
  TRANSACTION_TYPE,
} from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import type { BillingProfileInput, CreateInvoiceInput, UpdateInvoiceInput } from '@/schemas/invoice';
import type {
  BadDebtInvoice,
  BadDebtReport,
  BillingProfile,
  CrossQuarterCase,
  CrossQuarterInvoice,
  Invoice,
  InvoiceLineItem,
  InvoiceListItem,
  InvoicePrefix,
  InvoiceStatus,
  PaymentMethod,
} from '@/types/finance';
import { ValidationError } from '@/utils/apiErrors';
import { computeBadDebtWindows, hasBadDebtAttention, resolveBadDebtExclusion } from '@/utils/badDebt';
import { computeInvoiceAmounts } from '@/utils/invoiceAmounts';
import { getPool, query } from './connection';

function toISOString(val: Date | string): string {
  if (typeof val === 'string') return val;
  return val.toISOString();
}

function toDateString(val: Date | string): string {
  if (typeof val === 'string') return val.split('T')[0] || val;
  const year = val.getFullYear();
  const month = String(val.getMonth() + 1).padStart(2, '0');
  const day = String(val.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================================
// Row types
// ============================================================

interface BillingProfileRow {
  BillingProfileID: number;
  FullName: string;
  Nif: string;
  Address: string | null;
  Phone: string | null;
  PaymentMethod: string;
  BankName: string | null;
  Iban: string | null;
  Swift: string | null;
  BankAddress: string | null;
  DefaultHourlyRateCents: number | null;
  CreatedAt: Date;
  UpdatedAt: Date;
}

interface InvoicePrefixRow {
  PrefixID: number;
  Prefix: string;
  NextNumber: number;
  Description: string | null;
  CompanyID: number | null;
  IsActive: boolean;
  CreatedAt: Date;
}

interface InvoiceRow {
  InvoiceID: number;
  PrefixID: number;
  InvoiceNumber: string | null;
  InvoiceDate: Date;
  CompanyID: number | null;
  TransactionID: number | null;
  BaseCents: number;
  VatPercent: number;
  VatCents: number;
  RetentionPercent: number;
  RetentionCents: number;
  TotalCents: number;
  Currency: string;
  Status: string;
  BillerName: string;
  BillerNif: string;
  BillerAddress: string | null;
  BillerPhone: string | null;
  BillerPaymentMethod: string;
  BillerBankName: string | null;
  BillerIban: string | null;
  BillerSwift: string | null;
  BillerBankAddress: string | null;
  ClientName: string;
  ClientTradingName: string | null;
  ClientTaxId: string | null;
  ClientAddress: string | null;
  ClientCity: string | null;
  ClientPostalCode: string | null;
  ClientCountry: string | null;
  DraftName: string | null;
  Notes: string | null;
  InvoiceLanguage: string | null;
  CreatedAt: Date;
  UpdatedAt: Date;
}

interface InvoiceListRow {
  InvoiceID: number;
  InvoiceNumber: string | null;
  DraftName: string | null;
  InvoiceDate: Date;
  ClientName: string;
  ClientTradingName: string | null;
  TotalCents: number;
  Currency: string;
  Status: string;
}

interface LineItemRow {
  LineItemID: number;
  InvoiceID: number;
  SortOrder: number;
  Title: string | null;
  // node-postgres parses JSONB columns to JS values automatically
  SubItems: string[] | null;
  Description: string | null;
  Hours: number | null;
  HourlyRateCents: number | null;
  AmountCents: number;
}

// ============================================================
// Transformers
// ============================================================

function rowToBillingProfile(row: BillingProfileRow): BillingProfile {
  return {
    billingProfileId: row.BillingProfileID,
    fullName: row.FullName,
    nif: row.Nif,
    address: row.Address,
    phone: row.Phone,
    paymentMethod: row.PaymentMethod as PaymentMethod,
    bankName: row.BankName,
    iban: row.Iban,
    swift: row.Swift,
    bankAddress: row.BankAddress,
    defaultHourlyRateCents: row.DefaultHourlyRateCents,
    createdAt: toISOString(row.CreatedAt),
    updatedAt: toISOString(row.UpdatedAt),
  };
}

function rowToPrefix(row: InvoicePrefixRow): InvoicePrefix {
  return {
    prefixId: row.PrefixID,
    prefix: row.Prefix,
    nextNumber: row.NextNumber,
    description: row.Description,
    companyId: row.CompanyID,
    isActive: Boolean(row.IsActive),
    createdAt: toISOString(row.CreatedAt),
  };
}

function rowToInvoice(row: InvoiceRow, lineItems: InvoiceLineItem[]): Invoice {
  return {
    invoiceId: row.InvoiceID,
    prefixId: row.PrefixID,
    invoiceNumber: row.InvoiceNumber,
    invoiceDate: toDateString(row.InvoiceDate),
    companyId: row.CompanyID,
    transactionId: row.TransactionID,
    baseCents: Number(row.BaseCents),
    vatPercent: row.VatPercent,
    vatCents: Number(row.VatCents),
    retentionPercent: row.RetentionPercent,
    retentionCents: Number(row.RetentionCents),
    totalCents: Number(row.TotalCents),
    currency: row.Currency,
    status: row.Status as InvoiceStatus,
    billerName: row.BillerName,
    billerNif: row.BillerNif,
    billerAddress: row.BillerAddress,
    billerPhone: row.BillerPhone,
    billerPaymentMethod: row.BillerPaymentMethod as PaymentMethod,
    billerBankName: row.BillerBankName,
    billerIban: row.BillerIban,
    billerSwift: row.BillerSwift,
    billerBankAddress: row.BillerBankAddress,
    clientName: row.ClientName,
    clientTradingName: row.ClientTradingName,
    clientTaxId: row.ClientTaxId,
    clientAddress: row.ClientAddress,
    clientCity: row.ClientCity,
    clientPostalCode: row.ClientPostalCode,
    clientCountry: row.ClientCountry,
    draftName: row.DraftName,
    notes: row.Notes,
    invoiceLanguage: row.InvoiceLanguage,
    lineItems,
    createdAt: toISOString(row.CreatedAt),
    updatedAt: toISOString(row.UpdatedAt),
  };
}

function rowToLineItem(row: LineItemRow): InvoiceLineItem {
  return {
    lineItemId: row.LineItemID,
    invoiceId: row.InvoiceID,
    sortOrder: row.SortOrder,
    title: row.Title,
    subItems: Array.isArray(row.SubItems) ? row.SubItems : [],
    description: row.Description,
    hours: row.Hours != null ? Number(row.Hours) : null,
    hourlyRateCents: row.HourlyRateCents,
    amountCents: row.AmountCents,
  };
}

function rowToListItem(row: InvoiceListRow): InvoiceListItem {
  return {
    invoiceId: row.InvoiceID,
    invoiceNumber: row.InvoiceNumber,
    draftName: row.DraftName,
    invoiceDate: toDateString(row.InvoiceDate),
    clientName: row.ClientName,
    clientTradingName: row.ClientTradingName,
    totalCents: Number(row.TotalCents),
    currency: row.Currency,
    status: row.Status as InvoiceStatus,
  };
}

// ============================================================
// Billing Profile
// ============================================================

export async function getBillingProfile(): Promise<BillingProfile | null> {
  const userId = await getUserIdOrThrow();

  const result = await query<BillingProfileRow>(
    `SELECT "BillingProfileID", "FullName", "Nif", "Address", "Phone",
            "PaymentMethod", "BankName", "Iban", "Swift", "BankAddress",
            "DefaultHourlyRateCents", "CreatedAt", "UpdatedAt"
     FROM "UserBillingProfiles"
     WHERE "UserID" = $1`,
    [userId],
  );

  return result[0] ? rowToBillingProfile(result[0]) : null;
}

export async function upsertBillingProfile(data: BillingProfileInput): Promise<BillingProfile> {
  const userId = await getUserIdOrThrow();

  const result = await query<BillingProfileRow>(
    `INSERT INTO "UserBillingProfiles"
       ("UserID", "FullName", "Nif", "Address", "Phone", "PaymentMethod",
        "BankName", "Iban", "Swift", "BankAddress", "DefaultHourlyRateCents")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT ("UserID") DO UPDATE SET
       "FullName" = EXCLUDED."FullName",
       "Nif" = EXCLUDED."Nif",
       "Address" = EXCLUDED."Address",
       "Phone" = EXCLUDED."Phone",
       "PaymentMethod" = EXCLUDED."PaymentMethod",
       "BankName" = EXCLUDED."BankName",
       "Iban" = EXCLUDED."Iban",
       "Swift" = EXCLUDED."Swift",
       "BankAddress" = EXCLUDED."BankAddress",
       "DefaultHourlyRateCents" = EXCLUDED."DefaultHourlyRateCents"
     RETURNING "BillingProfileID", "FullName", "Nif", "Address", "Phone",
               "PaymentMethod", "BankName", "Iban", "Swift", "BankAddress",
               "DefaultHourlyRateCents", "CreatedAt", "UpdatedAt"`,
    [
      userId,
      data.fullName,
      data.nif,
      data.address ?? null,
      data.phone ?? null,
      data.paymentMethod,
      data.bankName ?? null,
      data.iban ?? null,
      data.swift ?? null,
      data.bankAddress ?? null,
      data.defaultHourlyRateCents ?? null,
    ],
  );

  const row = result[0];
  if (!row) throw new Error('Failed to upsert billing profile');

  // Propagate biller data to all draft invoices. Finalized/paid/cancelled invoices
  // keep their frozen snapshot (required for fiscal integrity).
  await query(
    `UPDATE "Invoices" SET
       "BillerName" = $1, "BillerNif" = $2, "BillerAddress" = $3, "BillerPhone" = $4,
       "BillerPaymentMethod" = $5, "BillerBankName" = $6, "BillerIban" = $7,
       "BillerSwift" = $8, "BillerBankAddress" = $9
     WHERE "UserID" = $10 AND "Status" = $11`,
    [
      row.FullName,
      row.Nif,
      row.Address,
      row.Phone,
      row.PaymentMethod,
      row.BankName,
      row.Iban,
      row.Swift,
      row.BankAddress,
      userId,
      INVOICE_STATUS.DRAFT,
    ],
  );

  return rowToBillingProfile(row);
}

// ============================================================
// Invoice Prefixes
// ============================================================

export async function getInvoicePrefixes(): Promise<InvoicePrefix[]> {
  const userId = await getUserIdOrThrow();

  const result = await query<InvoicePrefixRow>(
    `SELECT "PrefixID", "Prefix", "NextNumber", "Description", "CompanyID", "IsActive", "CreatedAt"
     FROM "InvoicePrefixes"
     WHERE "UserID" = $1 AND "IsActive" = TRUE
     ORDER BY "Prefix"`,
    [userId],
  );

  return result.map(rowToPrefix);
}

export async function createInvoicePrefix(data: {
  prefix: string;
  description?: string | null;
  nextNumber?: number;
  companyId?: number | null;
}): Promise<InvoicePrefix> {
  const userId = await getUserIdOrThrow();

  try {
    const result = await query<InvoicePrefixRow>(
      `INSERT INTO "InvoicePrefixes" ("Prefix", "NextNumber", "Description", "CompanyID", "UserID")
       VALUES ($1, $2, $3, $4, $5)
       RETURNING "PrefixID", "Prefix", "NextNumber", "Description", "CompanyID", "IsActive", "CreatedAt"`,
      [data.prefix, data.nextNumber ?? 1, data.description ?? null, data.companyId ?? null, userId],
    );

    const row = result[0];
    if (!row) throw new Error('Failed to create invoice prefix');
    return rowToPrefix(row);
  } catch (error) {
    // UQ_InvoicePrefix_User: the user already owns a prefix with this code
    if (isUniqueViolation(error)) throw new ConflictError(`Prefix "${data.prefix}" already exists`);
    throw error;
  }
}

export async function updateInvoicePrefix(
  prefixId: number,
  data: { description?: string | null; nextNumber?: number; companyId?: number | null },
): Promise<InvoicePrefix | null> {
  const userId = await getUserIdOrThrow();

  const setClauses: string[] = [];
  const params: (string | number | null)[] = [prefixId, userId];

  if (data.description !== undefined) {
    params.push(data.description ?? null);
    setClauses.push(`"Description" = $${params.length}`);
  }

  if (data.nextNumber !== undefined) {
    params.push(data.nextNumber);
    setClauses.push(`"NextNumber" = $${params.length}`);
  }

  if (data.companyId !== undefined) {
    params.push(data.companyId);
    setClauses.push(`"CompanyID" = $${params.length}`);
  }

  if (setClauses.length === 0) return null;

  const result = await query<InvoicePrefixRow>(
    `UPDATE "InvoicePrefixes"
     SET ${setClauses.join(', ')}
     WHERE "PrefixID" = $1 AND "UserID" = $2
     RETURNING "PrefixID", "Prefix", "NextNumber", "Description", "CompanyID", "IsActive", "CreatedAt"`,
    params,
  );

  return result[0] ? rowToPrefix(result[0]) : null;
}

export async function deleteInvoicePrefix(prefixId: number): Promise<boolean> {
  const userId = await getUserIdOrThrow();

  // Check if prefix has invoices
  const invoiceCheck = await query<{ count: number }>(
    `SELECT COUNT(*) AS "count" FROM "Invoices"
     WHERE "PrefixID" = $1 AND "UserID" = $2`,
    [prefixId, userId],
  );

  if (Number(invoiceCheck[0]?.count ?? 0) > 0) {
    throw new ConflictError('Cannot delete prefix with existing invoices');
  }

  // RETURNING makes the DELETE report what it removed: query() hands back rows, not a
  // rowCount, so without it an unknown id (or another user's prefix) looked like a success.
  const deleted = await query<{ PrefixID: number }>(
    `DELETE FROM "InvoicePrefixes" WHERE "PrefixID" = $1 AND "UserID" = $2 RETURNING "PrefixID"`,
    [prefixId, userId],
  );

  return deleted.length > 0;
}

// Custom error for conflict scenarios
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

const PG_UNIQUE_VIOLATION = '23505';

/** PostgreSQL surfaces constraint breaches as errors carrying a SQLSTATE `code`. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === PG_UNIQUE_VIOLATION;
}

// ============================================================
// Invoices
// ============================================================

interface InvoiceFilters {
  status?: InvoiceStatus;
  prefixId?: number;
}

export async function getInvoices(filters?: InvoiceFilters): Promise<InvoiceListItem[]> {
  const userId = await getUserIdOrThrow();

  let sql = `SELECT "InvoiceID", "InvoiceNumber", "DraftName", "InvoiceDate", "ClientName",
                    "ClientTradingName", "TotalCents", "Currency", "Status"
             FROM "Invoices"
             WHERE "UserID" = $1`;
  const params: (string | number)[] = [userId];

  if (filters?.status) {
    params.push(filters.status);
    sql += ` AND "Status" = $${params.length}`;
  }

  if (filters?.prefixId) {
    params.push(filters.prefixId);
    sql += ` AND "PrefixID" = $${params.length}`;
  }

  sql += ' ORDER BY "InvoiceDate" DESC, "InvoiceID" DESC';

  const result = await query<InvoiceListRow>(sql, params);
  return result.map(rowToListItem);
}

export async function getInvoiceById(invoiceId: number): Promise<Invoice | null> {
  const userId = await getUserIdOrThrow();

  const invoiceResult = await query<InvoiceRow>(
    `SELECT i.*, c."InvoiceLanguage"
     FROM "Invoices" i
     LEFT JOIN "Companies" c ON c."CompanyID" = i."CompanyID"
     WHERE i."InvoiceID" = $1 AND i."UserID" = $2`,
    [invoiceId, userId],
  );

  const invoiceRow = invoiceResult[0];
  if (!invoiceRow) return null;

  const lineItemResult = await query<LineItemRow>(
    `SELECT * FROM "InvoiceLineItems" WHERE "InvoiceID" = $1 ORDER BY "SortOrder"`,
    [invoiceId],
  );

  const lineItems = lineItemResult.map(rowToLineItem);
  return rowToInvoice(invoiceRow, lineItems);
}

/**
 * Create an invoice with line items (TRANSACTIONAL)
 * 1. Lock prefix row to get next number
 * 2. Snapshot billing profile + company data
 * 3. Insert invoice + line items
 * 4. Calculate TotalCents from line items
 * 5. Increment prefix NextNumber
 */
export async function createInvoice(data: CreateInvoiceInput): Promise<Invoice> {
  const userId = await getUserIdOrThrow();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Verify prefix exists
    const prefixResult = await client.query<Pick<InvoicePrefixRow, 'PrefixID'>>(
      `SELECT "PrefixID" FROM "InvoicePrefixes" WHERE "PrefixID" = $1 AND "UserID" = $2`,
      [data.prefixId, userId],
    );
    if (!prefixResult.rows[0]) throw new Error('Invoice prefix not found');

    // 2. Get billing profile snapshot
    const profileResult = await client.query<BillingProfileRow>(
      `SELECT * FROM "UserBillingProfiles" WHERE "UserID" = $1`,
      [userId],
    );

    const profile = profileResult.rows[0];
    if (!profile) throw new Error('Billing profile not configured');

    // 3. Get company snapshot
    const companyResult = await client.query(
      `SELECT "Name", "TradingName", "TaxId", "Address", "City", "PostalCode", "Country"
       FROM "Companies" WHERE "CompanyID" = $1 AND "UserID" = $2`,
      [data.companyId, userId],
    );

    const company = companyResult.rows[0];
    if (!company) throw new Error('Company not found');

    // 4. Calculate the money breakdown (base, VAT charged, IRPF withheld, amount to collect)
    const amounts = computeInvoiceAmounts(data.lineItems, data.vatPercent, data.retentionPercent);

    // 5. Insert invoice
    const invoiceDate =
      data.invoiceDate instanceof Date
        ? data.invoiceDate.toISOString().split('T')[0]
        : String(data.invoiceDate).split('T')[0];

    const invoiceResult = await client.query<InvoiceRow>(
      `INSERT INTO "Invoices" (
        "PrefixID", "InvoiceDate", "CompanyID",
        "BaseCents", "VatPercent", "VatCents", "RetentionPercent", "RetentionCents",
        "TotalCents", "Status",
        "BillerName", "BillerNif", "BillerAddress", "BillerPhone", "BillerPaymentMethod",
        "BillerBankName", "BillerIban", "BillerSwift", "BillerBankAddress",
        "ClientName", "ClientTradingName", "ClientTaxId", "ClientAddress",
        "ClientCity", "ClientPostalCode", "ClientCountry",
        "Notes", "DraftName", "UserID"
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6, $7, $8,
        $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17, $18, $19,
        $20, $21, $22, $23,
        $24, $25, $26,
        $27, $28, $29
      ) RETURNING *`,
      [
        data.prefixId,
        invoiceDate,
        data.companyId,
        amounts.baseCents,
        amounts.vatPercent,
        amounts.vatCents,
        amounts.retentionPercent,
        amounts.retentionCents,
        amounts.totalCents,
        INVOICE_STATUS.DRAFT,
        profile.FullName,
        profile.Nif,
        profile.Address,
        profile.Phone,
        profile.PaymentMethod,
        profile.BankName,
        profile.Iban,
        profile.Swift,
        profile.BankAddress,
        company.Name,
        company.TradingName,
        company.TaxId,
        company.Address,
        company.City,
        company.PostalCode,
        company.Country,
        data.notes ?? null,
        data.draftName?.trim() || null,
        userId,
      ],
    );

    const invoiceRow = invoiceResult.rows[0];
    if (!invoiceRow) throw new Error('Failed to create invoice');

    // 6. Insert line items
    const lineItemValues = data.lineItems.map((item, index) => [
      invoiceRow.InvoiceID,
      index,
      item.title ?? null,
      JSON.stringify(item.subItems ?? []),
      item.description ?? null,
      item.hours ?? null,
      item.hourlyRateCents ?? null,
      item.amountCents,
    ]);

    const lineItemParams: (string | number | null)[] = [];
    const lineItemPlaceholders = lineItemValues.map((values, rowIndex) => {
      const offset = rowIndex * 8;
      values.forEach((v) => {
        lineItemParams.push(v as string | number | null);
      });
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`;
    });

    const lineItemResult = await client.query<LineItemRow>(
      `INSERT INTO "InvoiceLineItems" ("InvoiceID", "SortOrder", "Title", "SubItems", "Description", "Hours", "HourlyRateCents", "AmountCents")
       VALUES ${lineItemPlaceholders.join(', ')}
       RETURNING *`,
      lineItemParams,
    );

    await client.query('COMMIT');

    const lineItems = lineItemResult.rows.map(rowToLineItem);
    return rowToInvoice(invoiceRow, lineItems);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Assign a sequential invoice number atomically (used during finalization).
 * Locks the prefix row with FOR UPDATE to serialize concurrent assignments.
 * Idempotent: returns existing number if already assigned.
 */
export async function assignInvoiceNumber(invoiceId: number): Promise<string> {
  const userId = await getUserIdOrThrow();
  const pool = getPool();

  // Check if number is already assigned (idempotency guard for retry after partial failure)
  const existing = await query<Pick<InvoiceRow, 'InvoiceNumber'>>(
    `SELECT "InvoiceNumber" FROM "Invoices" WHERE "InvoiceID" = $1 AND "UserID" = $2`,
    [invoiceId, userId],
  );
  const existingNumber = existing[0]?.InvoiceNumber;
  if (existingNumber) return existingNumber;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock prefix row (FOR UPDATE) — serializes concurrent assignments
    const prefixResult = await client.query<Pick<InvoicePrefixRow, 'PrefixID' | 'Prefix' | 'NextNumber'>>(
      `SELECT p."PrefixID", p."Prefix", p."NextNumber"
       FROM "InvoicePrefixes" p
       INNER JOIN "Invoices" i ON i."PrefixID" = p."PrefixID"
       WHERE i."InvoiceID" = $1 AND i."UserID" = $2
       FOR UPDATE OF p`,
      [invoiceId, userId],
    );
    const prefix = prefixResult.rows[0];
    if (!prefix) throw new Error('Invoice prefix not found');

    const invoiceNumber = `${prefix.Prefix}-${String(prefix.NextNumber).padStart(2, '0')}`;

    // 2. Assign number to invoice
    await client.query(`UPDATE "Invoices" SET "InvoiceNumber" = $1 WHERE "InvoiceID" = $2 AND "UserID" = $3`, [
      invoiceNumber,
      invoiceId,
      userId,
    ]);

    // 3. Increment counter
    await client.query(`UPDATE "InvoicePrefixes" SET "NextNumber" = "NextNumber" + 1 WHERE "PrefixID" = $1`, [
      prefix.PrefixID,
    ]);

    await client.query('COMMIT');
    return invoiceNumber;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update a draft invoice (date, line items, notes) — TRANSACTIONAL
 * Deletes existing line items and re-inserts. Recalculates TotalCents.
 * Only draft invoices can be edited, and a draft that already carries an invoice number
 * (one that came back from a revert) can no longer have its InvoiceDate changed.
 */
export async function updateInvoice(invoiceId: number, data: UpdateInvoiceInput): Promise<Invoice> {
  const userId = await getUserIdOrThrow();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock invoice and verify it's a draft
    const invoiceResult = await client.query<InvoiceRow>(
      `SELECT * FROM "Invoices" WHERE "InvoiceID" = $1 AND "UserID" = $2 FOR UPDATE`,
      [invoiceId, userId],
    );

    const invoiceRow = invoiceResult.rows[0];
    if (!invoiceRow) throw new Error(API_ERROR.NOT_FOUND.INVOICE);
    if (invoiceRow.Status !== INVOICE_STATUS.DRAFT) {
      throw new Error(API_ERROR.INVOICE.ONLY_DRAFT_EDITABLE);
    }

    // A numbered draft (one that came back from a revert) keeps its date frozen: the number is
    // already fixed, so re-dating it would let DW-05 end up dated after DW-06 — the series stays
    // correlative but the dates stop being chronological, which RD 1619/2012 also requires — and
    // the income would silently move to another quarter. An un-numbered draft is still free.
    // Both sides go through toDateString() so a Date-vs-string mismatch cannot fake a change:
    // the edit form resubmits the date on every save, and a false positive here would leave
    // numbered drafts uneditable altogether.
    const invoiceDate = toDateString(data.invoiceDate);
    if (invoiceRow.InvoiceNumber && invoiceDate !== toDateString(invoiceRow.InvoiceDate)) {
      throw new ValidationError(API_ERROR.INVOICE.DATE_FROZEN_ON_NUMBERED);
    }

    // 2. Delete existing line items
    await client.query(`DELETE FROM "InvoiceLineItems" WHERE "InvoiceID" = $1`, [invoiceId]);

    // 3. Insert new line items
    const lineItemParams: (string | number | null)[] = [];
    const lineItemPlaceholders = data.lineItems.map((item, index) => {
      const offset = index * 8;
      lineItemParams.push(
        invoiceId,
        index,
        item.title ?? null,
        JSON.stringify(item.subItems ?? []),
        item.description ?? null,
        item.hours ?? null,
        item.hourlyRateCents ?? null,
        item.amountCents,
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`;
    });

    const lineItemResult = await client.query<LineItemRow>(
      `INSERT INTO "InvoiceLineItems" ("InvoiceID", "SortOrder", "Title", "SubItems", "Description", "Hours", "HourlyRateCents", "AmountCents")
       VALUES ${lineItemPlaceholders.join(', ')}
       RETURNING *`,
      lineItemParams,
    );

    // 4. Recalculate the money breakdown
    const amounts = computeInvoiceAmounts(data.lineItems, data.vatPercent, data.retentionPercent);

    // 5. Update invoice (invoiceDate was normalised by the numbered-draft guard above)
    await client.query(
      `UPDATE "Invoices"
       SET "InvoiceDate" = $1, "Notes" = $2, "DraftName" = $10,
           "BaseCents" = $3, "VatPercent" = $4, "VatCents" = $5,
           "RetentionPercent" = $6, "RetentionCents" = $7, "TotalCents" = $8
       WHERE "InvoiceID" = $9`,
      [
        invoiceDate,
        data.notes ?? null,
        amounts.baseCents,
        amounts.vatPercent,
        amounts.vatCents,
        amounts.retentionPercent,
        amounts.retentionCents,
        amounts.totalCents,
        invoiceId,
        data.draftName?.trim() || null,
      ],
    );

    await client.query('COMMIT');

    const lineItems = lineItemResult.rows.map(rowToLineItem);
    return rowToInvoice(
      {
        ...invoiceRow,
        InvoiceDate: new Date(invoiceDate),
        BaseCents: amounts.baseCents,
        VatPercent: amounts.vatPercent,
        VatCents: amounts.vatCents,
        RetentionPercent: amounts.retentionPercent,
        RetentionCents: amounts.retentionCents,
        TotalCents: amounts.totalCents,
        Notes: data.notes ?? null,
        DraftName: data.draftName?.trim() || null,
      },
      lineItems,
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Look up the user's "Comisiones bancarias" subcategory using a tx-scoped client.
// Mirrors findSkydiveSubcategoryId() but operates inside an open transaction so the
// caller can fail-fast and rollback if the subcategory is missing.
async function findBankFeeSubcategoryIdInTx(
  client: { query: (text: string, params: unknown[]) => Promise<{ rows: Array<{ CategoryID: number }> }> },
  userId: number,
): Promise<number | null> {
  const result = await client.query(
    `SELECT sub."CategoryID"
     FROM "Categories" sub
     INNER JOIN "Categories" parent ON sub."ParentCategoryID" = parent."CategoryID"
     WHERE parent."Name" = $1 AND sub."Name" = $2
       AND parent."ParentCategoryID" IS NULL AND sub."UserID" = $3
     LIMIT 1`,
    [BANK_FEE_CATEGORY.PARENT_NAME, BANK_FEE_CATEGORY.SUBCATEGORY_NAME, userId],
  );
  return result.rows[0]?.CategoryID ?? null;
}

// Escape the LIKE metacharacters of a value that is interpolated into a pattern.
// The replacement `'\\$&'` is a single backslash followed by the matched character.
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

// Delete the archived FiscalDocument of an issued invoice using a tx-scoped client.
// Shared by cancellation and by the revert-to-draft path so the lookup lives in one place.
// Returns the blob URLs of the deleted rows so the caller can purge them after COMMIT.
async function deleteIssuedFiscalDocumentInTx(
  client: {
    query: (text: string, params: unknown[]) => Promise<{ rows: Array<{ DocumentID: number; BlobUrl: string }> }>;
  },
  userId: number,
  invoiceNumber: string,
): Promise<string[]> {
  // The invoice number embeds a user-defined prefix, so it must not leak LIKE wildcards:
  // an unescaped `_` or `%` would match — and delete — the fiscal archive of a different,
  // still-finalized invoice. ESCAPE '\' below arrives at the server as a single backslash.
  const result = await client.query(
    `DELETE FROM "FiscalDocuments"
     WHERE "UserID" = $1
       AND "DocumentType" = $2
       AND "Description" LIKE $3 ESCAPE '\\'
     RETURNING "DocumentID", "BlobUrl"`,
    [userId, FISCAL_DOCUMENT_TYPE.FACTURA_EMITIDA, `Factura ${escapeLikePattern(invoiceNumber)} -%`],
  );

  return result.rows.map((row) => row.BlobUrl);
}

// Tell whether the AEAT filing that covers an invoice date has already been submitted.
// The period is taken from the invoice's own date because that is what "vw_FiscalAccrual"
// books the income on. Year and quarter are read in UTC — the date arrives as a DATE column,
// so reading it in local time would push a 1 January invoice back into Q4 of the prior year.
// The NULL-quarter branch is deliberate: per CK_FiscalDoc_Quarter, annual modelos (390, 100)
// store no quarter and cover the whole fiscal year.
async function isFiscalPeriodFiledInTx(
  client: { query: (text: string, params: unknown[]) => Promise<{ rows: Array<{ exists: boolean }> }> },
  userId: number,
  invoiceDate: Date,
): Promise<boolean> {
  const fiscalYear = invoiceDate.getUTCFullYear();
  const fiscalQuarter = Math.ceil((invoiceDate.getUTCMonth() + 1) / 3);

  const result = await client.query(
    `SELECT 1 AS "exists"
     FROM "FiscalDocuments"
     WHERE "UserID" = $1
       AND "DocumentType" = $2
       AND "Status" = $3
       AND "FiscalYear" = $4
       AND ("FiscalQuarter" = $5 OR "FiscalQuarter" IS NULL)
     LIMIT 1`,
    [userId, FISCAL_DOCUMENT_TYPE.MODELO, FISCAL_STATUS.FILED, fiscalYear, fiscalQuarter],
  );

  return result.rows.length > 0;
}

/**
 * Update invoice status with state machine validation (TRANSACTIONAL)
 * Valid transitions:
 *   draft → finalized
 *   draft → cancelled (only a numbered draft; retires the number it cannot give back)
 *   finalized → paid (creates income transaction; optionally a bank fee expense)
 *   finalized → cancelled
 *   finalized → draft (revert; deletes the FiscalDocument + PDF blob, keeps the number)
 *   paid → cancelled (deletes income + bank fee transactions)
 *
 * The finalized → draft revert is additionally refused when the invoice's fiscal period has
 * already been filed with the AEAT. Cancelling such an invoice stays available.
 */
export async function updateInvoiceStatus(
  invoiceId: number,
  newStatus: InvoiceStatus,
  options: { categoryId?: number; bankFeeCents?: number } = {},
): Promise<Invoice> {
  const { categoryId, bankFeeCents } = options;
  const userId = await getUserIdOrThrow();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock the invoice row
    const invoiceResult = await client.query<InvoiceRow>(
      `SELECT * FROM "Invoices" WHERE "InvoiceID" = $1 AND "UserID" = $2 FOR UPDATE`,
      [invoiceId, userId],
    );

    const invoiceRow = invoiceResult.rows[0];
    if (!invoiceRow) throw new Error(API_ERROR.NOT_FOUND.INVOICE);

    const currentStatus = invoiceRow.Status as InvoiceStatus;

    // Validate state transition.
    //
    // An issued invoice that has not been delivered to the client yet can be pulled back to
    // draft to be corrected. The invoice number is deliberately RETAINED across the revert,
    // and assignInvoiceNumber() is idempotent, so re-issuing reuses that same number and the
    // series stays correlative with no gaps (RD 1619/2012). deleteInvoice() refuses invoices
    // that already carry a number, which is what stops this path from ever opening a gap.
    //
    // Once the invoice has been delivered, the fix is cancelling it — which keeps the number
    // on record — or issuing a rectificativa. Cancelled stays terminal. Paid never reverts:
    // the money is already collected and an income transaction exists.
    //
    // A NUMBERED draft (one that came back from a revert, or whose finalization died after the
    // number was assigned) may also be cancelled: since it cannot be deleted, cancelling is its
    // only way out, and without it the job being called off would leave the row — and a
    // permanent hole in the series — stuck forever. An un-numbered draft is NOT cancellable:
    // cancelling exists to retire a number while keeping it on record, and a draft that never
    // took a number has nothing to preserve, so it is deleted instead.
    //
    // The revert is further restricted below: it is refused once the fiscal period the invoice
    // belongs to has been filed with the AEAT, because reverting drops the invoice out of
    // "vw_FiscalAccrual" and every regenerated report for that period would stop matching what
    // was actually submitted. Cancelling remains available there, and it is the legally correct
    // remedy — the invoice and its number stay on record.
    //
    // Verifactu will require the same from July 2027 for invoices actually issued to a
    // client: never modified, only annulled through their own record.
    const validTransitions: Record<string, InvoiceStatus[]> = {
      [INVOICE_STATUS.DRAFT]: [INVOICE_STATUS.FINALIZED, INVOICE_STATUS.CANCELLED],
      [INVOICE_STATUS.FINALIZED]: [INVOICE_STATUS.PAID, INVOICE_STATUS.CANCELLED, INVOICE_STATUS.DRAFT],
      [INVOICE_STATUS.PAID]: [INVOICE_STATUS.CANCELLED],
      [INVOICE_STATUS.CANCELLED]: [],
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw new ValidationError(API_ERROR.INVOICE.INVALID_STATUS_TRANSITION);
    }

    // draft → cancelled is reserved for numbered drafts (see above): an un-numbered draft is
    // deleted, not cancelled. The cancellation branch below is harmless on this path — the
    // FiscalDocument was already removed when the invoice was reverted, so the helper deletes
    // zero rows, and a draft never carries a TransactionID to strand.
    if (newStatus === INVOICE_STATUS.CANCELLED && currentStatus === INVOICE_STATUS.DRAFT && !invoiceRow.InvoiceNumber) {
      throw new ValidationError(API_ERROR.INVOICE.INVALID_STATUS_TRANSITION);
    }

    // Reverting to draft is refused once the invoice's fiscal period has been filed: the revert
    // takes the invoice out of "vw_FiscalAccrual" and deletes the archived PDF evidence, so every
    // report regenerated for that period would stop matching what was submitted to the AEAT.
    // Cancelling the invoice is still allowed and is the correct remedy in that situation.
    // The period comes from the invoice's own date, normalised through toDateString() first:
    // the driver may hand back a Date or a string, and a date-only string parses as UTC midnight,
    // which is what keeps a 1 January invoice inside Q1 instead of Q4 of the previous year.
    if (newStatus === INVOICE_STATUS.DRAFT && currentStatus === INVOICE_STATUS.FINALIZED) {
      const invoiceDate = new Date(toDateString(invoiceRow.InvoiceDate));
      if (await isFiscalPeriodFiledInTx(client, userId, invoiceDate)) {
        throw new ValidationError(API_ERROR.INVOICE.PERIOD_ALREADY_FILED);
      }
    }

    let transactionId: number | null = invoiceRow.TransactionID;

    // Collect blob URLs to delete after commit (outside transaction)
    const blobUrlsToDelete: string[] = [];

    // Handle paid → creates income transaction with today's date (payment date)
    // Optionally creates a second EXPENSE transaction for bank transfer fees
    // (100% deductible, linked via CompanyID + InvoiceNumber for cancel cleanup).
    if (newStatus === INVOICE_STATUS.PAID) {
      if (!categoryId) throw new Error(API_ERROR.INVOICE.CATEGORY_REQUIRED_FOR_PAID);

      const paymentDate = toDateString(new Date());
      // AmountCents is TotalCents on purpose: this transaction is the money that lands in
      // the bank account (base + VAT - withholding), not the professional income earned.
      // The fiscal models never read it — vw_FiscalAccrual drops it and reads the invoice's
      // own BaseCents/VatCents — so the VAT collected here never inflates a tax return.
      const txResult = await client.query<{ TransactionID: number }>(
        `INSERT INTO "Transactions"
         ("CategoryID", "AmountCents", "Description", "TransactionDate", "Type",
          "SharedDivisor", "InvoiceNumber", "CompanyID", "Status", "UserID")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING "TransactionID"`,
        [
          categoryId,
          invoiceRow.TotalCents,
          `Factura ${invoiceRow.InvoiceNumber}`,
          paymentDate,
          TRANSACTION_TYPE.INCOME,
          1,
          invoiceRow.InvoiceNumber,
          invoiceRow.CompanyID,
          TRANSACTION_STATUS.PAID,
          userId,
        ],
      );

      transactionId = txResult.rows[0]?.TransactionID ?? null;

      if (bankFeeCents != null && bankFeeCents > 0) {
        const bankFeeCategoryId = await findBankFeeSubcategoryIdInTx(client, userId);
        if (bankFeeCategoryId == null) {
          throw new Error(API_ERROR.INVOICE.BANK_FEE_CATEGORY_NOT_FOUND);
        }

        await client.query(
          `INSERT INTO "Transactions"
           ("CategoryID", "AmountCents", "Description", "TransactionDate", "Type",
            "SharedDivisor", "InvoiceNumber", "CompanyID", "Status", "DeductionPercent", "UserID")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            bankFeeCategoryId,
            bankFeeCents,
            `Comisión bancaria - Factura ${invoiceRow.InvoiceNumber}`,
            paymentDate,
            TRANSACTION_TYPE.EXPENSE,
            1,
            invoiceRow.InvoiceNumber,
            invoiceRow.CompanyID,
            TRANSACTION_STATUS.PAID,
            BANK_FEE_CATEGORY.DEDUCTION_PERCENT,
            userId,
          ],
        );
      }
    }

    // Cancellation is the way out of a delivered invoice → clean up FiscalDocument + blob.
    // The invoice itself, and its number, stay on record.
    if (newStatus === INVOICE_STATUS.CANCELLED) {
      // Delete associated income transaction (if cancelling a paid invoice)
      if (currentStatus === INVOICE_STATUS.PAID && invoiceRow.TransactionID) {
        await client.query(`DELETE FROM "Transactions" WHERE "TransactionID" = $1 AND "UserID" = $2`, [
          invoiceRow.TransactionID,
          userId,
        ]);
        transactionId = null;

        // Also delete the bank fee expense transaction if one was created at payment time.
        // Identified by InvoiceNumber + Type=expense + the bank fee subcategory.
        const bankFeeCategoryId = await findBankFeeSubcategoryIdInTx(client, userId);
        if (bankFeeCategoryId != null) {
          await client.query(
            `DELETE FROM "Transactions"
             WHERE "UserID" = $1
               AND "InvoiceNumber" = $2
               AND "Type" = $3
               AND "CategoryID" = $4`,
            [userId, invoiceRow.InvoiceNumber, TRANSACTION_TYPE.EXPENSE, bankFeeCategoryId],
          );
        }
      }

      // Delete associated FiscalDocument (created when finalized)
      if (invoiceRow.InvoiceNumber) {
        blobUrlsToDelete.push(...(await deleteIssuedFiscalDocumentInTx(client, userId, invoiceRow.InvoiceNumber)));
      }
    }

    // Revert to draft: the archived FiscalDocument + PDF describe an issue that is being undone,
    // so they are removed to avoid a duplicate when the invoice is issued again. The invoice
    // number is kept, so re-issuing reuses it and the series stays gap-free.
    if (newStatus === INVOICE_STATUS.DRAFT && invoiceRow.InvoiceNumber) {
      blobUrlsToDelete.push(...(await deleteIssuedFiscalDocumentInTx(client, userId, invoiceRow.InvoiceNumber)));
    }

    // Update invoice status
    await client.query(`UPDATE "Invoices" SET "Status" = $1, "TransactionID" = $2 WHERE "InvoiceID" = $3`, [
      newStatus,
      transactionId,
      invoiceId,
    ]);

    await client.query('COMMIT');

    // Clean up blob storage after successful commit (best-effort, no rollback needed)
    if (blobUrlsToDelete.length > 0) {
      await del(blobUrlsToDelete).catch(() => {
        // Orphaned blobs are acceptable — no user impact
      });
    }

    // Fetch updated invoice
    return (await getInvoiceById(invoiceId))!;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Refresh biller + client snapshot for a draft invoice.
 * Re-queries UserBillingProfiles and Companies to pick up any changes
 * made after the invoice was created. No-op for non-draft invoices.
 */
export async function refreshDraftSnapshot(invoiceId: number): Promise<Invoice | null> {
  const userId = await getUserIdOrThrow();

  // Verify invoice exists, belongs to user, and is draft
  const invoiceResult = await query<InvoiceRow>(`SELECT * FROM "Invoices" WHERE "InvoiceID" = $1 AND "UserID" = $2`, [
    invoiceId,
    userId,
  ]);

  const invoiceRow = invoiceResult[0];
  if (!invoiceRow) return null;
  if (invoiceRow.Status !== INVOICE_STATUS.DRAFT) {
    // Non-draft invoices keep their frozen snapshot
    const lineItems = await query<LineItemRow>(
      `SELECT * FROM "InvoiceLineItems" WHERE "InvoiceID" = $1 ORDER BY "SortOrder"`,
      [invoiceId],
    );
    return rowToInvoice(invoiceRow, lineItems.map(rowToLineItem));
  }

  // Re-query billing profile
  const profileResult = await query<BillingProfileRow>(`SELECT * FROM "UserBillingProfiles" WHERE "UserID" = $1`, [
    userId,
  ]);
  const profile = profileResult[0];
  if (!profile) throw new Error('Billing profile not configured');

  // Re-query company data (including InvoiceLanguage for PDF generation)
  const companyResult = await query<{
    Name: string;
    TradingName: string | null;
    TaxId: string | null;
    Address: string | null;
    City: string | null;
    PostalCode: string | null;
    Country: string | null;
    InvoiceLanguage: string | null;
  }>(
    `SELECT "Name", "TradingName", "TaxId", "Address", "City", "PostalCode", "Country", "InvoiceLanguage"
     FROM "Companies" WHERE "CompanyID" = $1 AND "UserID" = $2`,
    [invoiceRow.CompanyID, userId],
  );
  const company = companyResult[0];
  if (!company) throw new Error('Company not found');

  // Update snapshot columns
  await query(
    `UPDATE "Invoices" SET
       "BillerName" = $1, "BillerNif" = $2, "BillerAddress" = $3, "BillerPhone" = $4,
       "BillerPaymentMethod" = $5, "BillerBankName" = $6, "BillerIban" = $7,
       "BillerSwift" = $8, "BillerBankAddress" = $9,
       "ClientName" = $10, "ClientTradingName" = $11, "ClientTaxId" = $12,
       "ClientAddress" = $13, "ClientCity" = $14, "ClientPostalCode" = $15, "ClientCountry" = $16
     WHERE "InvoiceID" = $17`,
    [
      profile.FullName,
      profile.Nif,
      profile.Address,
      profile.Phone,
      profile.PaymentMethod,
      profile.BankName,
      profile.Iban,
      profile.Swift,
      profile.BankAddress,
      company.Name,
      company.TradingName,
      company.TaxId,
      company.Address,
      company.City,
      company.PostalCode,
      company.Country,
      invoiceId,
    ],
  );

  // Return refreshed invoice with line items
  const lineItems = await query<LineItemRow>(
    `SELECT * FROM "InvoiceLineItems" WHERE "InvoiceID" = $1 ORDER BY "SortOrder"`,
    [invoiceId],
  );

  return rowToInvoice(
    {
      ...invoiceRow,
      BillerName: profile.FullName,
      BillerNif: profile.Nif,
      BillerAddress: profile.Address,
      BillerPhone: profile.Phone,
      BillerPaymentMethod: profile.PaymentMethod,
      BillerBankName: profile.BankName,
      BillerIban: profile.Iban,
      BillerSwift: profile.Swift,
      BillerBankAddress: profile.BankAddress,
      ClientName: company.Name,
      ClientTradingName: company.TradingName,
      ClientTaxId: company.TaxId,
      ClientAddress: company.Address,
      ClientCity: company.City,
      ClientPostalCode: company.PostalCode,
      ClientCountry: company.Country,
      InvoiceLanguage: company.InvoiceLanguage,
    },
    lineItems.map(rowToLineItem),
  );
}

/**
 * Delete an invoice (only drafts that have never been issued).
 * A draft that already carries an InvoiceNumber comes from a reverted finalization:
 * deleting it would burn that number, so it is rejected.
 */
export async function deleteInvoice(invoiceId: number): Promise<boolean> {
  const userId = await getUserIdOrThrow();

  // Check status
  const check = await query<{ Status: string; InvoiceNumber: string | null }>(
    `SELECT "Status", "InvoiceNumber" FROM "Invoices" WHERE "InvoiceID" = $1 AND "UserID" = $2`,
    [invoiceId, userId],
  );

  // Both refusals below are caller faults, not server faults: ValidationError is what makes
  // withApiHandler answer 400 with the i18n key instead of logging a 500 and swallowing it.
  if (!check[0]) return false;
  if (check[0].Status !== INVOICE_STATUS.DRAFT) {
    throw new ValidationError(API_ERROR.INVOICE.ONLY_DRAFT_DELETABLE);
  }

  // Refusing numbered drafts is what keeps the numbering series free of gaps
  if (check[0].InvoiceNumber) {
    throw new ValidationError(API_ERROR.INVOICE.NUMBERED_NOT_DELETABLE);
  }

  // The checks above only produce the precise error message: carrying them in the DELETE
  // predicate is what makes the guard race-free. Without it, an invoice finalized between the
  // SELECT and the DELETE would be removed after its number was already assigned and the
  // prefix counter bumped, burning that number. Line items cascade automatically.
  const deleted = await query<{ InvoiceID: number }>(
    `DELETE FROM "Invoices"
     WHERE "InvoiceID" = $1 AND "UserID" = $2 AND "Status" = $3 AND "InvoiceNumber" IS NULL
     RETURNING "InvoiceID"`,
    [invoiceId, userId, INVOICE_STATUS.DRAFT],
  );

  if (deleted.length > 0) return true;

  // The row changed underneath us — re-read it and report the guard that now applies
  const recheck = await query<{ Status: string; InvoiceNumber: string | null }>(
    `SELECT "Status", "InvoiceNumber" FROM "Invoices" WHERE "InvoiceID" = $1 AND "UserID" = $2`,
    [invoiceId, userId],
  );

  if (!recheck[0]) return false;
  if (recheck[0].InvoiceNumber) {
    throw new ValidationError(API_ERROR.INVOICE.NUMBERED_NOT_DELETABLE);
  }
  throw new ValidationError(API_ERROR.INVOICE.ONLY_DRAFT_DELETABLE);
}

// ============================================================
// Devengo vs. cobro (informational)
// ============================================================

interface CrossQuarterRow {
  InvoiceID: number;
  InvoiceNumber: string | null;
  ClientName: string;
  TotalCents: number;
  /** Needed to tell a 'finalized' invoice nobody has paid from a 'paid' one that lost its link */
  Status: InvoiceStatus;
  InvoiceDate: Date;
  InvoiceYear: number;
  InvoiceQuarter: number;
  CollectionDate: Date | null;
  CollectionYear: number | null;
  CollectionQuarter: number | null;
}

/**
 * Which of the four situations a row is, or null when there is nothing to say about it.
 *
 * Nothing here judges the accrual booking: an invoice declared and collected in the same
 * quarter is dropped precisely because the models and the bank statement already agree.
 */
function classifyCrossQuarter(row: CrossQuarterRow, year: number, quarter: number): CrossQuarterCase | null {
  const declaredHere = row.InvoiceYear === year && row.InvoiceQuarter === quarter;
  // No collection on record: the app has no date to compare, so it can never prove the money
  // fell in another quarter. This is what keeps a NULL out of COLLECTED_IN_ANOTHER_PERIOD.
  const collected = row.CollectionYear !== null && row.CollectionQuarter !== null;

  if (declaredHere) {
    if (!collected) {
      // A missing date is not a missing collection. A 'finalized' invoice has genuinely not been
      // paid and its IVA is owed on issue anyway; a 'paid' one carrying a NULL "TransactionID"
      // WAS collected and only the link to the movement is gone. Reporting the second as *sin
      // cobro registrado* would read as *aún no cobrada* — a fiscal alarm over a broken record.
      return row.Status === INVOICE_STATUS.PAID
        ? CROSS_QUARTER_CASE.PAID_WITHOUT_LINKED_MOVEMENT
        : CROSS_QUARTER_CASE.ISSUED_NOT_COLLECTED;
    }
    const collectedHere = row.CollectionYear === year && row.CollectionQuarter === quarter;
    return collectedHere ? null : CROSS_QUARTER_CASE.COLLECTED_IN_ANOTHER_PERIOD;
  }

  // Collected here (the query admits no other reason to reach this branch) but declared in
  // another period. Only an EARLIER one is reported: an invoice dated after its own collection
  // is already surfaced from its own quarter as COLLECTED_IN_ANOTHER_PERIOD, so returning null
  // drops a duplicate rather than hiding anything.
  //
  // A PAID_WITHOUT_LINKED_MOVEMENT invoice can never reach here: with no collection date the
  // WHERE clause only ever admits it from its own quarter. That is the real cost of the lost
  // link — money that arrived this quarter for an invoice declared earlier cannot be computed
  // for it at all, and no copy may imply the quarter's list is complete while one exists.
  const declaredEarlier = row.InvoiceYear < year || (row.InvoiceYear === year && row.InvoiceQuarter < quarter);
  return declaredEarlier ? CROSS_QUARTER_CASE.DECLARED_IN_EARLIER_PERIOD : null;
}

function rowToCrossQuarterInvoice(row: CrossQuarterRow, crossQuarterCase: CrossQuarterCase): CrossQuarterInvoice {
  return {
    invoiceId: row.InvoiceID,
    invoiceNumber: row.InvoiceNumber,
    clientName: row.ClientName,
    totalCents: Number(row.TotalCents),
    invoiceDate: toDateString(row.InvoiceDate),
    invoiceYear: row.InvoiceYear,
    invoiceQuarter: row.InvoiceQuarter,
    collectionDate: row.CollectionDate === null ? null : toDateString(row.CollectionDate),
    collectionYear: row.CollectionYear,
    collectionQuarter: row.CollectionQuarter,
    crossQuarterCase,
    // Two quarters of one year only move money between filings of the same Renta; two years
    // move it between two different ones, which is the harder disagreement to unwind.
    crossesFiscalYear: row.CollectionYear !== null && row.CollectionYear !== row.InvoiceYear,
  };
}

/**
 * Issued invoices whose devengo and whose cobro disagree about a quarter (user-scoped).
 *
 * The sibling of getUncountedIncome(): both are safety nets that change no figure and correct
 * no calculation. The models are right — "vw_FiscalAccrual" books an invoice on its own
 * "InvoiceDate" — and this only names the ways a bank statement can tell a different
 * story about the same quarter, so the human reading it does not overwrite a correct figure:
 *
 * - COLLECTED_IN_ANOTHER_PERIOD — declared here, the money arrived in another quarter.
 * - ISSUED_NOT_COLLECTED — declared here, nothing collected yet. The IVA is owed on issue.
 * - DECLARED_IN_EARLIER_PERIOD — the money arrived here, but the invoice was already declared
 *   earlier. This is the misleading one: the quarter's bank income that no model of the
 *   quarter counts.
 * - PAID_WITHOUT_LINKED_MOVEMENT — declared here, marked collected, no movement linked. The
 *   odd one out: a broken record rather than a timing disagreement, and the only one that asks
 *   for something to be repaired.
 *
 * The periods are extracted in SQL with EXTRACT over the same two dates the accrual view uses,
 * so a row can never be classified against a period the models would not agree with.
 */
export async function getCrossQuarterInvoices(year: number, quarter: number): Promise<CrossQuarterInvoice[]> {
  const userId = await getUserIdOrThrow();

  // The LEFT JOIN is what allows an uncollected invoice through; joining on "UserID" as well
  // keeps a payment transaction of another user from ever dating this one's invoice.
  const rows = await query<CrossQuarterRow>(
    `SELECT i."InvoiceID", i."InvoiceNumber", i."ClientName", i."TotalCents", i."Status", i."InvoiceDate",
            EXTRACT(YEAR FROM i."InvoiceDate")::INT AS "InvoiceYear",
            EXTRACT(QUARTER FROM i."InvoiceDate")::INT AS "InvoiceQuarter",
            t."TransactionDate" AS "CollectionDate",
            EXTRACT(YEAR FROM t."TransactionDate")::INT AS "CollectionYear",
            EXTRACT(QUARTER FROM t."TransactionDate")::INT AS "CollectionQuarter"
     FROM "Invoices" i
     LEFT JOIN "Transactions" t ON t."TransactionID" = i."TransactionID" AND t."UserID" = i."UserID"
     WHERE i."UserID" = $1
       AND i."Status" = ANY($2::VARCHAR[])
       AND (
         (EXTRACT(YEAR FROM i."InvoiceDate")::INT = $3 AND EXTRACT(QUARTER FROM i."InvoiceDate")::INT = $4)
         OR (EXTRACT(YEAR FROM t."TransactionDate")::INT = $3
             AND EXTRACT(QUARTER FROM t."TransactionDate")::INT = $4)
       )
     ORDER BY i."InvoiceDate" ASC, i."InvoiceID" ASC`,
    [userId, [...ISSUED_INVOICE_STATUSES], year, quarter],
  );

  return rows.flatMap((row) => {
    const crossQuarterCase = classifyCrossQuarter(row, year, quarter);
    return crossQuarterCase === null ? [] : [rowToCrossQuarterInvoice(row, crossQuarterCase)];
  });
}

// ============================================================
// Créditos incobrables — art. 80.Cuatro LIVA (informational)
// ============================================================

interface BadDebtRow {
  InvoiceID: number;
  InvoiceNumber: string | null;
  ClientName: string;
  /** Snapshot country: what art. 80.Cinco.2.ª is decided on, frozen at issue time */
  ClientCountry: string | null;
  InvoiceDate: Date;
  BaseCents: number;
  VatPercent: number;
  VatCents: number;
  TotalCents: number;
  Status: InvoiceStatus;
  /** NULL is what makes the row a candidate; a 'paid' invoice with a NULL link is still collected */
  TransactionID: number | null;
}

function rowToBadDebtInvoice(row: BadDebtRow, asOfDate: string): BadDebtInvoice {
  const exclusion = resolveBadDebtExclusion({
    status: row.Status,
    hasLinkedMovement: row.TransactionID !== null,
    vatCents: Number(row.VatCents),
    vatPercent: Number(row.VatPercent),
    clientCountry: row.ClientCountry,
  });

  // No windows for an excluded invoice: presenting dates for a right that does not exist would
  // invite the user to chase a deadline that means nothing. "InvoiceDate" stands in for the
  // devengo — see BadDebtInvoice.accrualDate on why that is an approximation and not a fact.
  const accrualDate = toDateString(row.InvoiceDate);
  const windows = exclusion === null ? computeBadDebtWindows(accrualDate, asOfDate) : [];

  return {
    invoiceId: row.InvoiceID,
    invoiceNumber: row.InvoiceNumber,
    clientName: row.ClientName,
    clientCountry: row.ClientCountry,
    accrualDate,
    baseCents: Number(row.BaseCents),
    vatPercent: Number(row.VatPercent),
    vatCents: Number(row.VatCents),
    totalCents: Number(row.TotalCents),
    status: row.Status,
    exclusion,
    windows,
    needsAttention: hasBadDebtAttention(windows),
  };
}

/**
 * The art. 80.Cuatro LIVA clock over the issued invoices with no payment movement (user-scoped).
 *
 * A clock and a checklist, nothing else: it issues no factura rectificativa, files no modelo 952
 * and never touches an invoice's "Status". It answers two questions — does the article reach this
 * invoice at all, and if so, between which two dates may the right be exercised.
 *
 * The query is deliberately wide and the GATE is what decides: it selects every issued invoice
 * carrying a NULL "TransactionID" and hands each one to resolveBadDebtExclusion(), which is
 * fail-closed. Two consequences worth keeping:
 *
 * - A 'paid' invoice whose "TransactionID" was lost is admitted by the WHERE and then ruled out as
 *   COLLECTED. It was collected; only the link to the movement is gone. That is the same finding
 *   the cross-quarter panel reports as PAID_WITHOUT_LINKED_MOVEMENT, and it is emphatically not an
 *   impagado. Deciding it in SQL would have hidden the distinction inside a predicate.
 * - An invoice with no cuota repercutida, or with a recipient not established in the TAI, Canarias,
 *   Ceuta or Melilla — or one whose snapshot does not say where the recipient is — lands in
 *   `outOfScope` carrying the reason, instead of vanishing. For this user's portfolio (servicios a
 *   empresarios no establecidos, casilla 120) that is every invoice, `tracked` is empty, and the
 *   module has to be able to say *why* rather than look broken. DW-09 is out on two independent
 *   grounds: NO_OUTPUT_VAT (art. 80.Cuatro: there is no cuota to recover) and, had there been one,
 *   RECIPIENT_NOT_ESTABLISHED (art. 80.Cinco.2.ª).
 *
 * `tracked` keeps an invoice whose windows have all lapsed: the right is gone and the loss stays
 * on screen. `needsAttention` is what separates what can still be chased from what only records
 * the miss.
 *
 * `asOfDate` is always explicit so the clock is testable and so a report and the copy around it
 * cannot be computed against two different days.
 */
export async function getBadDebtReport(asOfDate: string = toDateString(new Date())): Promise<BadDebtReport> {
  const userId = await getUserIdOrThrow();

  const rows = await query<BadDebtRow>(
    `SELECT i."InvoiceID", i."InvoiceNumber", i."ClientName", i."ClientCountry", i."InvoiceDate",
            i."BaseCents", i."VatPercent", i."VatCents", i."TotalCents", i."Status", i."TransactionID"
     FROM "Invoices" i
     WHERE i."UserID" = $1
       AND i."Status" = ANY($2::VARCHAR[])
       AND i."TransactionID" IS NULL
     ORDER BY i."InvoiceDate" ASC, i."InvoiceID" ASC`,
    [userId, [...ISSUED_INVOICE_STATUSES]],
  );

  const invoices = rows.map((row) => rowToBadDebtInvoice(row, asOfDate));

  return {
    asOfDate,
    tracked: invoices.filter((invoice) => invoice.exclusion === null),
    outOfScope: invoices.filter((invoice) => invoice.exclusion !== null),
  };
}
