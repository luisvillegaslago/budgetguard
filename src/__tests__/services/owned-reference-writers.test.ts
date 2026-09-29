/**
 * Unit tests: writers of owner-scoped references refuse another user's id
 * before writing, with the resource's not-found key.
 *
 * Since migration 008 the database refuses such a row too, but with a
 * constraint violation that reaches the client as a 500 and tells a probing
 * account the id exists. These writers take the id straight from a request:
 * a category's parent, an invoice prefix's company, a deferral's fiscal
 * document. Every id is foreign here, so each call must stop at the guard.
 */

import { API_ERROR } from '@/constants/finance';

const statements: string[] = [];
const mockConnect = jest.fn();

jest.mock('@/services/database/connection', () => ({
  // The guard's query finds nothing for this user; nothing else should run.
  query: jest.fn(async (sql: string) => {
    statements.push(sql);
    return [];
  }),
  getPool: () => ({ connect: mockConnect }),
}));

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 2),
  AuthError: class AuthError extends Error {},
}));

jest.mock('@vercel/blob', () => ({ del: jest.fn() }));

import { createCategory } from '@/services/database/CategoryRepository';
import { createDeferralWithMovements, updateDeferral } from '@/services/database/DeferralRepository';
import { createInvoicePrefix, updateInvoicePrefix } from '@/services/database/InvoiceRepository';

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

function wrote(): boolean {
  return statements.some((sql) => /^\s*(INSERT|UPDATE)/i.test(sql));
}

beforeEach(() => {
  statements.length = 0;
  mockConnect.mockReset();
});

describe('writers of owner-scoped references', () => {
  it("a category under another user's parent", async () => {
    const error = await errorOf(createCategory({ name: 'Sub', type: 'expense', parentCategoryId: 4 }));

    expect(error).toMatchObject({ errorKey: API_ERROR.NOT_FOUND.CATEGORY });
    expect(wrote()).toBe(false);
  });

  it("an invoice prefix for another user's company, on create and on edit", async () => {
    const created = await errorOf(createInvoicePrefix({ prefix: 'X', companyId: 8 }));
    const edited = await errorOf(updateInvoicePrefix(1, { companyId: 8 }));

    expect(created).toMatchObject({ errorKey: API_ERROR.NOT_FOUND.COMPANY });
    expect(edited).toMatchObject({ errorKey: API_ERROR.NOT_FOUND.COMPANY });
    expect(wrote()).toBe(false);
  });

  it("a deferral pointing at another user's fiscal document, on create and on edit", async () => {
    const input = { fiscalDocumentId: 77 } as Parameters<typeof createDeferralWithMovements>[0];
    const created = await errorOf(createDeferralWithMovements(input, []));
    const edited = await errorOf(updateDeferral(1, { fiscalDocumentId: 77 }));

    expect(created).toMatchObject({ errorKey: API_ERROR.NOT_FOUND.DOCUMENT });
    expect(edited).toMatchObject({ errorKey: API_ERROR.NOT_FOUND.DOCUMENT });
    expect(mockConnect).not.toHaveBeenCalled();
    expect(wrote()).toBe(false);
  });
});
