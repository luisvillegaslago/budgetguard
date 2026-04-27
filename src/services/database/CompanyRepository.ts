/**
 * BudgetGuard Company Repository
 * Database operations for companies/providers (user-scoped)
 */

import type { CompanyRole } from '@/constants/finance';
import { INVOICE_STATUS } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import type { Company } from '@/types/finance';
import { query } from './connection';

interface CompanyRow {
  CompanyID: number;
  Name: string;
  TradingName: string | null;
  TaxId: string | null;
  Address: string | null;
  City: string | null;
  PostalCode: string | null;
  Country: string | null;
  InvoiceLanguage: string | null;
  Role: string;
  DefaultBankFeeCents: number | null;
  IsActive: boolean;
  CreatedAt: Date | string;
  UpdatedAt: Date | string;
}

function toISOString(val: Date | string): string {
  if (typeof val === 'string') return val;
  return val.toISOString();
}

function rowToCompany(row: CompanyRow): Company {
  return {
    companyId: row.CompanyID,
    name: row.Name,
    tradingName: row.TradingName,
    taxId: row.TaxId,
    address: row.Address,
    city: row.City,
    postalCode: row.PostalCode,
    country: row.Country,
    invoiceLanguage: row.InvoiceLanguage,
    role: row.Role as CompanyRole,
    defaultBankFeeCents: row.DefaultBankFeeCents,
    isActive: row.IsActive,
    createdAt: toISOString(row.CreatedAt),
    updatedAt: toISOString(row.UpdatedAt),
  };
}

const COMPANY_COLUMNS = `"CompanyID", "Name", "TradingName", "TaxId", "Address", "City", "PostalCode", "Country", "InvoiceLanguage", "Role", "DefaultBankFeeCents", "IsActive", "CreatedAt", "UpdatedAt"`;

/**
 * Get all companies for the current user
 */
export async function getCompanies(filters?: { isActive?: boolean; role?: CompanyRole }): Promise<Company[]> {
  const userId = await getUserIdOrThrow();
  const params: unknown[] = [userId];
  let sql = `SELECT ${COMPANY_COLUMNS} FROM "Companies" WHERE "UserID" = $1`;

  if (filters?.isActive !== undefined) {
    params.push(filters.isActive);
    sql += ` AND "IsActive" = $${params.length}`;
  }

  if (filters?.role !== undefined) {
    params.push(filters.role);
    sql += ` AND "Role" = $${params.length}`;
  }

  sql += ` ORDER BY "Name" ASC`;

  const rows = await query<CompanyRow>(sql, params);
  return rows.map(rowToCompany);
}

/**
 * Get a single company by ID (verifies ownership)
 */
export async function getCompanyById(id: number): Promise<Company | null> {
  const userId = await getUserIdOrThrow();

  const rows = await query<CompanyRow>(
    `SELECT ${COMPANY_COLUMNS} FROM "Companies" WHERE "CompanyID" = $1 AND "UserID" = $2`,
    [id, userId],
  );

  const row = rows[0];
  return row ? rowToCompany(row) : null;
}

/**
 * Create a new company (full create)
 */
export async function createCompany(data: {
  name: string;
  tradingName?: string | null;
  taxId?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  invoiceLanguage?: string | null;
  role?: string;
  defaultBankFeeCents?: number | null;
}): Promise<Company> {
  const userId = await getUserIdOrThrow();

  const rows = await query<CompanyRow>(
    `INSERT INTO "Companies" ("Name", "TradingName", "TaxId", "Address", "City", "PostalCode", "Country", "InvoiceLanguage", "Role", "DefaultBankFeeCents", "UserID")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${COMPANY_COLUMNS}`,
    [
      data.name,
      data.tradingName ?? null,
      data.taxId ?? null,
      data.address ?? null,
      data.city ?? null,
      data.postalCode ?? null,
      data.country ?? null,
      data.invoiceLanguage ?? null,
      data.role ?? 'client',
      data.defaultBankFeeCents ?? null,
      userId,
    ],
  );

  const row = rows[0];
  if (!row) {
    throw new Error('Failed to create company');
  }

  return rowToCompany(row);
}

/**
 * Find existing company by name or create a new one (atomic, for inline selector)
 * Uses INSERT ... ON CONFLICT DO NOTHING + SELECT to avoid race conditions
 */
export async function findOrCreateByName(name: string, role?: CompanyRole): Promise<Company> {
  const userId = await getUserIdOrThrow();

  // Try to insert, ignore if already exists
  const insertColumns = role ? '"Name", "UserID", "Role"' : '"Name", "UserID"';
  const insertValues = role ? '$1, $2, $3' : '$1, $2';
  const insertParams = role ? [name, userId, role] : [name, userId];
  await query(
    `INSERT INTO "Companies" (${insertColumns}) VALUES (${insertValues}) ON CONFLICT ("Name", "UserID") DO NOTHING`,
    insertParams,
  );

  // Always SELECT to get the company (whether just inserted or already existed)
  const rows = await query<CompanyRow>(
    `SELECT ${COMPANY_COLUMNS} FROM "Companies" WHERE "Name" = $1 AND "UserID" = $2`,
    [name, userId],
  );

  const row = rows[0];
  if (!row) {
    throw new Error('Failed to find or create company');
  }

  return rowToCompany(row);
}

