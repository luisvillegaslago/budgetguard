/**
 * BudgetGuard Invoice Repository
 * Database operations for billing profiles, invoice prefixes, and invoices (user-scoped)
 */

import { INVOICE_STATUS, TRANSACTION_TYPE } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import type { BillingProfileInput, CreateInvoiceInput, UpdateInvoiceInput } from '@/schemas/invoice';
import type {
  BillingProfile,
  Invoice,
  InvoiceLineItem,
  InvoiceListItem,
  InvoicePrefix,
  InvoiceStatus,
  PaymentMethod,
} from '@/types/finance';
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
  InvoiceNumber: string;
  InvoiceDate: Date;
  CompanyID: number | null;
  TransactionID: number | null;
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
  Notes: string | null;
  InvoiceLanguage: string | null;
  CreatedAt: Date;
  UpdatedAt: Date;
}

interface InvoiceListRow {
  InvoiceID: number;
  InvoiceNumber: string;
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
  Description: string;
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

  const result = await query<InvoicePrefixRow>(
    `INSERT INTO "InvoicePrefixes" ("Prefix", "NextNumber", "Description", "CompanyID", "UserID")
     VALUES ($1, $2, $3, $4, $5)
     RETURNING "PrefixID", "Prefix", "NextNumber", "Description", "CompanyID", "IsActive", "CreatedAt"`,
    [data.prefix, data.nextNumber ?? 1, data.description ?? null, data.companyId ?? null, userId],
  );

  const row = result[0];
  if (!row) throw new Error('Failed to create invoice prefix');
  return rowToPrefix(row);
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

  const result = await query(`DELETE FROM "InvoicePrefixes" WHERE "PrefixID" = $1 AND "UserID" = $2`, [
    prefixId,
    userId,
  ]);

  return result.length >= 0; // DELETE doesn't return rows; check via rowCount approach
}

