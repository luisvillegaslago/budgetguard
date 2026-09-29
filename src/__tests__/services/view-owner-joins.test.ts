/**
 * Contract Tests: reads join categories and vouchers only within the row's owner
 *
 * The foreign keys from "Transactions" to "Categories" and "Vouchers" are single-column, so a
 * movement written before the ownership guard could point at another user's row. A read that joins
 * by id alone then shows that user's category names on the dashboard (DASHBOARD-SUMMARY-01) or
 * lowers that user's voucher balance (TRANSACTIONS-03).
 *
 * The views are checked in both places they are defined: database/schema.sql (a fresh database)
 * and migration 007 (the live one). A database cannot run here, so the SQL text is the contract;
 * the migration bodies were compared row by row with the live views on the local database.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schema = readFileSync(join(process.cwd(), 'database', 'schema.sql'), 'utf8');
const migration = readFileSync(
  join(process.cwd(), 'database', 'migrations', '007-scope-view-joins-to-owner.sql'),
  'utf8',
);

/** The body of `CREATE [OR REPLACE] VIEW "<name>"`, up to its closing semicolon. */
function viewBody(sql: string, name: string): string {
  const match = new RegExp(`CREATE (?:OR REPLACE )?VIEW "${name}" AS([\\s\\S]*?);`).exec(sql);
  if (!match?.[1]) throw new Error(`View ${name} not found`);
  return match[1];
}

/** Every `JOIN "Categories" <alias> ON ...` clause of a statement, with its alias. */
function categoryJoins(sql: string): Array<{ alias: string; condition: string }> {
  return [...sql.matchAll(/JOIN "Categories" (\w+) ON ([^\n]+)/g)].map((match) => ({
    alias: match[1] ?? '',
    condition: match[2] ?? '',
  }));
}

jest.mock('@/libs/auth', () => ({ getUserIdOrThrow: jest.fn(async () => 2) }));

const executedSql: string[] = [];
jest.mock('@/services/database/connection', () => ({
  query: jest.fn(async (sql: string) => {
    executedSql.push(sql);
    return [];
  }),
  getPool: jest.fn(),
}));

import { getCategoryHistoryTransactions } from '@/services/database/TransactionRepository';

describe.each([
  ['database/schema.sql', schema],
  ['migration 007', migration],
])('%s', (_source, sql) => {
  it.each(['vw_MonthlySummary', 'vw_SubcategorySummary'])('%s joins only the owner’s categories', (view) => {
    const joins = categoryJoins(viewBody(sql, view));

    expect(joins.length).toBeGreaterThan(0);
    joins.forEach(({ alias, condition }) => {
      expect(condition).toContain(`${alias}."UserID" = t."UserID"`);
    });
  });

  it('vw_VoucherBalance counts only the voucher owner’s paid movements', () => {
    const body = viewBody(sql, 'vw_VoucherBalance');

    expect(body).toContain(`t."UserID" = v."UserID"`);
    expect(body).toContain(`t."Status" = 'paid'`);
  });

  it.each(['vw_MonthlySummary', 'vw_SubcategorySummary'])('%s still counts paid movements only', (view) => {
    expect(viewBody(sql, view)).toContain(`WHERE t."Status" = 'paid'`);
  });
});

describe('getCategoryHistoryTransactions', () => {
  it('joins the category and its parent only within the movement’s owner', async () => {
    await getCategoryHistoryTransactions(15, new Date('2026-01-01'), new Date('2026-09-30'));

    const joins = categoryJoins(executedSql.join('\n'));
    expect(joins.map((clause) => clause.alias).sort()).toEqual(['c', 'parent']);
    joins.forEach(({ alias, condition }) => {
      expect(condition).toContain(`${alias}."UserID" = t."UserID"`);
    });
  });
});
