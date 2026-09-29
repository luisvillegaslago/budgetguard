/**
 * Integration Tests: what the recurring module writes is the caller's, and in the right amounts
 *
 * Two defects of the recurring review (2026-09-24), both on write paths that the route tests could
 * not see because they mock the repository:
 *
 *  - RECURRING-02: a rule could be created or edited with another user's category or company. The
 *    foreign keys are single-column, so Postgres accepted it; the 201 carried that user's category
 *    name, icon and colour, and the owner could no longer delete their category. The reads joined
 *    "Categories" by id alone, so the name kept flowing back.
 *  - RECURRING-01: confirming an occurrence of a shared rule with a modified amount stored the typed
 *    figure unsplit as the user's part and kept the rule's old full bill in "OriginalAmountCents",
 *    the column the fiscal views read (COALESCE(OriginalAmountCents, AmountCents)). The 303/130 were
 *    computed on the wrong base.
 *
 * Everything runs through the real routes and the real repositories. Only the driver is faked, and
 * it answers the ownership check the way Postgres would, from the owners table below.
 */

import type { NextRequest } from 'next/server';
import {
  API_ERROR,
  OCCURRENCE_STATUS,
  RECURRING_FREQUENCY,
  SHARED_EXPENSE,
  TRANSACTION_STATUS,
  TRANSACTION_TYPE,
  VAT_RATE,
} from '@/constants/finance';

const CALLER = 2;
const OTHER_USER = 1;

const OWN_CATEGORY = 15;
const FOREIGN_CATEGORY = 5;
const OWN_COMPANY = 18;
const FOREIGN_COMPANY = 8;
const RULE_ID = 7;
const OCCURRENCE_ID = 42;

// Owner of every row the tests reference, per table. Ids absent here do not exist.
const OWNERS: Record<string, Record<number, number>> = {
  Categories: { [OWN_CATEGORY]: CALLER, [FOREIGN_CATEGORY]: OTHER_USER },
  Companies: { [OWN_COMPANY]: CALLER, [FOREIGN_COMPANY]: OTHER_USER },
};

interface ExecutedStatement {
  sql: string;
  params: unknown[];
}

let executed: ExecutedStatement[] = [];

/**
 * Answers the ownership check as Postgres would: each UNION ALL branch reads one table, binds its
 * ids as an int array and the user as $1, and returns only the ids that user owns.
 */
function answerOwnershipQuery(sql: string, params: unknown[]): Array<{ Check: number; Id: number }> {
  const userId = params[0];
  return sql.split('UNION ALL').flatMap((branch) => {
    const shape = /SELECT (\d+) AS "Check", "\w+" AS "Id"\s+FROM "(\w+)"[\s\S]*ANY\(\$(\d+)::int\[\]\)/.exec(branch);
    const [, check, table, paramNumber] = shape ?? [];
    if (!check || !table || !paramNumber) throw new Error(`Unexpected ownership branch: ${branch}`);
    const ids = params[Number(paramNumber) - 1] as number[];
    const owners = OWNERS[table] ?? {};
    return ids.filter((id) => owners[id] === userId).map((id) => ({ Check: Number(check), Id: id }));
  });
}

/** Rule 7 of the review, "Fibra + TV": shared, 42,13 of a 84,26 EUR bill, IVA 21 %. */
const SHARED_RULE = { amountCents: 4213, originalAmountCents: 8426, sharedDivisor: SHARED_EXPENSE.DIVISOR };
const PERSONAL_RULE = { amountCents: 4200, originalAmountCents: null, sharedDivisor: SHARED_EXPENSE.DEFAULT_DIVISOR };

type RuleAmounts = typeof SHARED_RULE | typeof PERSONAL_RULE;

let ruleAmounts: RuleAmounts = SHARED_RULE;

const recurringRow = () => ({
  RecurringExpenseID: RULE_ID,
  CategoryID: OWN_CATEGORY,
  CategoryName: 'Internet',
  CategoryIcon: null,
  CategoryColor: null,
  ParentCategoryID: null,
  AmountCents: ruleAmounts.amountCents,
  Description: 'Fibra + TV',
  Frequency: RECURRING_FREQUENCY.MONTHLY,
  DayOfWeek: null,
  DayOfMonth: 1,
  MonthOfYear: null,
  StartDate: new Date('2026-08-01'),
  EndDate: null,
  IsActive: true,
  SharedDivisor: ruleAmounts.sharedDivisor,
  OriginalAmountCents: ruleAmounts.originalAmountCents,
  VatPercent: VAT_RATE.STANDARD,
  DeductionPercent: null,
  VatDeductionPercent: null,
  VendorName: null,
  CompanyID: null,
  CreatedAt: new Date('2026-08-01'),
  UpdatedAt: new Date('2026-08-01'),
});

