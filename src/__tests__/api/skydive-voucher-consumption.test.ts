/**
 * Integration Tests: Skydiving voucher ("bono") consumption
 * Verifies that creating a jump/tunnel session paid from a voucher prorates the
 * amount correctly and wires the linked expense transaction (VoucherID,
 * VoucherUnits, AmountCents, CategoryID) atomically, and that a session created
 * from an existing consumption adopts it instead of consuming the voucher again.
 */

import type { Voucher } from '@/types/finance';

// ---- Captured transaction INSERT/UPDATE params ----
let capturedTxParams: unknown[] | null = null;
let capturedTxUpdateParams: unknown[] | null = null;
let voucherToReturn: Voucher | null = null;
// The consumption the adoption guard locks (or none), and whether an activity already links it.
interface AdoptableRow {
  VoucherID: number | null;
  VoucherUnits: string | null;
  CategoryName: string;
  ParentCategoryName: string | null;
}
let adoptableRow: AdoptableRow | null = null;
let consumptionIsLinked = false;

const tunnelConsumption = (overrides: Partial<AdoptableRow> = {}): AdoptableRow => ({
  VoucherID: 51,
  VoucherUnits: '15.00',
  CategoryName: 'Túnel de viento',
  ParentCategoryName: 'Paracaidismo',
  ...overrides,
});

const jumpConsumption = (overrides: Partial<AdoptableRow> = {}): AdoptableRow => ({
  VoucherID: 50,
  VoucherUnits: '1.00',
  CategoryName: 'Saltos',
  ParentCategoryName: 'Paracaidismo',
  ...overrides,
});

const unitVoucher: Voucher = {
  voucherId: 50,
  categoryId: 30,
  categoryName: 'Saltos',
  categoryIcon: null,
  categoryColor: null,
  description: 'Bono 10 saltos',
  totalAmountCents: 20000, // 200,00 € for 10 jumps -> 20,00 € per jump
  totalUnits: 10,
  unitLabel: 'saltos',
  purchaseDate: '2025-01-01',
  expiryDate: null,
  consumedCents: 0,
  remainingCents: 20000,
  consumedUnits: 0,
  consumptionCount: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const tunnelUnitVoucher: Voucher = {
  ...unitVoucher,
  voucherId: 51,
  categoryId: 31,
  categoryName: 'Túnel de viento',
  description: 'Bono 120 minutos',
  totalAmountCents: 24000, // 240,00 € for 120 minutes -> 2,00 € per minute
  totalUnits: 120,
  unitLabel: 'minutos',
  remainingCents: 24000,
};

const monetaryVoucher: Voucher = {
  ...unitVoucher,
  voucherId: 52,
  description: 'Bono monedero',
  totalAmountCents: 100000,
  totalUnits: null,
  unitLabel: null,
  remainingCents: 100000,
};

// A fake transactional client that captures the Transactions INSERT params.
function createFakeClient() {
  return {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO "SkydiveJumps"') || sql.includes('INSERT INTO "TunnelSessions"')) {
        return {
          rows: [
            {
              JumpID: 1,
              SessionID: 1,
              JumpNumber: 1,
              JumpDate: new Date('2025-06-15'),
              SessionDate: new Date('2025-06-15'),
              DurationSec: 3600,
              Title: null,
              Dropzone: null,
              Location: null,
              SessionType: null,
              Canopy: null,
              Wingsuit: null,
              FreefallTimeSec: null,
              JumpType: null,
              Aircraft: null,
              ExitAltitudeFt: null,
              LandingDistanceM: null,
              Comment: null,
              Notes: null,
              PriceCents: null,
              TransactionID: null,
              CreatedAt: new Date('2025-06-15'),
              UpdatedAt: new Date('2025-06-15'),
            },
          ],
        };
      }
      if (sql.includes('INSERT INTO "Transactions"')) {
        capturedTxParams = params ?? null;
        return { rows: [{ TransactionID: 99 }] };
      }
      if (sql.includes('UPDATE "Transactions"')) {
        capturedTxUpdateParams = params ?? null;
        return { rows: [] };
      }
      if (sql.includes('FOR UPDATE')) {
        return { rows: adoptableRow ? [adoptableRow] : [] };
      }
      if (sql.includes('"IsLinked"')) {
        return { rows: [{ IsLinked: consumptionIsLinked }] };
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
  query: jest.fn(async () => []),
  getPool: jest.fn(() => ({ connect: jest.fn(async () => fakeClient) })),
}));

jest.mock('@/services/database/VoucherRepository', () => ({
  getVoucherById: jest.fn(async () => voucherToReturn),
}));