/**
 * Update a company (verifies ownership)
 */
export async function updateCompany(
  id: number,
  data: Partial<{
    name: string;
    tradingName: string | null;
    taxId: string | null;
    address: string | null;
    city: string | null;
    postalCode: string | null;
    country: string | null;
    invoiceLanguage: string | null;
    role: string;
    defaultBankFeeCents: number | null;
    isActive: boolean;
  }>,
): Promise<Company | null> {
  const userId = await getUserIdOrThrow();

  const updates: string[] = [];
  const params: unknown[] = [id, userId];
  let paramIndex = 3;

  if (data.name !== undefined) {
    updates.push(`"Name" = $${paramIndex++}`);
    params.push(data.name);
  }
  if (data.tradingName !== undefined) {
    updates.push(`"TradingName" = $${paramIndex++}`);
    params.push(data.tradingName);
  }
  if (data.taxId !== undefined) {
    updates.push(`"TaxId" = $${paramIndex++}`);
    params.push(data.taxId);
  }
  if (data.address !== undefined) {
    updates.push(`"Address" = $${paramIndex++}`);
    params.push(data.address);
  }
  if (data.city !== undefined) {
    updates.push(`"City" = $${paramIndex++}`);
    params.push(data.city);
  }
  if (data.postalCode !== undefined) {
    updates.push(`"PostalCode" = $${paramIndex++}`);
    params.push(data.postalCode);
  }
  if (data.country !== undefined) {
    updates.push(`"Country" = $${paramIndex++}`);
    params.push(data.country);
  }
  if (data.invoiceLanguage !== undefined) {
    updates.push(`"InvoiceLanguage" = $${paramIndex++}`);
    params.push(data.invoiceLanguage);
  }
  if (data.role !== undefined) {
    updates.push(`"Role" = $${paramIndex++}`);
    params.push(data.role);
  }
  if (data.defaultBankFeeCents !== undefined) {
    updates.push(`"DefaultBankFeeCents" = $${paramIndex++}`);
    params.push(data.defaultBankFeeCents);
  }
  if (data.isActive !== undefined) {
    updates.push(`"IsActive" = $${paramIndex++}`);
    params.push(data.isActive);
  }

  if (updates.length === 0) {
    return getCompanyById(id);
  }

  const rows = await query<CompanyRow>(
    `UPDATE "Companies"
     SET ${updates.join(', ')}
     WHERE "CompanyID" = $1 AND "UserID" = $2
     RETURNING ${COMPANY_COLUMNS}`,
    params,
  );

  const row = rows[0];
  if (!row) return null;

  // Propagate client snapshot fields to draft invoices that reference this company.
  // Non-draft invoices keep their frozen snapshot (required for fiscal integrity).
  const clientFieldMap: Array<[keyof typeof data, string, string | null]> = [
    ['name', 'ClientName', data.name ?? null],
    ['tradingName', 'ClientTradingName', data.tradingName ?? null],
    ['taxId', 'ClientTaxId', data.taxId ?? null],
    ['address', 'ClientAddress', data.address ?? null],
    ['city', 'ClientCity', data.city ?? null],
    ['postalCode', 'ClientPostalCode', data.postalCode ?? null],
    ['country', 'ClientCountry', data.country ?? null],
  ];
  const clientUpdates: string[] = [];
  const clientParams: unknown[] = [];
  clientFieldMap.forEach(([key, column, value]) => {
    if (data[key] !== undefined) {
      clientUpdates.push(`"${column}" = $${clientParams.length + 1}`);
      clientParams.push(value);
    }
  });

  if (clientUpdates.length > 0) {
    const companyIdParam = clientParams.length + 1;
    const userIdParam = clientParams.length + 2;
    const statusParam = clientParams.length + 3;
    clientParams.push(id, userId, INVOICE_STATUS.DRAFT);
    await query(
      `UPDATE "Invoices" SET ${clientUpdates.join(', ')}
       WHERE "CompanyID" = $${companyIdParam} AND "UserID" = $${userIdParam} AND "Status" = $${statusParam}`,
      clientParams,
    );
  }

  return rowToCompany(row);
}

/**
 * Soft-delete a company (set IsActive = false)
 */
export async function deleteCompany(id: number): Promise<boolean> {
  const userId = await getUserIdOrThrow();

  const rows = await query<{ CompanyID: number }>(
    `UPDATE "Companies" SET "IsActive" = false WHERE "CompanyID" = $1 AND "UserID" = $2 RETURNING "CompanyID"`,
    [id, userId],
  );

  return rows.length > 0;
}

/**
 * Get usage count of a company across Transactions and RecurringExpenses
 */
export async function getCompanyUsageCount(id: number): Promise<number> {
  const userId = await getUserIdOrThrow();

  const rows = await query<{ count: number }>(
    `SELECT (
      (SELECT COUNT(*) FROM "Transactions" WHERE "CompanyID" = $1 AND "UserID" = $2) +
      (SELECT COUNT(*) FROM "RecurringExpenses" WHERE "CompanyID" = $1 AND "UserID" = $2)
    ) AS count`,
    [id, userId],
  );

  return Number(rows[0]?.count ?? 0);
}