const occurrenceRow = () => ({
  OccurrenceID: OCCURRENCE_ID,
  RecurringExpenseID: RULE_ID,
  OccurrenceDate: new Date('2026-08-01'),
  Status: OCCURRENCE_STATUS.PENDING,
  TransactionID: null,
  ModifiedAmountCents: null,
  ProcessedAt: null,
  RE_CategoryID: OWN_CATEGORY,
  RE_CategoryName: 'Internet',
  RE_CategoryIcon: null,
  RE_CategoryColor: null,
  RE_ParentCategoryID: null,
  RE_AmountCents: ruleAmounts.amountCents,
  RE_Description: 'Fibra + TV',
  RE_Frequency: RECURRING_FREQUENCY.MONTHLY,
  RE_DayOfWeek: null,
  RE_DayOfMonth: 1,
  RE_MonthOfYear: null,
  RE_StartDate: new Date('2026-08-01'),
  RE_EndDate: null,
  RE_IsActive: true,
  RE_SharedDivisor: ruleAmounts.sharedDivisor,
  RE_OriginalAmountCents: ruleAmounts.originalAmountCents,
  RE_VatPercent: VAT_RATE.STANDARD,
  RE_DeductionPercent: null,
  RE_VatDeductionPercent: null,
  RE_VendorName: null,
  RE_CompanyID: null,
  RE_CreatedAt: new Date('2026-08-01'),
  RE_UpdatedAt: new Date('2026-08-01'),
});

const transactionRow = () => ({
  TransactionID: 900,
  CategoryID: OWN_CATEGORY,
  CategoryName: 'Internet',
  CategoryIcon: null,
  CategoryColor: null,
  ParentCategoryID: null,
  ParentCategoryName: null,
  AmountCents: 4500,
  Description: 'Fibra + TV',
  TransactionDate: '2026-08-01',
  Type: TRANSACTION_TYPE.EXPENSE,
  SharedDivisor: SHARED_EXPENSE.DIVISOR,
  OriginalAmountCents: 9000,
  RecurringExpenseID: RULE_ID,
  TransactionGroupID: null,
  TripID: null,
  TripName: null,
  VatPercent: VAT_RATE.STANDARD,
  DeductionPercent: null,
  VatDeductionPercent: null,
  VendorName: null,
  InvoiceNumber: null,
  Status: TRANSACTION_STATUS.PAID,
  CompanyID: null,
  FiscalDocumentID: null,
  VoucherID: null,
  VoucherUnits: null,
  CreatedAt: '2026-08-01T00:00:00Z',
  UpdatedAt: '2026-08-01T00:00:00Z',
});

function fakeRows(sql: string, params: unknown[]): unknown[] {
  executed.push({ sql, params });
  if (sql.includes('AS "Check"')) return answerOwnershipQuery(sql, params);
  if (sql.includes('INSERT INTO "RecurringExpenses"')) return [{ RecurringExpenseID: RULE_ID }];
  if (sql.includes('INSERT INTO "Transactions"')) return [{ TransactionID: 900 }];
  if (sql.includes('FROM "RecurringExpenseOccurrences" o')) return [occurrenceRow()];
  if (sql.includes('FROM "RecurringExpenses" re')) return [recurringRow()];
  if (sql.includes('FROM "Transactions" t')) return [transactionRow()];
  return [];
}

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 2),
  AuthError: class AuthError extends Error {},
}));

