/**
 * Integration Tests: ids from a request body must belong to the caller
 *
 * The foreign keys from "Transactions" to "Categories", "Companies" and "Vouchers" are
 * single-column, so Postgres accepts another user's id as long as the row exists. Before the
 * ownership guard, a second account could:
 *  - attach its movement to someone else's category or company and read the name, icon and colour
 *    back in the 201, then block the owner from deleting that category (FK 23503 -> 500);
 *  - link its movement to someone else's voucher and lower that voucher's remaining balance.
 *
 * Every entry point that ends in createTransaction/updateTransaction or the group writers is driven
 * here through its real route and the real repository. Only the driver is faked; the fake answers
 * the ownership query the way Postgres would, from the owners table below.
 */

import type { NextRequest } from 'next/server';
import {
  API_ERROR,
  OCCURRENCE_STATUS,
  RECURRING_FREQUENCY,
  TRANSACTION_STATUS,
  TRANSACTION_TYPE,
} from '@/constants/finance';

const CALLER = 2;
const OTHER_USER = 1;

// Owner of every row the tests reference, per table. Ids absent here do not exist.
const OWNERS: Record<string, Record<number, number>> = {
  Categories: { 5: OTHER_USER, 15: CALLER, 16: CALLER },
  Companies: { 8: OTHER_USER, 18: CALLER },
  Vouchers: { 1: OTHER_USER, 11: CALLER },
  TransactionGroups: { 4: OTHER_USER, 40: CALLER },
  Transactions: { 100: CALLER },
  Trips: { 3: OTHER_USER, 12: CALLER },
};

const FOREIGN_CATEGORY = 5;
const OWN_CATEGORY = 15;
const OTHER_OWN_CATEGORY = 16;
const MISSING_CATEGORY = 999;
const FOREIGN_COMPANY = 8;
const OWN_COMPANY = 18;
const FOREIGN_VOUCHER = 1;
const OWN_VOUCHER = 11;
const FOREIGN_GROUP = 4;
const OWN_GROUP = 40;
const OWN_TRIP = 12;
const OWN_TRANSACTION = 100;

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

const transactionRow = (overrides: Record<string, unknown> = {}) => ({
  TransactionID: OWN_TRANSACTION,
  CategoryID: OWN_CATEGORY,
  CategoryName: 'Hotel',
  CategoryIcon: null,
  CategoryColor: null,
  ParentCategoryID: null,
  ParentCategoryName: null,
  AmountCents: 12000,
  Description: 'Hotel',
  TransactionDate: '2026-09-10',
  Type: TRANSACTION_TYPE.EXPENSE,
  SharedDivisor: 1,
  OriginalAmountCents: null,
  RecurringExpenseID: null,
  TransactionGroupID: null,
  TripID: null,
  TripName: null,
  VatPercent: null,
  DeductionPercent: null,
  VatDeductionPercent: null,
  VendorName: null,
  InvoiceNumber: null,
  Status: TRANSACTION_STATUS.PAID,
  CompanyID: null,
  FiscalDocumentID: null,
  VoucherID: null,
  VoucherUnits: null,
  CreatedAt: '2026-09-10T00:00:00Z',
  UpdatedAt: '2026-09-10T00:00:00Z',
  ...overrides,
});

// A pending occurrence of a recurring rule whose category is someone else's.
const occurrenceRow = () => ({
  OccurrenceID: 42,
  RecurringExpenseID: 7,
  OccurrenceDate: new Date('2025-01-01'),
  Status: OCCURRENCE_STATUS.PENDING,
  TransactionID: null,
  ModifiedAmountCents: null,
  ProcessedAt: null,
  RE_CategoryID: FOREIGN_CATEGORY,
  RE_CategoryName: 'Hotel',
  RE_CategoryIcon: null,
  RE_CategoryColor: null,
  RE_ParentCategoryID: null,
  RE_AmountCents: 4200,
  RE_Description: 'Cuota',
  RE_Frequency: RECURRING_FREQUENCY.MONTHLY,
  RE_DayOfWeek: null,
  RE_DayOfMonth: 1,
  RE_MonthOfYear: null,
  RE_StartDate: new Date('2024-01-01'),
  RE_EndDate: null,
  RE_IsActive: true,
  RE_SharedDivisor: 1,
  RE_OriginalAmountCents: null,
  RE_VatPercent: null,
  RE_DeductionPercent: null,
  RE_VatDeductionPercent: null,
  RE_VendorName: null,
  RE_CompanyID: null,
  RE_CreatedAt: new Date('2024-01-01'),
  RE_UpdatedAt: new Date('2024-01-01'),
});

