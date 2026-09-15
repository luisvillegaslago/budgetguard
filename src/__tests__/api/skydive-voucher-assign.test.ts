/**
 * Integration Tests: bulk voucher ("bono") assignment for jumps and tunnel sessions
 * Verifies assignJumpsToVoucher / assignTunnelSessionsToVoucher and their routes:
 *  - jumps without a transaction get one linked to the voucher, prorated per unit
 *  - a session already carrying a cash expense has it converted, never duplicated
 *  - monetary vouchers keep the activity price and consume no units
 *  - missing activity / voucher -> 404, wrong voucher subcategory -> 400
 *  - any failure rolls the whole batch back
 */

import { API_ERROR, SKYDIVE_CATEGORY } from '@/constants/finance';
import type { Voucher } from '@/types/finance';

interface ExecutedStatement {
  sql: string;
  params: unknown[];
}

// ---- Mutable per-test state, reset in beforeEach ----
let activityRows: Record<string, unknown>[] = [];
let voucherToReturn: Voucher | null = null;
let executed: ExecutedStatement[] = [];
let failOnSql: string | null = null;
let nextTransactionId = 900;

const jumpVoucher: Voucher = {
  voucherId: 50,
  categoryId: 30,
  categoryName: SKYDIVE_CATEGORY.SUBCATEGORY.JUMPS,
  categoryIcon: null,
  categoryColor: null,
  description: 'Bono 10 saltos',
  totalAmountCents: 20000, // 20,00 € per jump
  totalUnits: 10,
  unitLabel: 'saltos',
  purchaseDate: '2026-01-01',
  expiryDate: null,
  consumedCents: 0,
  remainingCents: 20000,
  consumedUnits: 0,
  consumptionCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const tunnelVoucher: Voucher = {
  ...jumpVoucher,
  voucherId: 51,
  categoryId: 31,
  categoryName: SKYDIVE_CATEGORY.SUBCATEGORY.TUNNEL,
  description: 'Bono 120 minutos',
  totalAmountCents: 24000, // 2,00 € per minute
  totalUnits: 120,
  unitLabel: 'minutos',
  remainingCents: 24000,
};

const monetaryTunnelVoucher: Voucher = {
  ...tunnelVoucher,
  voucherId: 52,
  description: 'Bono monedero túnel',
  totalAmountCents: 100000,
  totalUnits: null,
  unitLabel: null,
  remainingCents: 100000,
};

function createFakeClient() {
  return {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      executed.push({ sql, params: params ?? [] });
      if (failOnSql && sql.includes(failOnSql)) throw new Error('boom');
      if (sql.includes('INSERT INTO "Transactions"')) {
        nextTransactionId += 1;
        return { rows: [{ TransactionID: nextTransactionId }] };
      }
      return { rows: [] };
    }),
    release: jest.fn(),
  };
}

let fakeClient = createFakeClient();

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 1),
  AuthError: class AuthError extends Error {},
}));

jest.mock('@/services/database/connection', () => ({
  // The only top-level query() in the assignment loads the selected activities.
  query: jest.fn(async () => activityRows),
  getPool: jest.fn(() => ({ connect: jest.fn(async () => fakeClient) })),
}));

