/**
 * Integration Tests: OCR auto-matching of a fiscal document against movements
 *
 * `findMatchingTransaction()` and `findMatchingTransactionGroup()` run unprompted from
 * POST /api/fiscal/documents/[id]/extract, and both of them *write*: the first links the document
 * and marks it `filed`, the second rewrites `Transactions."TransactionGroupID"`. A heuristic that
 * writes has to be wrong in the safe direction, and these tests pin the three ways it was not:
 *
 *  1. A cancelled movement is excluded from every summary view and from the fiscal views, so a
 *     document linked to one reads as settled against a row no modelo counts. `pending` stays
 *     eligible on purpose — a received invoice legitimately matches an unpaid expense.
 *  2. The sign has to be the one the document implies: a factura recibida is an expense, a
 *     factura emitida is income.
 *  3. A group is only ever formed out of movements that add up to the *whole* invoice and that
 *     belong to nobody. Half-invoice totals and movements already inside a user-made group are
 *     refused, because a stolen row silently shrinks whatever else pointed at that group.
 *
 * Postgres is faked over a fixture table, so each predicate is exercised as behaviour rather than
 * as a string match against the SQL.
 */

import { FISCAL_DOCUMENT_TRANSACTION_TYPE, FISCAL_DOCUMENT_TYPE, TRANSACTION_STATUS } from '@/constants/finance';
import type { TransactionStatus, TransactionType } from '@/types/finance';

// ── Fake Postgres ──

interface TransactionFixture {
  TransactionID: number;
  UserID: number;
  CompanyID: number | null;
  Type: TransactionType;
  Status: TransactionStatus;
  TransactionDate: string;
  AmountCents: number;
  OriginalAmountCents: number | null;
  SharedDivisor: number;
  TransactionGroupID: number | null;
}

const MS_PER_DAY = 86_400_000;

/** Both dates are plain `YYYY-MM-DD`, which is what a DATE column and the OCR both produce. */
function daysApart(left: string, right: string): number {
  return Math.abs(Date.parse(left) - Date.parse(right)) / MS_PER_DAY;
}

let table: TransactionFixture[] = [];
let nextGroupId = 900;

const executed: Array<{ sql: string; params: unknown[] }> = [];

const mockQuery = jest.fn(async (sql: string, params: unknown[]): Promise<unknown[]> => {
  executed.push({ sql, params });

  if (sql.includes('SELECT "TransactionID" FROM "Transactions"')) {
    const [amountCents, date, userId, halfAmountCents, sharedDivisor, type, excludedStatus] = params as [
      number,
      string,
      number,
      number,
      number,
      TransactionType,
      TransactionStatus,
    ];
    return table
      .filter((r) => r.UserID === userId)
      .filter(
        (r) =>
          r.AmountCents === amountCents || (r.AmountCents === halfAmountCents && r.SharedDivisor === sharedDivisor),
      )
      .filter((r) => daysApart(r.TransactionDate, date) <= 7)
      .filter((r) => r.Type === type)
      .filter((r) => r.Status !== excludedStatus)
      .sort((a, b) => daysApart(a.TransactionDate, date) - daysApart(b.TransactionDate, date))
      .slice(0, 1)
      .map((r) => ({ TransactionID: r.TransactionID }));
  }

  if (sql.includes('"OriginalAmountCents", "SharedDivisor"')) {
    const [companyId, date, userId] = params as [number, string, number];
    return table
      .filter((r) => r.CompanyID === companyId && r.UserID === userId)
      .filter((r) => daysApart(r.TransactionDate, date) <= 3)
      .sort((a, b) => a.TransactionDate.localeCompare(b.TransactionDate))
      .map((r) => ({
        TransactionID: r.TransactionID,
        AmountCents: r.AmountCents,
        OriginalAmountCents: r.OriginalAmountCents,
        SharedDivisor: r.SharedDivisor,
        TransactionGroupID: r.TransactionGroupID,
      }));
  }

  if (sql.includes('INSERT INTO "TransactionGroups"')) {
    nextGroupId += 1;
    return [{ TransactionGroupID: nextGroupId }];
  }

  if (sql.includes('UPDATE "Transactions" SET "TransactionGroupID"')) {
    const [groupId, transactionIds] = params as [number, number[]];
    table.forEach((r) => {
      if (transactionIds.includes(r.TransactionID)) r.TransactionGroupID = groupId;
    });
    return [];
  }

  return [];
});