function fakeRows(sql: string, params: unknown[]): unknown[] {
  executed.push({ sql, params });
  if (sql.includes('AS "Check"')) return answerOwnershipQuery(sql, params);
  if (sql.includes('INSERT INTO "TransactionGroups"')) return [{ TransactionGroupID: OWN_GROUP }];
  if (sql.includes('INSERT INTO "Transactions"')) return [{ TransactionID: 900 }];
  if (sql.includes('FROM "RecurringExpenseOccurrences" o')) return [occurrenceRow()];
  if (sql.includes('FROM "Transactions" t')) return [transactionRow()];
  return [];
}

const fakeClient = {
  query: jest.fn(async (sql: string, params?: unknown[]) => ({ rows: fakeRows(sql, params ?? []) })),
  release: jest.fn(),
};

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 2),
  AuthError: class AuthError extends Error {},
}));

jest.mock('@/services/database/connection', () => ({
  query: jest.fn(async (sql: string, params?: unknown[]) => fakeRows(sql, params ?? [])),
  getPool: jest.fn(() => ({ connect: jest.fn(async () => fakeClient) })),
}));

jest.mock('@/services/database/TripRepository', () => ({
  getTripById: jest.fn(async (id: number) => (id === 12 ? { tripId: 12, name: 'Tarifa' } : null)),
}));

const linkTransaction = jest.fn();
const updateDocumentAfterLink = jest.fn();
jest.mock('@/services/database/FiscalDocumentRepository', () => ({
  getDocumentById: jest.fn(async () => ({ documentId: 3 })),
  linkTransaction: (...args: unknown[]) => linkTransaction(...args),
  updateDocumentAfterLink: (...args: unknown[]) => updateDocumentAfterLink(...args),
  unlinkTransactionDocuments: jest.fn(),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { POST as LINK_TRANSACTION_POST } from '@/app/api/fiscal/documents/[id]/link-transaction/route';
import { POST as CONFIRM_OCCURRENCE_POST } from '@/app/api/recurring-expenses/occurrences/[id]/confirm/route';
import { PATCH as GROUP_PATCH } from '@/app/api/transaction-groups/[id]/route';
import { POST as GROUP_POST } from '@/app/api/transaction-groups/route';
import { PUT as TRANSACTION_PUT } from '@/app/api/transactions/[id]/route';
import { POST as TRANSACTION_POST } from '@/app/api/transactions/route';
import { PUT as TRIP_EXPENSE_PUT } from '@/app/api/trips/[id]/expenses/[expenseId]/route';
import { POST as TRIP_EXPENSE_POST } from '@/app/api/trips/[id]/expenses/route';
import { createTransaction } from '@/services/database/TransactionRepository';
import { NotFoundError } from '@/utils/apiErrors';

type RouteParams = Record<string, string>;

function request(body: Record<string, unknown>): NextRequest {
  return { url: 'http://localhost:3000/api', json: async () => body } as unknown as NextRequest;
}

function params(values: RouteParams) {
  return { params: Promise.resolve(values) };
}

const statements = (fragment: string) => executed.filter((s) => s.sql.includes(fragment));

const expense = (overrides: Record<string, unknown> = {}) => ({
  categoryId: OWN_CATEGORY,
  amount: 120,
  description: 'Hotel',
  transactionDate: '2026-09-10',
  type: TRANSACTION_TYPE.EXPENSE,
  ...overrides,
});

const groupBody = (categoryIds: number[]) => ({
  description: 'Aplazamiento',
  transactionDate: '2026-09-10',
  type: TRANSACTION_TYPE.EXPENSE,
  parentCategoryId: OWN_CATEGORY,
  items: categoryIds.map((categoryId) => ({ categoryId, amount: 10 })),
});

beforeEach(() => {
  executed = [];
  fakeClient.query.mockClear();
  linkTransaction.mockClear();
  updateDocumentAfterLink.mockClear();
});

describe('POST /api/transactions', () => {
  it("rejects another user's category as not found and writes nothing", async () => {
    const response = await TRANSACTION_POST(request(expense({ categoryId: FOREIGN_CATEGORY })), params({}));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: API_ERROR.NOT_FOUND.CATEGORY });
    expect(statements('INSERT INTO "Transactions"')).toHaveLength(0);
  });

  it("rejects another user's company as not found and writes nothing", async () => {
    const response = await TRANSACTION_POST(request(expense({ companyId: FOREIGN_COMPANY })), params({}));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: API_ERROR.NOT_FOUND.COMPANY });
    expect(statements('INSERT INTO "Transactions"')).toHaveLength(0);
  });

  it("rejects another user's voucher, so its balance cannot be drawn down", async () => {
    const response = await TRANSACTION_POST(
      request(expense({ voucherId: FOREIGN_VOUCHER, voucherUnits: 1 })),
      params({}),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: API_ERROR.NOT_FOUND.VOUCHER });
    expect(statements('INSERT INTO "Transactions"')).toHaveLength(0);
  });

  it('answers a foreign id exactly like an id that does not exist', async () => {
    const foreign = await TRANSACTION_POST(request(expense({ categoryId: FOREIGN_CATEGORY })), params({}));
    const missing = await TRANSACTION_POST(request(expense({ categoryId: MISSING_CATEGORY })), params({}));

    expect(foreign.status).toBe(missing.status);
    expect(await foreign.json()).toEqual(await missing.json());
  });

  it('still creates the movement when every reference is the caller’s own', async () => {
    const response = await TRANSACTION_POST(
      request(expense({ companyId: OWN_COMPANY, voucherId: OWN_VOUCHER, voucherUnits: 1 })),
      params({}),
    );

    expect(response.status).toBe(201);
    expect(statements('INSERT INTO "Transactions"')).toHaveLength(1);
  });
});

