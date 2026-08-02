/**
 * Integration Tests: Skydiving voucher ("bono") consumption reconciliation
 * Verifies reconcileConsumptionToActivity (Option A, link-or-create):
 *  - tunnel consumption with no existing session -> action 'created'
 *  - consumption with an unlinked same-date session -> action 'linked'
 *  - already-linked consumption -> action 'already_linked' (idempotent)
 *  - non-skydive transaction -> throws
 */

import { API_ERROR, RECONCILE_ACTION, SKYDIVE_ACTIVITY_TYPE, SKYDIVE_CATEGORY } from '@/constants/finance';

// ---- Shape of the row returned by the initial consumption-transaction load ----
interface ConsumptionTxRow {
  TransactionID: number;
  VoucherID: number | null;
  VoucherUnits: number | string | null;
  AmountCents: number;
  Description: string | null;
  TransactionDate: Date | string;
  CategoryName: string;
  ParentCategoryName: string | null;
}

// Mutable per-test state, reset in beforeEach.
let txRowToReturn: ConsumptionTxRow | null = null;
// Rows returned by the "already linked activity?" lookup inside the transaction.
let alreadyLinkedRows: Array<{ SessionID?: number; JumpID?: number }> = [];
// Rows returned by the "existing unlinked activity on the same date?" lookup.
let existingUnlinkedRows: Array<{ SessionID?: number; JumpID?: number }> = [];
// Captured SQL statements run against the transactional client.
let executedStatements: string[] = [];

const CREATED_SESSION_ID = 200;
const CREATED_JUMP_ID = 300;