jest.mock('@/services/database/connection', () => ({
  query: (...args: [string, unknown[]]) => mockQuery(...args),
}));

const USER_ID = 2;

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => USER_ID),
}));

import { findMatchingTransaction, findMatchingTransactionGroup } from '@/services/database/FiscalDocumentRepository';

// ── Fixtures ──

const COMPANY_ID = 11;
const INVOICE_DATE = '2026-03-10';
/** 120,00 € — the total the OCR read off the received invoice. */
const INVOICE_CENTS = 12_000;

const EXPENSE_TYPE = FISCAL_DOCUMENT_TRANSACTION_TYPE[FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA];
const INCOME_TYPE = FISCAL_DOCUMENT_TRANSACTION_TYPE[FISCAL_DOCUMENT_TYPE.FACTURA_EMITIDA];

function movement(overrides: Partial<TransactionFixture> & { TransactionID: number }): TransactionFixture {
  return {
    UserID: USER_ID,
    CompanyID: COMPANY_ID,
    Type: EXPENSE_TYPE,
    Status: TRANSACTION_STATUS.PAID,
    TransactionDate: INVOICE_DATE,
    AmountCents: INVOICE_CENTS,
    OriginalAmountCents: null,
    SharedDivisor: 1,
    TransactionGroupID: null,
    ...overrides,
  };
}

const groupWrites = () =>
  executed.filter(
    ({ sql }) => sql.includes('INSERT INTO "TransactionGroups"') || sql.includes('UPDATE "Transactions"'),
  );

// ── Tests ──

describe('findMatchingTransaction', () => {
  beforeEach(() => {
    mockQuery.mockClear();
    executed.length = 0;
    table = [];
  });

  it('skips a cancelled movement of the exact amount and takes the live one further away', async () => {
    table = [
      movement({ TransactionID: 1, Status: TRANSACTION_STATUS.CANCELLED }),
      movement({ TransactionID: 2, TransactionDate: '2026-03-14' }),
    ];

    // The cancelled row is the closest by date, so without the filter it would win.
    expect(await findMatchingTransaction(INVOICE_CENTS, INVOICE_DATE, EXPENSE_TYPE)).toBe(2);
  });

  it('returns null rather than linking the document to a cancelled movement', async () => {
    table = [movement({ TransactionID: 1, Status: TRANSACTION_STATUS.CANCELLED })];

    expect(await findMatchingTransaction(INVOICE_CENTS, INVOICE_DATE, EXPENSE_TYPE)).toBeNull();
  });

  it('still matches a pending expense: a received invoice does not have to be paid yet', async () => {
    table = [movement({ TransactionID: 3, Status: TRANSACTION_STATUS.PENDING })];

    expect(await findMatchingTransaction(INVOICE_CENTS, INVOICE_DATE, EXPENSE_TYPE)).toBe(3);
  });

  it('never matches an income movement to a factura recibida', async () => {
    table = [movement({ TransactionID: 4, Type: INCOME_TYPE })];

    expect(await findMatchingTransaction(INVOICE_CENTS, INVOICE_DATE, EXPENSE_TYPE)).toBeNull();
  });

  it('never matches an expense movement to a factura emitida', async () => {
    table = [movement({ TransactionID: 5 })];

    expect(await findMatchingTransaction(INVOICE_CENTS, INVOICE_DATE, INCOME_TYPE)).toBeNull();
  });

  it('keeps matching a shared expense on half the invoice', async () => {
    table = [movement({ TransactionID: 6, AmountCents: INVOICE_CENTS / 2, SharedDivisor: 2 })];

    expect(await findMatchingTransaction(INVOICE_CENTS, INVOICE_DATE, EXPENSE_TYPE)).toBe(6);
  });
});