describe('PUT /api/transactions/[id]', () => {
  it("rejects moving a movement into another user's category", async () => {
    const response = await TRANSACTION_PUT(
      request({ categoryId: FOREIGN_CATEGORY }),
      params({ id: String(OWN_TRANSACTION) }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: API_ERROR.NOT_FOUND.CATEGORY });
    expect(statements('UPDATE "Transactions"')).toHaveLength(0);
  });

  it("rejects linking a movement to another user's company", async () => {
    const response = await TRANSACTION_PUT(
      request({ companyId: FOREIGN_COMPANY }),
      params({ id: String(OWN_TRANSACTION) }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: API_ERROR.NOT_FOUND.COMPANY });
    expect(statements('UPDATE "Transactions"')).toHaveLength(0);
  });

  it("rejects linking a movement to another user's voucher", async () => {
    const response = await TRANSACTION_PUT(
      request({ voucherId: FOREIGN_VOUCHER, voucherUnits: 1 }),
      params({ id: String(OWN_TRANSACTION) }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: API_ERROR.NOT_FOUND.VOUCHER });
    expect(statements('UPDATE "Transactions"')).toHaveLength(0);
  });

  it('lets a movement clear its company and voucher without any ownership lookup failing', async () => {
    const response = await TRANSACTION_PUT(
      request({ categoryId: OWN_CATEGORY, companyId: null, voucherId: null }),
      params({ id: String(OWN_TRANSACTION) }),
    );

    expect(response.status).toBe(200);
    expect(statements('UPDATE "Transactions"')).toHaveLength(1);
  });
});

