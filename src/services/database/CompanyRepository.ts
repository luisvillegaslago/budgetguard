/**
 * BudgetGuard Company Repository
 * Database operations for companies/providers (user-scoped)
 */

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
    isActive: row.IsActive,
    createdAt: toISOString(row.CreatedAt),
    updatedAt: toISOString(row.UpdatedAt),
  };
}

const COMPANY_COLUMNS = `"CompanyID", "Name", "TradingName", "TaxId", "Address", "City", "PostalCode", "Country", "IsActive", "CreatedAt", "UpdatedAt"`;

/**
 * Get all companies for the current user
 */
export async function getCompanies(filters?: { isActive?: boolean }): Promise<Company[]> {
  const userId = await getUserIdOrThrow();
  const params: unknown[] = [userId];
  let sql = `SELECT ${COMPANY_COLUMNS} FROM "Companies" WHERE "UserID" = $1`;

  if (filters?.isActive !== undefined) {
    params.push(filters.isActive);
    sql += ` AND "IsActive" = $2`;
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
}): Promise<Company> {
  const userId = await getUserIdOrThrow();

  const rows = await query<CompanyRow>(
    `INSERT INTO "Companies" ("Name", "TradingName", "TaxId", "Address", "City", "PostalCode", "Country", "UserID")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${COMPANY_COLUMNS}`,
    [
      data.name,
      data.tradingName ?? null,
      data.taxId ?? null,
      data.address ?? null,
      data.city ?? null,
      data.postalCode ?? null,
      data.country ?? null,
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
export async function findOrCreateByName(name: string): Promise<Company> {
  const userId = await getUserIdOrThrow();

  // Try to insert, ignore if already exists
  await query(`INSERT INTO "Companies" ("Name", "UserID") VALUES ($1, $2) ON CONFLICT ("Name", "UserID") DO NOTHING`, [
    name,
    userId,
  ]);

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
  return row ? rowToCompany(row) : null;
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
