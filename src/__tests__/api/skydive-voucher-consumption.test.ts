/**
 * Integration Tests: Skydiving voucher ("bono") consumption
 * Verifies that creating a jump/tunnel session paid from a voucher prorates the
 * amount correctly and wires the linked expense transaction (VoucherID,
 * VoucherUnits, AmountCents, CategoryID) atomically.
 */

import type { Voucher } from '@/types/finance';

// ---- Captured transaction INSERT params ----
let capturedTxParams: unknown[] | null = null;
let voucherToReturn: Voucher | null = null;

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