describe('trip expenses (TRIPS-01)', () => {
  it("POST rejects another user's category inside the caller's own trip", async () => {
    const response = await TRIP_EXPENSE_POST(
      request({ categoryId: FOREIGN_CATEGORY, amount: 300, transactionDate: '2026-09-10' }),
      params({ id: String(OWN_TRIP) }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: API_ERROR.NOT_FOUND.CATEGORY });
    expect(statements('INSERT INTO "Transactions"')).toHaveLength(0);
  });

  it("PUT rejects moving a trip expense into another user's category", async () => {
    const response = await TRIP_EXPENSE_PUT(
      request({ categoryId: FOREIGN_CATEGORY }),
      params({ id: String(OWN_TRIP), expenseId: String(OWN_TRANSACTION) }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: API_ERROR.NOT_FOUND.CATEGORY });
    expect(statements('UPDATE "Transactions"')).toHaveLength(0);
  });

  it('POST still books an expense in an own category', async () => {
    const response = await TRIP_EXPENSE_POST(
      request({ categoryId: OWN_CATEGORY, amount: 300, transactionDate: '2026-09-10' }),
      params({ id: String(OWN_TRIP) }),
    );

    expect(response.status).toBe(201);
    expect(statements('INSERT INTO "Transactions"')).toHaveLength(1);
  });
});

describe('transaction groups', () => {
  it('POST rejects a group whose items include another user’s category, before opening a transaction', async () => {
    const response = await GROUP_POST(request(groupBody([OWN_CATEGORY, FOREIGN_CATEGORY])), params({}));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: API_ERROR.NOT_FOUND.CATEGORY });
    expect(statements('INSERT INTO')).toHaveLength(0);
  });

  it('PATCH rejects adding another user’s category and rolls the edit back', async () => {
    const response = await GROUP_PATCH(
      request(groupBody([OWN_CATEGORY, FOREIGN_CATEGORY])),
      params({ id: String(OWN_GROUP) }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: API_ERROR.NOT_FOUND.CATEGORY });
    expect(statements('INSERT INTO "Transactions"')).toHaveLength(0);
    expect(statements('UPDATE "Transactions"')).toHaveLength(0);
    expect(statements('DELETE FROM "Transactions"')).toHaveLength(0);
    expect(statements('ROLLBACK')).toHaveLength(1);
    expect(statements('COMMIT')).toHaveLength(0);
  });

  it('PATCH checks the items inside the open transaction, on its own client', async () => {
    await GROUP_PATCH(request(groupBody([OWN_CATEGORY, OTHER_OWN_CATEGORY])), params({ id: String(OWN_GROUP) }));

    const ownershipCalls = fakeClient.query.mock.calls.filter(([sql]) => String(sql).includes('AS "Check"'));
    expect(ownershipCalls.length).toBeGreaterThan(0);
    expect(statements('COMMIT')).toHaveLength(1);
  });
});

describe('other callers of createTransaction', () => {
  it("link-transaction rejects another user's company and leaves the document unlinked", async () => {
    const response = await LINK_TRANSACTION_POST(
      request({
        categoryId: OWN_CATEGORY,
        amountCents: 12100,
        transactionDate: '2026-09-10',
        type: TRANSACTION_TYPE.EXPENSE,
        companyId: FOREIGN_COMPANY,
      }),
      params({ id: '3' }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: API_ERROR.NOT_FOUND.COMPANY });
    expect(statements('INSERT INTO "Transactions"')).toHaveLength(0);
    expect(linkTransaction).not.toHaveBeenCalled();
    expect(updateDocumentAfterLink).not.toHaveBeenCalled();
  });

  it("confirming an occurrence of a rule that points at another user's category mints no movement", async () => {
    const response = await CONFIRM_OCCURRENCE_POST(request({}), params({ id: '42' }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: API_ERROR.NOT_FOUND.CATEGORY });
    expect(statements('INSERT INTO "Transactions"')).toHaveLength(0);
    expect(statements('UPDATE "RecurringExpenseOccurrences"')).toHaveLength(0);
  });

  it("createTransaction refuses another user's transaction group", async () => {
    const outcome = await createTransaction({
      categoryId: OWN_CATEGORY,
      amountCents: 1000,
      transactionDate: new Date('2026-09-10'),
      type: TRANSACTION_TYPE.EXPENSE,
      transactionGroupId: FOREIGN_GROUP,
    }).catch((error: unknown) => error);

    expect(outcome).toBeInstanceOf(NotFoundError);
    expect(outcome).toMatchObject({ errorKey: API_ERROR.NOT_FOUND.GROUP });
    expect(statements('INSERT INTO "Transactions"')).toHaveLength(0);
  });
});