// Custom error for conflict scenarios
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
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

  let sql = `SELECT "InvoiceID", "InvoiceNumber", "InvoiceDate", "ClientName",
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

    // 1. Lock prefix and get next number
    const prefixResult = await client.query<InvoicePrefixRow>(
      `SELECT "PrefixID", "Prefix", "NextNumber", "Description", "CompanyID", "IsActive", "CreatedAt"
       FROM "InvoicePrefixes"
       WHERE "PrefixID" = $1 AND "UserID" = $2
       FOR UPDATE`,
      [data.prefixId, userId],
    );

    const prefixRow = prefixResult.rows[0];
    if (!prefixRow) throw new Error('Invoice prefix not found');

    const invoiceNumber = `${prefixRow.Prefix}-${String(prefixRow.NextNumber).padStart(2, '0')}`;

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

    // 4. Calculate total
    const totalCents = data.lineItems.reduce((sum, item) => sum + item.amountCents, 0);

    // 5. Insert invoice
    const invoiceDate =
      data.invoiceDate instanceof Date
        ? data.invoiceDate.toISOString().split('T')[0]
        : String(data.invoiceDate).split('T')[0];

    const invoiceResult = await client.query<InvoiceRow>(
      `INSERT INTO "Invoices" (
        "PrefixID", "InvoiceNumber", "InvoiceDate", "CompanyID", "TotalCents", "Status",
        "BillerName", "BillerNif", "BillerAddress", "BillerPhone", "BillerPaymentMethod",
        "BillerBankName", "BillerIban", "BillerSwift", "BillerBankAddress",
        "ClientName", "ClientTradingName", "ClientTaxId", "ClientAddress",
        "ClientCity", "ClientPostalCode", "ClientCountry",
        "Notes", "UserID"
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17, $18, $19,
        $20, $21, $22,
        $23, $24
      ) RETURNING *`,
      [
        data.prefixId,
        invoiceNumber,
        invoiceDate,
        data.companyId,
        totalCents,
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
        userId,
      ],
    );

    const invoiceRow = invoiceResult.rows[0];
    if (!invoiceRow) throw new Error('Failed to create invoice');

    // 6. Insert line items
    const lineItemValues = data.lineItems.map((item, index) => [
      invoiceRow.InvoiceID,
      index,
      item.description,
      item.hours ?? null,
      item.hourlyRateCents ?? null,
      item.amountCents,
    ]);

    const lineItemParams: (string | number | null)[] = [];
    const lineItemPlaceholders = lineItemValues.map((values, rowIndex) => {
      const offset = rowIndex * 6;
      values.forEach((v) => {
        lineItemParams.push(v as string | number | null);
      });
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
    });

    const lineItemResult = await client.query<LineItemRow>(
      `INSERT INTO "InvoiceLineItems" ("InvoiceID", "SortOrder", "Description", "Hours", "HourlyRateCents", "AmountCents")
       VALUES ${lineItemPlaceholders.join(', ')}
       RETURNING *`,
      lineItemParams,
    );

    // 7. Increment prefix next number
    await client.query(`UPDATE "InvoicePrefixes" SET "NextNumber" = "NextNumber" + 1 WHERE "PrefixID" = $1`, [
      data.prefixId,
    ]);

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
 * Update a draft invoice (date, line items, notes) — TRANSACTIONAL
 * Deletes existing line items and re-inserts. Recalculates TotalCents.
 * Only draft invoices can be edited.
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
    if (!invoiceRow) throw new Error('Invoice not found');
    if (invoiceRow.Status !== INVOICE_STATUS.DRAFT) {
      throw new Error('Only draft invoices can be edited');
    }

    // 2. Delete existing line items
    await client.query(`DELETE FROM "InvoiceLineItems" WHERE "InvoiceID" = $1`, [invoiceId]);

    // 3. Insert new line items
    const lineItemParams: (string | number | null)[] = [];
    const lineItemPlaceholders = data.lineItems.map((item, index) => {
      const offset = index * 6;
      lineItemParams.push(
        invoiceId,
        index,
        item.description,
        item.hours ?? null,
        item.hourlyRateCents ?? null,
        item.amountCents,
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
    });

    const lineItemResult = await client.query<LineItemRow>(
      `INSERT INTO "InvoiceLineItems" ("InvoiceID", "SortOrder", "Description", "Hours", "HourlyRateCents", "AmountCents")
       VALUES ${lineItemPlaceholders.join(', ')}
       RETURNING *`,
      lineItemParams,
    );

    // 4. Recalculate total
    const totalCents = data.lineItems.reduce((sum, item) => sum + item.amountCents, 0);

    // 5. Update invoice
    const invoiceDate = toDateString(data.invoiceDate);

    await client.query(
      `UPDATE "Invoices" SET "InvoiceDate" = $1, "TotalCents" = $2, "Notes" = $3 WHERE "InvoiceID" = $4`,
      [invoiceDate, totalCents, data.notes ?? null, invoiceId],
    );

    await client.query('COMMIT');

    const lineItems = lineItemResult.rows.map(rowToLineItem);
    return rowToInvoice(
      { ...invoiceRow, InvoiceDate: new Date(invoiceDate), TotalCents: totalCents, Notes: data.notes ?? null },
      lineItems,
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update invoice status with state machine validation (TRANSACTIONAL)
 * Valid transitions:
 *   draft → finalized
 *   finalized → paid (creates income transaction)
 *   finalized → cancelled
 *   paid → cancelled (deletes associated transaction)
 */
export async function updateInvoiceStatus(
  invoiceId: number,
  newStatus: InvoiceStatus,
  categoryId?: number,
): Promise<Invoice> {
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
    if (!invoiceRow) throw new Error('Invoice not found');

    const currentStatus = invoiceRow.Status as InvoiceStatus;

    // Validate state transition
    const validTransitions: Record<string, InvoiceStatus[]> = {
      [INVOICE_STATUS.DRAFT]: [INVOICE_STATUS.FINALIZED],
      [INVOICE_STATUS.FINALIZED]: [INVOICE_STATUS.PAID, INVOICE_STATUS.CANCELLED, INVOICE_STATUS.DRAFT],
      [INVOICE_STATUS.PAID]: [INVOICE_STATUS.CANCELLED],
      [INVOICE_STATUS.CANCELLED]: [],
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw new Error(`Invalid status transition from '${currentStatus}' to '${newStatus}'`);
    }

    let transactionId: number | null = invoiceRow.TransactionID;

    // Handle paid → creates income transaction
    if (newStatus === INVOICE_STATUS.PAID) {
      if (!categoryId) throw new Error('categoryId is required when marking as paid');

      const invoiceDate = toDateString(invoiceRow.InvoiceDate);
      const txResult = await client.query<{ TransactionID: number }>(
        `INSERT INTO "Transactions"
         ("CategoryID", "AmountCents", "Description", "TransactionDate", "Type",
          "SharedDivisor", "InvoiceNumber", "CompanyID", "UserID")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING "TransactionID"`,
        [
          categoryId,
          invoiceRow.TotalCents,
          `Factura ${invoiceRow.InvoiceNumber}`,
          invoiceDate,
          TRANSACTION_TYPE.INCOME,
          1,
          invoiceRow.InvoiceNumber,
          invoiceRow.CompanyID,
          userId,
        ],
      );

      transactionId = txResult.rows[0]?.TransactionID ?? null;
    }

    // Handle cancelling a paid invoice → delete associated transaction
    if (newStatus === INVOICE_STATUS.CANCELLED && currentStatus === INVOICE_STATUS.PAID && invoiceRow.TransactionID) {
      await client.query(`DELETE FROM "Transactions" WHERE "TransactionID" = $1 AND "UserID" = $2`, [
        invoiceRow.TransactionID,
        userId,
      ]);
      transactionId = null;
    }

    // Update invoice status
    await client.query(`UPDATE "Invoices" SET "Status" = $1, "TransactionID" = $2 WHERE "InvoiceID" = $3`, [
      newStatus,
      transactionId,
      invoiceId,
    ]);

    await client.query('COMMIT');

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

  // Re-query company data
  const companyResult = await query<{
    Name: string;
    TradingName: string | null;
    TaxId: string | null;
    Address: string | null;
    City: string | null;
    PostalCode: string | null;
    Country: string | null;
  }>(
    `SELECT "Name", "TradingName", "TaxId", "Address", "City", "PostalCode", "Country"
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
    },
    lineItems.map(rowToLineItem),
  );
}

/**
 * Delete an invoice (only drafts)
 */
export async function deleteInvoice(invoiceId: number): Promise<boolean> {
  const userId = await getUserIdOrThrow();

  // Check status
  const check = await query<{ Status: string }>(
    `SELECT "Status" FROM "Invoices" WHERE "InvoiceID" = $1 AND "UserID" = $2`,
    [invoiceId, userId],
  );

  if (!check[0]) return false;
  if (check[0].Status !== INVOICE_STATUS.DRAFT) {
    throw new Error('Only draft invoices can be deleted');
  }

  // Line items cascade automatically
  await query(`DELETE FROM "Invoices" WHERE "InvoiceID" = $1 AND "UserID" = $2`, [invoiceId, userId]);

  return true;
}
