/**
 * Contract Tests: "vw_FiscalAccrual" agrees with the TypeScript constants
 *
 * The accrual rule lives in SQL (database/schema.sql) but the repository and the invoice
 * table still reason about the same concepts in TypeScript. Nothing in the type system
 * ties the two together: add a status to ISSUED_INVOICE_STATUSES and forget the view, and
 * the "Facturas Emitidas" table would list an invoice the fiscal models never count —
 * exactly the mismatch that started this module's history.
 *
 * These tests read the real schema file, so they fail on divergence without a database.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ISSUED_INVOICE_STATUSES, PROFESSIONAL_INCOME_CATEGORY, TRANSACTION_TYPE } from '@/constants/finance';

const SCHEMA = readFileSync(join(process.cwd(), 'database', 'schema.sql'), 'utf8');

/** Comments quote the constants they mirror, so strip them before matching literals. */
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

/** The CREATE VIEW body, up to its terminating semicolon, comments removed. */
function viewDefinition(name: string): string {
  const start = SCHEMA.indexOf(`CREATE VIEW "${name}" AS`);
  if (start === -1) throw new Error(`View ${name} not found in schema.sql`);

  const end = SCHEMA.indexOf(';', start);
  return stripComments(SCHEMA.slice(start, end));
}

/** Every `"Status" IN ('a', 'b')` clause, as arrays of the literals it lists. */
function statusClauses(sql: string): string[][] {
  return [...sql.matchAll(/"Status" IN \(([^)]*)\)/g)].map((match) =>
    (match[1] ?? '').split(',').map((literal) => literal.trim().replace(/'/g, '')),
  );
}

describe('vw_FiscalAccrual contract', () => {
  const view = viewDefinition('vw_FiscalAccrual');

  it('filters invoices by exactly the statuses the code calls issued', () => {
    const clauses = statusClauses(view);

    // One in the anti-join, one in the UNION branch. Both must agree with the constant.
    expect(clauses).toHaveLength(2);
    clauses.forEach((statuses) => {
      expect(statuses).toEqual([...ISSUED_INVOICE_STATUSES]);
    });
  });

  it('never books a draft or cancelled invoice as income', () => {
    statusClauses(view).forEach((statuses) => {
      expect(statuses).not.toContain('draft');
      expect(statuses).not.toContain('cancelled');
    });
  });

  it('labels invoice rows with the professional income category', () => {
    // CategoryName and ParentCategoryName, so isProfessionalIncome() recognises them.
    const occurrences = view.split(`'${PROFESSIONAL_INCOME_CATEGORY}'`).length - 1;

    expect(occurrences).toBe(2);
  });

  it('types invoice rows as income', () => {
    expect(view).toContain(`'${TRANSACTION_TYPE.INCOME}'`);
  });

  it('is dropped before the objects it depends on', () => {
    const dropAccrual = SCHEMA.indexOf('DROP VIEW IF EXISTS "vw_FiscalAccrual"');
    const dropQuarterly = SCHEMA.indexOf('DROP VIEW IF EXISTS "vw_FiscalQuarterly"');
    const dropInvoices = SCHEMA.indexOf('DROP TABLE IF EXISTS "Invoices"');

    expect(dropAccrual).toBeGreaterThan(-1);
    expect(dropAccrual).toBeLessThan(dropQuarterly);
    expect(dropAccrual).toBeLessThan(dropInvoices);
  });

  it('is created after the objects it depends on', () => {
    const createInvoices = SCHEMA.indexOf('CREATE TABLE "Invoices"');
    const createQuarterly = SCHEMA.indexOf('CREATE VIEW "vw_FiscalQuarterly"');
    const createAccrual = SCHEMA.indexOf('CREATE VIEW "vw_FiscalAccrual"');

    expect(createAccrual).toBeGreaterThan(createInvoices);
    expect(createAccrual).toBeGreaterThan(createQuarterly);
  });
});
