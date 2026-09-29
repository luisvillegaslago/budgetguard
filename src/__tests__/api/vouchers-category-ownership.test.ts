/**
 * Integration Tests: a voucher's category must belong to the caller (VOUCHERS-01)
 *
 * "Vouchers"."CategoryID" has a single-column foreign key, so Postgres accepts any existing
 * category. Without an ownership check a second account could create or move a voucher into
 * someone else's category, read that category's name, icon and colour back, have every skydiving
 * consumption of the voucher booked under it, and stop the owner from deleting it (FK -> 500).
 *
 * POST and PUT are driven through their real routes, the real VoucherRepository and the real
 * ownership guard. Only the driver is faked; it answers the ownership query as Postgres would,
 * from the owners table below.
 */

import type { NextRequest } from 'next/server';
import { API_ERROR } from '@/constants/finance';

const CALLER = 2;
const OTHER_USER = 1;

// Owner of every category the tests reference. Ids absent here do not exist.
const CATEGORY_OWNERS: Record<number, number> = { 5: OTHER_USER, 15: CALLER };

const FOREIGN_CATEGORY = 5;
const OWN_CATEGORY = 15;
const MISSING_CATEGORY = 999;
const OWN_VOUCHER = 11;

interface ExecutedStatement {
  sql: string;
  params: unknown[];
}

let executed: ExecutedStatement[] = [];

/** Each UNION ALL branch binds the user at $1 and its ids as an int array; only owned ids come back. */
function answerOwnershipQuery(sql: string, params: unknown[]): Array<{ Check: number; Id: number }> {
  return sql.split('UNION ALL').flatMap((branch) => {
    const shape = /SELECT (\d+) AS "Check", "\w+" AS "Id"\s+FROM "Categories"[\s\S]*ANY\(\$(\d+)::int\[\]\)/;
    const match = shape.exec(branch);
    const [, check, paramNumber] = match ?? [];
    if (!check || !paramNumber) throw new Error(`Unexpected ownership branch: ${branch}`);
    const ids = params[Number(paramNumber) - 1] as number[];
    return ids.filter((id) => CATEGORY_OWNERS[id] === params[0]).map((id) => ({ Check: Number(check), Id: id }));
  });
}

const voucherRow = () => ({
  VoucherID: OWN_VOUCHER,
  CategoryID: OWN_CATEGORY,
  CategoryName: 'Saltos',
  CategoryIcon: null,
  CategoryColor: null,
  Description: 'Bono 10 saltos',
  TotalAmountCents: 20000,
  TotalUnits: '10',
  UnitLabel: 'saltos',
  PurchaseDate: '2026-09-01',
  ExpiryDate: null,
  ConsumedCents: '0',
  RemainingCents: '20000',
  ConsumedUnits: '0',
  ConsumptionCount: '0',
  CreatedAt: '2026-09-01T00:00:00Z',
  UpdatedAt: '2026-09-01T00:00:00Z',
});