import { createJump, createTunnelSession } from '@/services/database/SkydiveRepository';

// Transactions INSERT param order:
// [CategoryID, AmountCents, Description, TransactionDate, Type, SharedDivisor, Status, VoucherID, VoucherUnits, UserID]
const CATEGORY_ID = 0;
const AMOUNT_CENTS = 1;
const VOUCHER_ID = 7;
const VOUCHER_UNITS = 8;

beforeEach(() => {
  capturedTxParams = null;
  capturedTxUpdateParams = null;
  adoptableRow = null;
  consumptionIsLinked = false;
  fakeClient = createFakeClient();
});

describe('createJump with a unit voucher', () => {
  it('consumes 1 unit and prorates the amount from the voucher unit price', async () => {
    voucherToReturn = unitVoucher;

    await createJump({ jumpNumber: 1, jumpDate: '2025-06-15', voucherId: 50 });

    expect(capturedTxParams).not.toBeNull();
    expect(capturedTxParams![AMOUNT_CENTS]).toBe(2000); // 20000 / 10 * 1
    expect(capturedTxParams![VOUCHER_ID]).toBe(50);
    expect(capturedTxParams![VOUCHER_UNITS]).toBe(1);
    expect(capturedTxParams![CATEGORY_ID]).toBe(30); // voucher's own category
  });
});

describe('createTunnelSession with a unit voucher', () => {
  it('consumes the session minutes and prorates the amount', async () => {
    voucherToReturn = tunnelUnitVoucher;

    await createTunnelSession({ sessionDate: '2025-06-15', durationSec: 3600, voucherId: 51 });

    expect(capturedTxParams).not.toBeNull();
    expect(capturedTxParams![AMOUNT_CENTS]).toBe(12000); // 24000 / 120 * 60 minutes
    expect(capturedTxParams![VOUCHER_ID]).toBe(51);
    expect(capturedTxParams![VOUCHER_UNITS]).toBe(60);
    expect(capturedTxParams![CATEGORY_ID]).toBe(31);
  });
});

describe('createJump with a monetary voucher', () => {
  it('deducts the entered price and consumes no units', async () => {
    voucherToReturn = monetaryVoucher;

    await createJump({ jumpNumber: 2, jumpDate: '2025-06-15', voucherId: 52, priceCents: 5000 });

    expect(capturedTxParams).not.toBeNull();
    expect(capturedTxParams![AMOUNT_CENTS]).toBe(5000);
    expect(capturedTxParams![VOUCHER_ID]).toBe(52);
    expect(capturedTxParams![VOUCHER_UNITS]).toBeNull();
    expect(capturedTxParams![CATEGORY_ID]).toBe(30);
  });
});