describe('findMatchingTransactionGroup', () => {
  beforeEach(() => {
    mockQuery.mockClear();
    executed.length = 0;
    table = [];
    nextGroupId = 900;
  });

  it('groups movements that add up to the whole invoice', async () => {
    table = [
      movement({ TransactionID: 10, AmountCents: 7_000 }),
      movement({ TransactionID: 11, AmountCents: 5_000, TransactionDate: '2026-03-11' }),
    ];

    const groupId = await findMatchingTransactionGroup(INVOICE_CENTS, INVOICE_DATE, COMPANY_ID);

    expect(groupId).toBe(901);
    expect(table.map((r) => r.TransactionGroupID)).toEqual([901, 901]);
  });

  it('refuses a set of movements whose real total is half the invoice', async () => {
    // 35,00 € + 25,00 € = 60,00 €, against a 120,00 € invoice. The ÷2 branch used to accept this:
    // "OriginalAmountCents" already holds the un-halved figure, so halving again matched a set
    // worth half the document.
    table = [
      movement({ TransactionID: 12, AmountCents: 3_500 }),
      movement({ TransactionID: 13, AmountCents: 2_500, TransactionDate: '2026-03-11' }),
    ];

    expect(await findMatchingTransactionGroup(INVOICE_CENTS, INVOICE_DATE, COMPANY_ID)).toBeNull();
    expect(groupWrites()).toHaveLength(0);
  });

  it('compares shared movements un-halved, including a legacy row with no OriginalAmountCents', async () => {
    // 70,00 € booked whole + a shared 50,00 € stored as 25,00 € with SharedDivisor 2 and a NULL
    // "OriginalAmountCents" (the schema allows it). Together they are the 120,00 € invoice.
    table = [
      movement({ TransactionID: 14, AmountCents: 7_000 }),
      movement({
        TransactionID: 15,
        AmountCents: 2_500,
        SharedDivisor: 2,
        OriginalAmountCents: null,
        TransactionDate: '2026-03-11',
      }),
    ];

    expect(await findMatchingTransactionGroup(INVOICE_CENTS, INVOICE_DATE, COMPANY_ID)).toBe(901);
  });

  it('reuses the group the movements already share', async () => {
    table = [
      movement({ TransactionID: 16, AmountCents: 7_000, TransactionGroupID: 5 }),
      movement({ TransactionID: 17, AmountCents: 5_000, TransactionGroupID: 5, TransactionDate: '2026-03-11' }),
    ];

    expect(await findMatchingTransactionGroup(INVOICE_CENTS, INVOICE_DATE, COMPANY_ID)).toBe(5);
    expect(groupWrites()).toHaveLength(0);
  });

  it('never steals a movement out of a group the user made by hand', async () => {
    // Movement 18 belongs to the user's group 5, which another fiscal document may point at.
    // Re-grouping it would silently shrink the amount that document shows.
    table = [
      movement({ TransactionID: 18, AmountCents: 7_000, TransactionGroupID: 5 }),
      movement({ TransactionID: 19, AmountCents: 5_000, TransactionDate: '2026-03-11' }),
    ];

    expect(await findMatchingTransactionGroup(INVOICE_CENTS, INVOICE_DATE, COMPANY_ID)).toBeNull();
    expect(groupWrites()).toHaveLength(0);
    expect(table.find((r) => r.TransactionID === 18)?.TransactionGroupID).toBe(5);
    expect(table.find((r) => r.TransactionID === 19)?.TransactionGroupID).toBeNull();
  });
});