jest.mock('@/services/database/VoucherRepository', () => ({
  getVoucherById: jest.fn(async () => voucherToReturn),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { POST as ASSIGN_JUMPS_POST } from '@/app/api/skydiving/jumps/assign-voucher/route';
import { POST as ASSIGN_TUNNEL_POST } from '@/app/api/skydiving/tunnel/assign-voucher/route';
import { assignJumpsToVoucher, assignTunnelSessionsToVoucher } from '@/services/database/SkydiveRepository';
import { NotFoundError, ValidationError } from '@/utils/apiErrors';

// Transactions INSERT params:
// [CategoryID, AmountCents, Description, TransactionDate, Type, SharedDivisor, Status, VoucherID, VoucherUnits, UserID]
// Transactions UPDATE params:
// [CategoryID, AmountCents, Description, TransactionDate, VoucherID, VoucherUnits, TransactionID, UserID]

const statements = (fragment: string) => executed.filter((s) => s.sql.includes(fragment));
const sqlLog = () => executed.map((s) => s.sql);

const jumpRow = (id: number, overrides: Record<string, unknown> = {}) => ({
  JumpID: id,
  TransactionID: null,
  PriceCents: null,
  Dropzone: 'Empuriabrava',
  JumpDate: new Date(2026, 8, 10),
  ...overrides,
});

const sessionRow = (id: number, overrides: Record<string, unknown> = {}) => ({
  SessionID: id,
  TransactionID: null,
  PriceCents: null,
  Location: 'Madrid Fly',
  SessionDate: new Date(2026, 8, 12),
  DurationSec: 1800,
  ...overrides,
});

beforeEach(() => {
  activityRows = [];
  voucherToReturn = null;
  executed = [];
  failOnSql = null;
  nextTransactionId = 900;
  fakeClient = createFakeClient();
});

describe('assignJumpsToVoucher — unit voucher', () => {
  it('creates one prorated voucher consumption per jump and links it', async () => {
    activityRows = [jumpRow(1), jumpRow(2)];
    voucherToReturn = jumpVoucher;

    const result = await assignJumpsToVoucher([1, 2], 50);

    expect(result).toEqual({ assigned: 2 });

    const inserts = statements('INSERT INTO "Transactions"');
    expect(inserts).toHaveLength(2);
    inserts.forEach((insert) => {
      expect(insert.params[0]).toBe(30); // voucher's category
      expect(insert.params[1]).toBe(2000); // 20000 / 10 * 1
      expect(insert.params[2]).toBe('Salto – Empuriabrava');
      expect(insert.params[3]).toBe('2026-09-10');
      expect(insert.params[7]).toBe(50);
      expect(insert.params[8]).toBe(1);
    });

    const links = statements('UPDATE "SkydiveJumps"');
    expect(links.map((link) => link.params)).toEqual([
      [2000, 901, 1, 1],
      [2000, 902, 2, 1],
    ]);

    expect(sqlLog()[0]).toBe('BEGIN');
    expect(sqlLog()).toContain('COMMIT');
    expect(fakeClient.release).toHaveBeenCalled();
  });

  it('tolerates duplicated ids in the request', async () => {
    activityRows = [jumpRow(1)];
    voucherToReturn = jumpVoucher;

    await expect(assignJumpsToVoucher([1, 1], 50)).resolves.toEqual({ assigned: 1 });
  });
});

describe('assignTunnelSessionsToVoucher', () => {
  it('converts an existing cash expense instead of creating a second one', async () => {
    activityRows = [sessionRow(7, { TransactionID: 77, PriceCents: 4500 })];
    voucherToReturn = tunnelVoucher;

    await assignTunnelSessionsToVoucher([7], 51);

    expect(statements('INSERT INTO "Transactions"')).toHaveLength(0);

    const [update] = statements('UPDATE "Transactions"');
    expect(update?.params).toEqual([31, 6000, 'Túnel – Madrid Fly', '2026-09-12', 51, 30, 77, 1]);

    const [link] = statements('UPDATE "TunnelSessions"');
    expect(link?.params).toEqual([6000, 77, 7, 1]);
  });

  it('keeps the session price and consumes no units with a monetary voucher', async () => {
    activityRows = [sessionRow(8, { PriceCents: 4500 })];
    voucherToReturn = monetaryTunnelVoucher;

    await assignTunnelSessionsToVoucher([8], 52);

    const [insert] = statements('INSERT INTO "Transactions"');
    expect(insert?.params[1]).toBe(4500);
    expect(insert?.params[7]).toBe(52);
    expect(insert?.params[8]).toBeNull();
  });
});

describe('bulk voucher assignment — validation and atomicity', () => {
  it('throws NotFoundError when a selected jump does not belong to the user', async () => {
    activityRows = [jumpRow(1)];
    voucherToReturn = jumpVoucher;

    await expect(assignJumpsToVoucher([1, 2], 50)).rejects.toThrow(NotFoundError);
    expect(executed).toHaveLength(0);
  });

  it('throws NotFoundError when the voucher does not exist', async () => {
    activityRows = [jumpRow(1)];
    voucherToReturn = null;

    await expect(assignJumpsToVoucher([1], 50)).rejects.toThrow(NotFoundError);
  });

  it('throws ValidationError when the voucher belongs to another subcategory', async () => {
    activityRows = [jumpRow(1)];
    voucherToReturn = tunnelVoucher;

    await expect(assignJumpsToVoucher([1], 51)).rejects.toThrow(ValidationError);
    expect(executed).toHaveLength(0);
  });

  it('rolls back every change when one statement fails', async () => {
    activityRows = [jumpRow(1), jumpRow(2)];
    voucherToReturn = jumpVoucher;
    failOnSql = 'UPDATE "SkydiveJumps"';

    await expect(assignJumpsToVoucher([1, 2], 50)).rejects.toThrow('boom');
    expect(sqlLog()).toContain('ROLLBACK');
    expect(sqlLog()).not.toContain('COMMIT');
    expect(fakeClient.release).toHaveBeenCalled();
  });
});

// The user's fault must never surface as a 500.
describe('POST /api/skydiving/{jumps,tunnel}/assign-voucher — status codes', () => {
  async function callRoute(
    handler: typeof ASSIGN_JUMPS_POST,
    body: Record<string, unknown>,
  ): Promise<{ status: number; payload: { success?: boolean; error?: string; data?: unknown } }> {
    const request = { json: async () => body };
    const response = await handler(request as never, { params: Promise.resolve({}) } as never);
    return { status: response.status, payload: await response.json() };
  }

  it('returns 400 for an empty selection', async () => {
    const { status } = await callRoute(ASSIGN_JUMPS_POST, { ids: [], voucherId: 50 });

    expect(status).toBe(400);
  });

  it('returns 404 when a jump is missing', async () => {
    activityRows = [];
    voucherToReturn = jumpVoucher;

    const { status, payload } = await callRoute(ASSIGN_JUMPS_POST, { ids: [1], voucherId: 50 });

    expect(status).toBe(404);
    expect(payload.error).toBe(API_ERROR.NOT_FOUND.JUMP);
  });

  it('returns 404 when a tunnel session is missing', async () => {
    activityRows = [];
    voucherToReturn = tunnelVoucher;

    const { status, payload } = await callRoute(ASSIGN_TUNNEL_POST, { ids: [7], voucherId: 51 });

    expect(status).toBe(404);
    expect(payload.error).toBe(API_ERROR.NOT_FOUND.TUNNEL_SESSION);
  });

  it('returns 400 when the voucher is for a different activity', async () => {
    activityRows = [sessionRow(7)];
    voucherToReturn = jumpVoucher;

    const { status, payload } = await callRoute(ASSIGN_TUNNEL_POST, { ids: [7], voucherId: 50 });

    expect(status).toBe(400);
    expect(payload.error).toBe(API_ERROR.SKYDIVE.VOUCHER_CATEGORY_MISMATCH);
  });

  it('returns 200 with the number of assigned activities', async () => {
    activityRows = [jumpRow(1), jumpRow(2), jumpRow(3)];
    voucherToReturn = jumpVoucher;

    const { status, payload } = await callRoute(ASSIGN_JUMPS_POST, { ids: [1, 2, 3], voucherId: 50 });

    expect(status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data).toEqual({ assigned: 3 });
  });
});