describe('createTunnelSession adopting an existing consumption', () => {
  // Transactions UPDATE param order (syncLinkedExpenseTransaction):
  // [CategoryID, AmountCents, Description, TransactionDate, VoucherID, VoucherUnits, TransactionID, UserID]
  it('rewrites the consumption to match the session instead of inserting a new one', async () => {
    voucherToReturn = tunnelUnitVoucher;
    adoptableRow = tunnelConsumption();

    const session = await createTunnelSession({
      sessionDate: '2025-06-15',
      location: 'Madrid Fly',
      durationSec: 900,
      voucherId: 51,
      transactionId: 77,
    });

    expect(capturedTxParams).toBeNull();
    expect(capturedTxUpdateParams).toEqual([31, 3000, 'Túnel – Madrid Fly', '2025-06-15', 51, 15, 77, 1]);
    expect(session.transactionId).toBe(77);
    expect(fakeClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('checks the link in its own statement after locking, against jumps and sessions alike', async () => {
    voucherToReturn = tunnelUnitVoucher;
    adoptableRow = tunnelConsumption();

    await createTunnelSession({ sessionDate: '2025-06-15', durationSec: 900, voucherId: 51, transactionId: 77 });

    const sqls: string[] = fakeClient.query.mock.calls.map(([sql]) => sql);
    const lockAt = sqls.findIndex((sql) => sql.includes('FOR UPDATE'));
    const linkAt = sqls.findIndex((sql) => sql.includes('"IsLinked"'));
    expect(sqls[lockAt]).not.toContain('"IsLinked"');
    expect(linkAt).toBeGreaterThan(lockAt);
    expect(sqls[linkAt]).toContain('"SkydiveJumps"');
    expect(sqls[linkAt]).toContain('"TunnelSessions"');
  });

  it('rejects a consumption that already has an activity, writing nothing', async () => {
    voucherToReturn = tunnelUnitVoucher;
    adoptableRow = tunnelConsumption();
    consumptionIsLinked = true;

    await expect(
      createTunnelSession({ sessionDate: '2025-06-15', durationSec: 900, voucherId: 51, transactionId: 77 }),
    ).rejects.toThrow('already linked');

    expect(fakeClient.query).toHaveBeenCalledWith('ROLLBACK');
    const sqls: string[] = fakeClient.query.mock.calls.map(([sql]) => sql);
    expect(sqls.some((sql) => sql.includes('INSERT INTO "TunnelSessions"'))).toBe(false);
  });

  it('rejects a transaction that is not a voucher consumption', async () => {
    voucherToReturn = tunnelUnitVoucher;
    adoptableRow = tunnelConsumption({ VoucherID: null });

    await expect(
      createTunnelSession({ sessionDate: '2025-06-15', durationSec: 900, voucherId: 51, transactionId: 77 }),
    ).rejects.toThrow('not a voucher consumption');
    expect(fakeClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('rejects moving the consumption to another voucher', async () => {
    voucherToReturn = tunnelUnitVoucher;
    adoptableRow = tunnelConsumption({ VoucherID: 99 });

    await expect(
      createTunnelSession({ sessionDate: '2025-06-15', durationSec: 900, voucherId: 51, transactionId: 77 }),
    ).rejects.toThrow('belongs to voucher 99');
    expect(capturedTxUpdateParams).toBeNull();
  });

  it('rejects a consumption from another kind of activity', async () => {
    voucherToReturn = tunnelUnitVoucher;
    adoptableRow = tunnelConsumption({ CategoryName: 'Saltos' });

    await expect(
      createTunnelSession({ sessionDate: '2025-06-15', durationSec: 900, voucherId: 51, transactionId: 77 }),
    ).rejects.toThrow('is not "Túnel de viento"');
    expect(capturedTxUpdateParams).toBeNull();
  });

  it('rejects minutes that differ from what the consumption drew from the voucher', async () => {
    voucherToReturn = tunnelUnitVoucher;
    adoptableRow = tunnelConsumption({ VoucherUnits: '30.00' });

    await expect(
      createTunnelSession({ sessionDate: '2025-06-15', durationSec: 900, voucherId: 51, transactionId: 77 }),
    ).rejects.toThrow('consumed 30 units');
    expect(capturedTxUpdateParams).toBeNull();
  });

  it('refuses to adopt without a voucher, which would turn the consumption into cash or delete it', async () => {
    await expect(
      createTunnelSession({ sessionDate: '2025-06-15', durationSec: 900, voucherId: null, transactionId: 77 }),
    ).rejects.toThrow('not paid from a voucher');
    expect(capturedTxUpdateParams).toBeNull();
  });
});

describe('createJump adopting an existing consumption', () => {
  it('rewrites the consumption to match the jump instead of inserting a new one', async () => {
    voucherToReturn = unitVoucher;
    adoptableRow = jumpConsumption();

    const jump = await createJump({
      jumpNumber: 12,
      jumpDate: '2025-06-15',
      dropzone: 'Empuriabrava',
      voucherId: 50,
      transactionId: 88,
    });

    expect(capturedTxParams).toBeNull();
    expect(capturedTxUpdateParams).toEqual([30, 2000, 'Salto – Empuriabrava', '2025-06-15', 50, 1, 88, 1]);
    expect(jump.transactionId).toBe(88);
    expect(fakeClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('rejects a consumption of several jumps, which a single jump would silently shrink', async () => {
    voucherToReturn = unitVoucher;
    adoptableRow = jumpConsumption({ VoucherUnits: '3.00' });

    await expect(
      createJump({ jumpNumber: 12, jumpDate: '2025-06-15', voucherId: 50, transactionId: 88 }),
    ).rejects.toThrow('consumed 3 units');
    expect(fakeClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('rejects a tunnel consumption', async () => {
    voucherToReturn = unitVoucher;
    adoptableRow = jumpConsumption({ CategoryName: 'Túnel de viento', VoucherUnits: null });

    await expect(
      createJump({ jumpNumber: 12, jumpDate: '2025-06-15', voucherId: 50, transactionId: 88 }),
    ).rejects.toThrow('is not "Saltos"');
  });

  it('refuses to adopt without a voucher', async () => {
    await expect(
      createJump({ jumpNumber: 12, jumpDate: '2025-06-15', voucherId: null, transactionId: 88 }),
    ).rejects.toThrow('not paid from a voucher');
    expect(capturedTxUpdateParams).toBeNull();
  });
});