// A fake transactional client mirroring the pg/Neon client contract.
function createFakeClient() {
  return {
    query: jest.fn(async (sql: string) => {
      executedStatements.push(sql);

      // Idempotency check: is the tx already linked to an activity?
      if (
        (sql.includes('FROM "TunnelSessions"') || sql.includes('FROM "SkydiveJumps"')) &&
        sql.includes('WHERE "TransactionID" = $1')
      ) {
        return { rows: alreadyLinkedRows };
      }

      // Existing unlinked activity on the same date.
      if (
        (sql.includes('FROM "TunnelSessions"') || sql.includes('FROM "SkydiveJumps"')) &&
        (sql.includes('SessionDate') || sql.includes('JumpDate')) &&
        sql.includes('"TransactionID" IS NULL')
      ) {
        return { rows: existingUnlinkedRows };
      }

      // Next JumpNumber lookup for a freshly created jump.
      if (sql.includes('MAX("JumpNumber")')) {
        return { rows: [{ NextNumber: 43 }] };
      }

      // Create a new activity linked to the existing transaction.
      if (sql.includes('INSERT INTO "TunnelSessions"')) {
        return { rows: [{ SessionID: CREATED_SESSION_ID }] };
      }
      if (sql.includes('INSERT INTO "SkydiveJumps"')) {
        return { rows: [{ JumpID: CREATED_JUMP_ID }] };
      }

      // BEGIN / COMMIT / UPDATE and anything else.
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
  // The only top-level query() in reconcile loads the consumption transaction.
  query: jest.fn(async () => (txRowToReturn ? [txRowToReturn] : [])),
  getPool: jest.fn(() => ({ connect: jest.fn(async () => fakeClient) })),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { POST as RECONCILE_POST } from '@/app/api/skydiving/reconcile-voucher/route';
import { reconcileConsumptionToActivity } from '@/services/database/SkydiveRepository';
import { NotFoundError, ValidationError } from '@/utils/apiErrors';

const tunnelTx: ConsumptionTxRow = {
  TransactionID: 99,
  VoucherID: 51,
  VoucherUnits: 60,
  AmountCents: 12000,
  Description: 'Túnel – Madrid',
  TransactionDate: '2025-06-15',
  CategoryName: SKYDIVE_CATEGORY.SUBCATEGORY.TUNNEL,
  ParentCategoryName: SKYDIVE_CATEGORY.NAME,
};

beforeEach(() => {
  txRowToReturn = null;
  alreadyLinkedRows = [];
  existingUnlinkedRows = [];
  executedStatements = [];
  fakeClient = createFakeClient();
});

describe('reconcileConsumptionToActivity — create', () => {
  it('creates a new tunnel session when none exists for the consumption', async () => {
    txRowToReturn = tunnelTx;

    const result = await reconcileConsumptionToActivity(99);

    expect(result).toEqual({
      activityType: SKYDIVE_ACTIVITY_TYPE.TUNNEL,
      action: RECONCILE_ACTION.CREATED,
      id: CREATED_SESSION_ID,
    });
    // A session was inserted, and the voucher was NOT re-consumed (no new transaction).
    expect(executedStatements.some((s) => s.includes('INSERT INTO "TunnelSessions"'))).toBe(true);
    expect(executedStatements.some((s) => s.includes('INSERT INTO "Transactions"'))).toBe(false);
    expect(executedStatements).toContain('COMMIT');
  });
});

describe('reconcileConsumptionToActivity — link', () => {
  it('links an existing unlinked same-date session instead of creating one', async () => {
    txRowToReturn = tunnelTx;
    existingUnlinkedRows = [{ SessionID: 150 }];

    const result = await reconcileConsumptionToActivity(99);

    expect(result).toEqual({
      activityType: SKYDIVE_ACTIVITY_TYPE.TUNNEL,
      action: RECONCILE_ACTION.LINKED,
      id: 150,
    });
    // The existing session was updated; nothing new was inserted.
    expect(executedStatements.some((s) => s.includes('UPDATE "TunnelSessions"'))).toBe(true);
    expect(executedStatements.some((s) => s.includes('INSERT INTO "TunnelSessions"'))).toBe(false);
  });
});

describe('reconcileConsumptionToActivity — already linked', () => {
  it('is idempotent and returns already_linked without mutating', async () => {
    txRowToReturn = tunnelTx;
    alreadyLinkedRows = [{ SessionID: 77 }];

    const result = await reconcileConsumptionToActivity(99);

    expect(result).toEqual({
      activityType: SKYDIVE_ACTIVITY_TYPE.TUNNEL,
      action: RECONCILE_ACTION.ALREADY_LINKED,
      id: 77,
    });
    expect(executedStatements.some((s) => s.includes('INSERT INTO "TunnelSessions"'))).toBe(false);
    expect(executedStatements.some((s) => s.includes('UPDATE "TunnelSessions"'))).toBe(false);
  });
});

describe('reconcileConsumptionToActivity — validation', () => {
  it('throws when the transaction is not a skydiving consumption', async () => {
    txRowToReturn = {
      ...tunnelTx,
      CategoryName: 'Restaurantes',
      ParentCategoryName: 'Ocio',
    };

    await expect(reconcileConsumptionToActivity(99)).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError when the transaction does not exist', async () => {
    txRowToReturn = null;

    await expect(reconcileConsumptionToActivity(99)).rejects.toThrow(NotFoundError);
  });

  it('throws ValidationError when the transaction is not a voucher consumption', async () => {
    txRowToReturn = { ...tunnelTx, VoucherID: null };

    await expect(reconcileConsumptionToActivity(99)).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for a skydiving category that is not reconcilable', async () => {
    txRowToReturn = { ...tunnelTx, CategoryName: 'Material' };

    await expect(reconcileConsumptionToActivity(99)).rejects.toThrow(ValidationError);
  });
});

// The user's fault must never surface as a 500 — see POST /api/skydiving/reconcile-voucher
describe('POST /api/skydiving/reconcile-voucher — status codes', () => {
  async function callRoute(body: Record<string, unknown>): Promise<{ status: number; error?: string }> {
    const request = { json: async () => body };
    const response = await RECONCILE_POST(request as never);
    const payload = (await response.json()) as { error?: string };
    return { status: response.status, error: payload.error };
  }

  it('returns 404 when the transaction does not exist', async () => {
    txRowToReturn = null;

    const { status, error } = await callRoute({ transactionId: 99 });

    expect(status).toBe(404);
    expect(error).toBe(API_ERROR.NOT_FOUND.TRANSACTION);
  });

  it('returns 400 when the transaction is not a voucher consumption', async () => {
    txRowToReturn = { ...tunnelTx, VoucherID: null };

    const { status, error } = await callRoute({ transactionId: 99 });

    expect(status).toBe(400);
    expect(error).toBe(API_ERROR.SKYDIVE.NOT_VOUCHER_CONSUMPTION);
  });

  it('returns 400 when the transaction is not a skydiving consumption', async () => {
    txRowToReturn = { ...tunnelTx, CategoryName: 'Restaurantes', ParentCategoryName: 'Ocio' };

    const { status, error } = await callRoute({ transactionId: 99 });

    expect(status).toBe(400);
    expect(error).toBe(API_ERROR.SKYDIVE.NOT_SKYDIVE_CONSUMPTION);
  });

  it('returns 400 for a skydiving category that cannot be reconciled', async () => {
    txRowToReturn = { ...tunnelTx, CategoryName: 'Material' };

    const { status, error } = await callRoute({ transactionId: 99 });

    expect(status).toBe(400);
    expect(error).toBe(API_ERROR.SKYDIVE.CATEGORY_NOT_RECONCILABLE);
  });

  it('returns 200 with the reconcile result on success', async () => {
    txRowToReturn = tunnelTx;

    const request = { json: async () => ({ transactionId: 99 }) };
    const response = await RECONCILE_POST(request as never);
    const payload = (await response.json()) as {
      success: boolean;
      data: { action: string; id: number };
    };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.action).toBe(RECONCILE_ACTION.CREATED);
    expect(payload.data.id).toBe(CREATED_SESSION_ID);
  });
});
