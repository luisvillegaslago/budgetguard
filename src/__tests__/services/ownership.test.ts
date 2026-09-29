/**
 * Unit Tests: assertOwnedReferences
 *
 * The shared guard every write path uses before storing an id that came from a request. The route
 * flows are covered in foreign-reference-ownership.test.ts; this file pins the contract other
 * repositories rely on: one round trip, null means "nothing to check", a foreign id and a missing
 * one fail the same way, the 404 names the table that failed, and a passed client is used instead
 * of the pool. The SQL itself was run against the local database (read-only) while writing it.
 */

import { API_ERROR } from '@/constants/finance';

const CALLER = 2;
const OTHER_USER = 1;

// Owner of every row, per table. Ids absent here do not exist.
const OWNERS: Record<string, Record<number, number>> = {
  Categories: { 5: OTHER_USER, 15: CALLER, 16: CALLER },
  Companies: { 8: OTHER_USER, 18: CALLER },
  Vouchers: { 1: OTHER_USER, 11: CALLER },
  TransactionGroups: { 4: OTHER_USER, 40: CALLER },
  Transactions: { 3: OTHER_USER, 100: CALLER },
  Trips: { 3: OTHER_USER, 12: CALLER },
};

interface ExecutedStatement {
  sql: string;
  params: unknown[];
}

let poolStatements: ExecutedStatement[] = [];

/** Answers each UNION ALL branch with the ids its table holds for the user bound as $1. */
function answer(sql: string, params: unknown[]): Array<{ Check: number; Id: number }> {
  return sql.split('UNION ALL').flatMap((branch) => {
    const shape = /SELECT (\d+) AS "Check", "\w+" AS "Id"\s+FROM "(\w+)"[\s\S]*ANY\(\$(\d+)::int\[\]\)/.exec(branch);
    const [, check, table, paramNumber] = shape ?? [];
    if (!check || !table || !paramNumber) throw new Error(`Unexpected ownership branch: ${branch}`);
    const ids = params[Number(paramNumber) - 1] as number[];
    const owners = OWNERS[table] ?? {};
    return ids.filter((id) => owners[id] === params[0]).map((id) => ({ Check: Number(check), Id: id }));
  });
}

jest.mock('@/services/database/connection', () => ({
  query: jest.fn(async (sql: string, params?: unknown[]) => {
    poolStatements.push({ sql, params: params ?? [] });
    return answer(sql, params ?? []);
  }),
}));

import { assertOwnedReferences, type OwnedReferences, type OwnershipQueryClient } from '@/services/database/ownership';
import { NotFoundError } from '@/utils/apiErrors';

/** One foreign id per table, and the key its 404 must carry. */
const FOREIGN_REFERENCES: Array<[keyof OwnedReferences, OwnedReferences, string]> = [
  ['categoryId', { categoryId: 5 }, API_ERROR.NOT_FOUND.CATEGORY],
  ['companyId', { companyId: 8 }, API_ERROR.NOT_FOUND.COMPANY],
  ['voucherId', { voucherId: 1 }, API_ERROR.NOT_FOUND.VOUCHER],
  ['transactionGroupId', { transactionGroupId: 4 }, API_ERROR.NOT_FOUND.GROUP],
  ['transactionId', { transactionId: 3 }, API_ERROR.NOT_FOUND.TRANSACTION],
  ['tripId', { tripId: 3 }, API_ERROR.NOT_FOUND.TRIP],
];

/** The error the guard threw, or undefined when it passed. */
function outcomeOf(promise: Promise<void>): Promise<unknown> {
  return promise.catch((error: unknown) => error);
}

beforeEach(() => {
  poolStatements = [];
});

describe('assertOwnedReferences', () => {
  it('sends no query when nothing is referenced', async () => {
    await assertOwnedReferences(CALLER, { categoryId: undefined, companyId: null, voucherId: [] });

    expect(poolStatements).toHaveLength(0);
  });

  it('passes when every id is the caller’s own, checking all tables in one round trip', async () => {
    await assertOwnedReferences(CALLER, {
      categoryId: [15, 16, 15],
      companyId: 18,
      voucherId: 11,
      transactionGroupId: 40,
      transactionId: 100,
      tripId: 12,
    });

    expect(poolStatements).toHaveLength(1);
    // The caller first, then one de-duplicated id list per table.
    expect(poolStatements[0]?.params).toEqual([CALLER, [15, 16], [18], [11], [40], [100], [12]]);
  });

  it.each(
    FOREIGN_REFERENCES,
  )("refuses another user's %s with that resource's not-found key", async (_reference, references, errorKey) => {
    const outcome = await outcomeOf(assertOwnedReferences(CALLER, references));

    expect(outcome).toBeInstanceOf(NotFoundError);
    expect(outcome).toMatchObject({ errorKey });
  });

  it('fails a missing id exactly like a foreign one', async () => {
    const foreign = await outcomeOf(assertOwnedReferences(CALLER, { categoryId: 5 }));
    const missing = await outcomeOf(assertOwnedReferences(CALLER, { categoryId: 999 }));

    expect(missing).toBeInstanceOf(NotFoundError);
    expect(missing).toMatchObject({ errorKey: (foreign as NotFoundError).errorKey });
  });

  it('refuses a list as soon as one of its ids is not owned', async () => {
    const outcome = await outcomeOf(assertOwnedReferences(CALLER, { categoryId: [15, 5, 16] }));

    expect(outcome).toMatchObject({ errorKey: API_ERROR.NOT_FOUND.CATEGORY });
  });

  it('names the category before the company when both fail', async () => {
    const outcome = await outcomeOf(assertOwnedReferences(CALLER, { companyId: 8, categoryId: 5 }));

    expect(outcome).toMatchObject({ errorKey: API_ERROR.NOT_FOUND.CATEGORY });
  });

  it('runs on the client it is given, not on the pool', async () => {
    const query = jest.fn(async (sql: string, params?: unknown[]) => ({ rows: answer(sql, params ?? []) }));
    const client: OwnershipQueryClient = {
      query: <T>(sql: string, params?: unknown[]) => query(sql, params) as Promise<{ rows: T[] }>,
    };

    const outcome = await outcomeOf(assertOwnedReferences(CALLER, { categoryId: 5 }, client));

    expect(query).toHaveBeenCalledTimes(1);
    expect(poolStatements).toHaveLength(0);
    expect(outcome).toMatchObject({ errorKey: API_ERROR.NOT_FOUND.CATEGORY });
  });

  it('fails closed when the database returns nothing', async () => {
    const silentClient = { query: jest.fn(async () => ({ rows: [] })) };

    const outcome = await outcomeOf(assertOwnedReferences(CALLER, { categoryId: 15 }, silentClient));

    expect(outcome).toBeInstanceOf(NotFoundError);
  });
});