jest.mock('@/services/database/connection', () => ({
  query: jest.fn(async (sql: string, params?: unknown[]) => fakeRows(sql, params ?? [])),
  getPool: jest.fn(),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { PUT as RULE_PUT } from '@/app/api/recurring-expenses/[id]/route';
import { POST as CONFIRM_POST } from '@/app/api/recurring-expenses/occurrences/[id]/confirm/route';
import { GET as PENDING_GET } from '@/app/api/recurring-expenses/pending/route';
import { POST as RULE_POST, GET as RULES_GET } from '@/app/api/recurring-expenses/route';
import { POST as TRANSACTION_POST } from '@/app/api/transactions/route';

function request(body: Record<string, unknown> = {}): NextRequest {
  return { url: 'http://localhost:3000/api/recurring-expenses', json: async () => body } as unknown as NextRequest;
}

function params(values: Record<string, string> = {}) {
  return { params: Promise.resolve(values) };
}

const statements = (fragment: string) => executed.filter((s) => s.sql.includes(fragment));
const ownershipChecks = () => statements('AS "Check"');

/** The single statement containing `fragment`, or a failure naming it. */
function onlyStatement(fragment: string): ExecutedStatement {
  const found = statements(fragment);
  if (found.length !== 1) throw new Error(`Expected one statement with ${fragment}, got ${found.length}`);
  return found[0] as ExecutedStatement;
}

/**
 * A bound parameter read by the column it sits under in the INSERT's own column list, so a
 * transposition in the positional list cannot pass for the right value.
 */
function insertedValue(table: string, column: string): unknown {
  const insert = onlyStatement(`INSERT INTO "${table}"`);
  const columnList = /INSERT INTO "\w+"\s*\(([^)]*)\)/.exec(insert.sql)?.[1] ?? '';
  const columns = columnList.split(',').map((name) => name.trim().replace(/"/g, ''));
  const position = columns.indexOf(column);
  if (position < 0) throw new Error(`Column ${column} is not in the INSERT INTO "${table}"`);
  return insert.params[position];
}

/** The three amount columns of the one movement the request wrote. */
function insertedAmounts() {
  return {
    amountCents: insertedValue('Transactions', 'AmountCents'),
    originalAmountCents: insertedValue('Transactions', 'OriginalAmountCents'),
    sharedDivisor: insertedValue('Transactions', 'SharedDivisor'),
  };
}

/** Every `JOIN "Categories" <alias> ON ...` clause of a statement, with its alias. */
function categoryJoins(sql: string): Array<{ alias: string; condition: string }> {
  return [...sql.matchAll(/JOIN "Categories" (\w+) ON ([^\n]+)/g)].map((match) => ({
    alias: match[1] ?? '',
    condition: match[2] ?? '',
  }));
}

const ruleBody = (overrides: Record<string, unknown> = {}) => ({
  categoryId: OWN_CATEGORY,
  amount: 84.26,
  description: 'Fibra + TV',
  frequency: RECURRING_FREQUENCY.MONTHLY,
  startDate: '2026-08-01',
  isShared: true,
  ...overrides,
});

beforeEach(() => {
  executed = [];
  ruleAmounts = SHARED_RULE;
});

describe('RECURRING-02: a rule only references the caller’s own category and company', () => {
  it("POST refuses another user's category as not found and inserts no rule", async () => {
    const response = await RULE_POST(request(ruleBody({ categoryId: FOREIGN_CATEGORY })), params());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: API_ERROR.NOT_FOUND.CATEGORY });
    expect(statements('INSERT INTO "RecurringExpenses"')).toHaveLength(0);
  });

  it("POST refuses another user's company as not found and inserts no rule", async () => {
    const response = await RULE_POST(request(ruleBody({ companyId: FOREIGN_COMPANY })), params());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: API_ERROR.NOT_FOUND.COMPANY });
    expect(statements('INSERT INTO "RecurringExpenses"')).toHaveLength(0);
  });

  it('POST checks the caller’s own category and company before the rule is written', async () => {
    const response = await RULE_POST(request(ruleBody({ companyId: OWN_COMPANY })), params());

    expect(response.status).toBe(201);
    const check = onlyStatement('AS "Check"');
    expect(check.params).toEqual([CALLER, [OWN_CATEGORY], [OWN_COMPANY]]);
    expect(executed.indexOf(check)).toBeLessThan(executed.indexOf(onlyStatement('INSERT INTO "RecurringExpenses"')));
  });

  it("PUT refuses another user's category and leaves the rule untouched", async () => {
    const response = await RULE_PUT(request({ categoryId: FOREIGN_CATEGORY }), params({ id: String(RULE_ID) }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: API_ERROR.NOT_FOUND.CATEGORY });
    expect(statements('UPDATE "RecurringExpenses"')).toHaveLength(0);
  });

  it("PUT refuses another user's company and leaves the rule untouched", async () => {
    const response = await RULE_PUT(request({ companyId: FOREIGN_COMPANY }), params({ id: String(RULE_ID) }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: API_ERROR.NOT_FOUND.COMPANY });
    expect(statements('UPDATE "RecurringExpenses"')).toHaveLength(0);
  });

  it('PUT that clears the company or leaves both references alone sends no ownership query', async () => {
    const body = { companyId: null, description: 'Fibra' };
    const response = await RULE_PUT(request(body), params({ id: String(RULE_ID) }));

    expect(response.status).toBe(200);
    expect(ownershipChecks()).toHaveLength(0);
    expect(statements('UPDATE "RecurringExpenses"')).toHaveLength(1);
  });

  it('the rule list, the pending list and the confirmation join only the rule owner’s categories', async () => {
    await RULES_GET(request(), params());
    await PENDING_GET(request(), params());
    await CONFIRM_POST(request(), params({ id: String(OCCURRENCE_ID) }));

    // The rule list, the rules the pending list regenerates from, the pending list itself and the
    // confirmation's read of the occurrence. The movement read back afterwards has its own module.
    const ruleReads = statements('JOIN "Categories"').filter((read) => /"RecurringExpenses" re\b/.test(read.sql));
    expect(ruleReads).toHaveLength(4);
    ruleReads.forEach((read) => {
      const joins = categoryJoins(read.sql);
      expect(joins.length).toBeGreaterThan(0);
      joins.forEach(({ alias, condition }) => {
        expect(condition).toContain(`${alias}."UserID" = re."UserID"`);
      });
    });
  });
});