function fakeRows(sql: string, params: unknown[]): unknown[] {
  executed.push({ sql, params });
  if (sql.includes('AS "Check"')) return answerOwnershipQuery(sql, params);
  if (sql.includes('INSERT INTO "Vouchers"')) return [{ VoucherID: OWN_VOUCHER }];
  if (sql.includes('FROM "vw_VoucherBalance" v')) return [voucherRow()];
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

import { PUT as VOUCHER_PUT } from '@/app/api/vouchers/[id]/route';
import { POST as VOUCHER_POST } from '@/app/api/vouchers/route';
import { getVoucherById, getVouchers } from '@/services/database/VoucherRepository';

function request(body: Record<string, unknown>): NextRequest {
  return { url: 'http://localhost:3000/api/vouchers', json: async () => body } as unknown as NextRequest;
}

function params(values: Record<string, string>) {
  return { params: Promise.resolve(values) };
}

const statements = (fragment: string) => executed.filter((s) => s.sql.includes(fragment));

const voucherBody = (overrides: Record<string, unknown> = {}) => ({
  categoryId: OWN_CATEGORY,
  description: 'Bono 10 saltos',
  totalAmount: 200,
  totalUnits: 10,
  unitLabel: 'saltos',
  purchaseDate: '2026-09-01',
  ...overrides,
});

beforeEach(() => {
  executed = [];
});

describe('POST /api/vouchers', () => {
  it("rejects another user's category as not found and writes nothing", async () => {
    const response = await VOUCHER_POST(request(voucherBody({ categoryId: FOREIGN_CATEGORY })), params({}));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: API_ERROR.NOT_FOUND.CATEGORY });
    expect(statements('INSERT INTO "Vouchers"')).toHaveLength(0);
  });

  it('answers a foreign category exactly like one that does not exist', async () => {
    const foreign = await VOUCHER_POST(request(voucherBody({ categoryId: FOREIGN_CATEGORY })), params({}));
    const missing = await VOUCHER_POST(request(voucherBody({ categoryId: MISSING_CATEGORY })), params({}));

    expect(missing.status).toBe(404);
    expect(foreign.status).toBe(missing.status);
    expect(await foreign.json()).toEqual(await missing.json());
  });

  it('still creates the voucher in an own category', async () => {
    const response = await VOUCHER_POST(request(voucherBody()), params({}));

    expect(response.status).toBe(201);
    expect(statements('INSERT INTO "Vouchers"')).toHaveLength(1);
  });
});

describe('PUT /api/vouchers/[id]', () => {
  it("rejects moving a voucher into another user's category and updates nothing", async () => {
    const response = await VOUCHER_PUT(request({ categoryId: FOREIGN_CATEGORY }), params({ id: String(OWN_VOUCHER) }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: API_ERROR.NOT_FOUND.CATEGORY });
    expect(statements('UPDATE "Vouchers"')).toHaveLength(0);
  });

  it('moves a voucher into an own category', async () => {
    const response = await VOUCHER_PUT(request({ categoryId: OWN_CATEGORY }), params({ id: String(OWN_VOUCHER) }));

    expect(response.status).toBe(200);
    expect(statements('UPDATE "Vouchers"')).toHaveLength(1);
  });

  it('sends no ownership query when the category is not being changed', async () => {
    const response = await VOUCHER_PUT(request({ description: 'Bono 12 saltos' }), params({ id: String(OWN_VOUCHER) }));

    expect(response.status).toBe(200);
    expect(statements('AS "Check"')).toHaveLength(0);
    expect(statements('UPDATE "Vouchers"')).toHaveLength(1);
  });
});

describe('voucher reads', () => {
  /** Every `JOIN "Categories" <alias> ON ...` clause of the voucher reads, with its join kind. */
  const categoryJoins = () => {
    const reads = statements('FROM "vw_VoucherBalance" v').map((s) => s.sql);
    return [...reads.join('\n').matchAll(/(\w+) JOIN "Categories" (\w+) ON ([^\n]+)/g)].map((match) => ({
      kind: match[1] ?? '',
      alias: match[2] ?? '',
      condition: match[3] ?? '',
    }));
  };

  it("join a category only within the voucher's owner, so a stray foreign id reveals nothing", async () => {
    await getVouchers();
    await getVoucherById(OWN_VOUCHER);

    const joins = categoryJoins();
    expect(joins).toHaveLength(2);
    joins.forEach(({ alias, condition }) => {
      expect(condition).toContain(`${alias}."UserID" = v."UserID"`);
    });
  });

  it('keep listing a voucher whose category is not the owner’s, without its name, icon or colour', async () => {
    await getVouchers();

    // A LEFT JOIN keeps a voucher written before the guard visible (and repairable with PUT);
    // an INNER JOIN would drop it from its owner's list.
    categoryJoins().forEach(({ kind }) => {
      expect(kind).toBe('LEFT');
    });
  });
});
