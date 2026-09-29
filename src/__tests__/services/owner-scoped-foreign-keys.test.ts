/**
 * Contract test: the owner-scoped foreign keys of migration 008 and of
 * database/schema.sql are the same list, and it covers every reference that a
 * request can set.
 *
 * The list lives twice on purpose (schema.sql is the canonical fresh-database
 * script, the migration converts an existing one), so a key added to one file
 * and forgotten in the other would leave that environment accepting another
 * user's id. Behaviour against a real database was checked by hand on a
 * throwaway copy; see the 008 row of MIGRATIONS.md.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');

function ownerRefs(file: string): string[] {
  const sql = readFileSync(join(ROOT, file), 'utf8');
  const start = sql.indexOf('INSERT INTO owner_refs VALUES');
  const end = sql.indexOf(';', start);
  expect(start).toBeGreaterThan(-1);
  return Array.from(sql.slice(start, end).matchAll(/\(([^()]+)\)/g), (m) => (m[1] ?? '').replace(/\s+/g, ' ').trim());
}

const MIGRATION = 'database/migrations/008-owner-scoped-foreign-keys.sql';
const SCHEMA = 'database/schema.sql';

// child.column -> parent: every reference whose id can arrive in a request.
const REQUIRED = [
  'Categories.ParentCategoryID -> Categories',
  'Transactions.CategoryID -> Categories',
  'RecurringExpenses.CategoryID -> Categories',
  'Vouchers.CategoryID -> Categories',
  'Transactions.CompanyID -> Companies',
  'RecurringExpenses.CompanyID -> Companies',
  'InvoicePrefixes.CompanyID -> Companies',
  'Invoices.CompanyID -> Companies',
  'FiscalDocuments.CompanyID -> Companies',
  'Transactions.VoucherID -> Vouchers',
  'Transactions.TripID -> Trips',
  'Transactions.TransactionGroupID -> TransactionGroups',
  'Transactions.RecurringExpenseID -> RecurringExpenses',
  'Transactions.DeferralID -> Deferrals',
  'Deferrals.FiscalDocumentID -> FiscalDocuments',
  'Invoices.PrefixID -> InvoicePrefixes',
  'SkydiveJumps.TransactionID -> Transactions',
  'TunnelSessions.TransactionID -> Transactions',
  'Invoices.TransactionID -> Transactions',
  'FiscalDocuments.TransactionID -> Transactions',
  'FixedAssets.TransactionID -> Transactions',
];

function asReference(row: string): string {
  const [child, col, parent] = row.split(',').map((part) => part.trim().replace(/'/g, ''));
  return `${child}.${col} -> ${parent}`;
}

describe('owner-scoped foreign keys (migration 008 and schema.sql)', () => {
  it('lists exactly the same keys, with the same delete behaviour and names, in both files', () => {
    expect(ownerRefs(SCHEMA)).toEqual(ownerRefs(MIGRATION));
  });

  it('covers every reference a request can set', () => {
    expect(ownerRefs(MIGRATION).map(asReference).sort()).toEqual([...REQUIRED].sort());
  });

  it('keeps a SET NULL key from clearing the owner', () => {
    const migration = readFileSync(join(ROOT, MIGRATION), 'utf8');
    expect(migration).toContain("format(' ON DELETE SET NULL (%I)', r.col)");
  });
});