describe('RECURRING-01: a modified amount on a shared rule is stored like a shared movement typed by hand', () => {
  /** The amounts POST /api/transactions stores for a shared movement of `amount` euros. */
  async function amountsTypedByHand(amount: number) {
    executed = [];
    const response = await TRANSACTION_POST(
      request({
        categoryId: OWN_CATEGORY,
        amount,
        description: 'Fibra + TV',
        transactionDate: '2026-08-01',
        type: TRANSACTION_TYPE.EXPENSE,
        isShared: true,
      }),
      params(),
    );
    expect(response.status).toBe(201);
    return insertedAmounts();
  }

  /** The amounts confirming the pending occurrence stores, with `modifiedAmount` typed if given. */
  async function amountsConfirmed(modifiedAmount?: number) {
    executed = [];
    const body = modifiedAmount === undefined ? {} : { modifiedAmount };
    const response = await CONFIRM_POST(request(body), params({ id: String(OCCURRENCE_ID) }));
    expect(response.status).toBe(200);
    return insertedAmounts();
  }

  it('the review scenario: a 90 EUR bill on the 84,26 EUR shared rule stores 45 EUR of a 90 EUR bill', async () => {
    expect(await amountsConfirmed(90)).toEqual({ amountCents: 4500, originalAmountCents: 9000, sharedDivisor: 2 });
  });

  // 90,01 and 84,27 are odd in cents: the user's part rounds up exactly as the transaction form does.
  const TYPED_BILLS = [90, 90.01, 84.27, 0.01];

  it.each(TYPED_BILLS)('confirming %p EUR stores what typing it as a shared movement stores', async (amount) => {
    const typedByHand = await amountsTypedByHand(amount);
    const confirmed = await amountsConfirmed(amount);

    expect(confirmed).toEqual(typedByHand);
  });

  it('records the typed bill on the occurrence', async () => {
    await amountsConfirmed(90.01);

    const update = onlyStatement('UPDATE "RecurringExpenseOccurrences"');
    expect(update.params[0]).toBe(OCCURRENCE_STATUS.CONFIRMED);
    expect(update.params[2]).toBe(9001);
  });

  it('without a modified amount the shared rule’s own figures are copied unchanged', async () => {
    expect(await amountsConfirmed()).toEqual(SHARED_RULE);
  });

  it('a modified amount on a personal rule is the whole amount, with no full bill beside it', async () => {
    ruleAmounts = PERSONAL_RULE;

    expect(await amountsConfirmed(90)).toEqual({ amountCents: 9000, originalAmountCents: null, sharedDivisor: 1 });
  });
});
