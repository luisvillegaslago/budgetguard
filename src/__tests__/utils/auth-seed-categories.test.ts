/**
 * Unit test: the category tree a new account gets on its first sign-in.
 *
 * "Categories"."UserID" is NOT NULL and, since migration 008, the parent key
 * includes it. The seed used to insert subcategories without an owner and set
 * it afterwards with a global UPDATE: the INSERT was refused, so every new
 * account ended up with its parents and no subcategories (AUTH-01), and the
 * UPDATE would have handed any ownerless row to whoever signed up next.
 * Each subcategory must now be written with the new user's id, and nothing
 * may update rows outside that user.
 */

import type { Account, User } from 'next-auth';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/providers/google', () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: 'google', name: 'Google', type: 'oauth' })),
}));

interface Statement {
  sql: string;
  params: unknown[];
}

const statements: Statement[] = [];
let nextCategoryId = 100;

jest.mock('@/services/database/connection', () => ({
  query: jest.fn(async (sql: string, params: unknown[] = []) => {
    statements.push({ sql, params });
    if (sql.includes('COUNT(*)')) return [{ count: '0' }];
    if (sql.includes('RETURNING "CategoryID", "Name"')) {
      const names = Array.from(sql.matchAll(/\('([^']+)', '(?:income|expense)'/g), (m) => m[1]);
      return names.map((name) => ({ CategoryID: nextCategoryId++, Name: name }));
    }
    return [];
  }),
}));

import { authOptions } from '@/libs/auth';

const NEW_USER_ID = 42;

async function signUp(): Promise<void> {
  const user = { id: String(NEW_USER_ID), email: 'new@example.com' } as User;
  await authOptions.events?.createUser?.({ user } as { user: User; account?: Account });
}

describe('createUser — seeding the category tree', () => {
  beforeEach(() => {
    statements.length = 0;
  });

  it('writes every subcategory with the new user as owner', async () => {
    await signUp();

    const subcategoryInserts = statements.filter(
      (s) => s.sql.includes('INSERT INTO "Categories"') && s.sql.includes('"ParentCategoryID"'),
    );
    expect(subcategoryInserts.length).toBeGreaterThan(0);
    subcategoryInserts.forEach(({ sql, params }) => {
      expect(sql).toContain('"UserID")');
      const columns = 8;
      const owners = params.filter((_, i) => i % columns === columns - 1);
      expect(owners.length * columns).toBe(params.length);
      expect(new Set(owners)).toEqual(new Set([NEW_USER_ID]));
    });
  });

  it('never assigns ownerless rows to the new user', async () => {
    await signUp();

    expect(statements.some((s) => s.sql.includes('WHERE "UserID" IS NULL') && s.sql.startsWith('UPDATE'))).toBe(false);
  });
});
