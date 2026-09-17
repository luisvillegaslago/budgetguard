/**
 * Unit Tests: skydiving voucher ("bono") assignment helpers + contract
 * Covers AssignVoucherSchema, isUnitVoucher, getVoucherShortfall,
 * formatVoucherOptionLabel, buildTunnelSessionPrefill, buildJumpPrefill and
 * getNextJumpNumber.
 */

import { SHARED_EXPENSE, TRANSACTION_STATUS, TRANSACTION_TYPE } from '@/constants/finance';
import { AssignVoucherSchema, MAX_VOUCHER_ASSIGNMENT_IDS } from '@/schemas/skydive';
import type { Transaction, Voucher } from '@/types/finance';
import type { SkydiveJump } from '@/types/skydive';
import {
  buildJumpPrefill,
  buildTunnelSessionPrefill,
  formatVoucherOptionLabel,
  getNextJumpNumber,
  getVoucherName,
  getVoucherShortfall,
  isUnitVoucher,
  type VoucherAssignItem,
} from '@/utils/skydiveVoucher';

// 200,00 € for 10 jumps, 8 already used -> 2 left
const unitVoucher: Voucher = {
  voucherId: 50,
  categoryId: 30,
  categoryName: 'Saltos',
  categoryIcon: null,
  categoryColor: null,
  description: 'Bono 10 saltos',
  totalAmountCents: 20000,
  totalUnits: 10,
  unitLabel: 'saltos',
  purchaseDate: '2026-01-01',
  expiryDate: null,
  consumedCents: 16000,
  remainingCents: 4000,
  consumedUnits: 8,
  consumptionCount: 8,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const monetaryVoucher: Voucher = {
  ...unitVoucher,
  voucherId: 52,
  description: 'Bono monedero',
  totalUnits: null,
  unitLabel: null,
  remainingCents: 5000,
};

const item = (overrides: Partial<VoucherAssignItem>): VoucherAssignItem => ({
  id: 1,
  units: 1,
  priceCents: null,
  voucherId: null,
  ...overrides,
});

describe('AssignVoucherSchema', () => {
  it('accepts a list of ids and a voucher', () => {
    expect(AssignVoucherSchema.safeParse({ ids: [1, 2, 3], voucherId: 50 }).success).toBe(true);
  });

  it('rejects an empty selection', () => {
    expect(AssignVoucherSchema.safeParse({ ids: [], voucherId: 50 }).success).toBe(false);
  });

  it('rejects non-positive ids and vouchers', () => {
    expect(AssignVoucherSchema.safeParse({ ids: [0], voucherId: 50 }).success).toBe(false);
    expect(AssignVoucherSchema.safeParse({ ids: [1], voucherId: -1 }).success).toBe(false);
  });

  it('rejects a missing voucher', () => {
    expect(AssignVoucherSchema.safeParse({ ids: [1] }).success).toBe(false);
  });

  it(`rejects more than ${MAX_VOUCHER_ASSIGNMENT_IDS} ids`, () => {
    const ids = Array.from({ length: MAX_VOUCHER_ASSIGNMENT_IDS + 1 }, (_, i) => i + 1);
    expect(AssignVoucherSchema.safeParse({ ids, voucherId: 50 }).success).toBe(false);
  });
});

describe('isUnitVoucher', () => {
  it('is true only when the voucher has a positive unit total', () => {
    expect(isUnitVoucher(unitVoucher)).toBe(true);
    expect(isUnitVoucher(monetaryVoucher)).toBe(false);
    expect(isUnitVoucher({ ...unitVoucher, totalUnits: 0 })).toBe(false);
  });
});

describe('getVoucherShortfall — unit voucher', () => {
  it('reports the shortfall when the selection needs more units than remain', () => {
    const items = [item({ id: 1 }), item({ id: 2 }), item({ id: 3 })];

    expect(getVoucherShortfall(unitVoucher, items)).toEqual({ unitBased: true, remaining: 2, needed: 3 });
  });

  it('returns null when the remaining units cover the selection', () => {
    expect(getVoucherShortfall(unitVoucher, [item({ id: 1 }), item({ id: 2 })])).toBeNull();
  });

  it('does not count again items already paid from the same voucher', () => {
    const items = [item({ id: 1, voucherId: 50 }), item({ id: 2, voucherId: 50 }), item({ id: 3 })];

    expect(getVoucherShortfall(unitVoucher, items)).toBeNull();
  });

  it('counts items moving over from a different voucher', () => {
    const items = [item({ id: 1, voucherId: 99 }), item({ id: 2, voucherId: 99 }), item({ id: 3 })];

    expect(getVoucherShortfall(unitVoucher, items)).toEqual({ unitBased: true, remaining: 2, needed: 3 });
  });

  it('adds up tunnel minutes as units', () => {
    const tunnelVoucher = { ...unitVoucher, totalUnits: 120, consumedUnits: 100 };
    const items = [item({ id: 1, units: 15 }), item({ id: 2, units: 7.5 })];

    expect(getVoucherShortfall(tunnelVoucher, items)).toEqual({ unitBased: true, remaining: 20, needed: 22.5 });
  });
});

describe('getVoucherShortfall — monetary voucher', () => {
  it('reports the shortfall when the selected prices exceed the balance', () => {
    const items = [item({ id: 1, priceCents: 3000 }), item({ id: 2, priceCents: 3000 })];

    expect(getVoucherShortfall(monetaryVoucher, items)).toEqual({ unitBased: false, remaining: 5000, needed: 6000 });
  });

  it('treats a missing price as zero', () => {
    expect(getVoucherShortfall(monetaryVoucher, [item({ id: 1 }), item({ id: 2, priceCents: 4500 })])).toBeNull();
  });
});

describe('getVoucherName', () => {
  it('prefers the description, then the category, then the untitled label', () => {
    expect(getVoucherName(unitVoucher, 'Bono')).toBe('Bono 10 saltos');
    expect(getVoucherName({ ...unitVoucher, description: null }, 'Bono')).toBe('Saltos');
    expect(getVoucherName({ ...unitVoucher, description: '', categoryName: null }, 'Bono')).toBe('Bono');
  });
});

describe('formatVoucherOptionLabel', () => {
  it('shows the voucher description and its remaining balance', () => {
    const label = formatVoucherOptionLabel(unitVoucher, 'Bono');

    expect(label.startsWith('Bono 10 saltos · ')).toBe(true);
    expect(label).toContain('40');
  });

  it('falls back to the category name, then to the untitled label', () => {
    expect(formatVoucherOptionLabel({ ...unitVoucher, description: null }, 'Bono').startsWith('Saltos · ')).toBe(true);
    expect(
      formatVoucherOptionLabel({ ...unitVoucher, description: null, categoryName: null }, 'Bono').startsWith('Bono · '),
    ).toBe(true);
  });
});

describe('buildTunnelSessionPrefill', () => {
  const consumption: Transaction = {
    transactionId: 321,
    categoryId: 31,
    amountCents: 3000,
    description: 'Túnel – Windoor Empuriabrava',
    transactionDate: '2026-09-12',
    type: TRANSACTION_TYPE.EXPENSE,
    status: TRANSACTION_STATUS.PAID,
    sharedDivisor: SHARED_EXPENSE.DEFAULT_DIVISOR,
    originalAmountCents: null,
    recurringExpenseId: null,
    transactionGroupId: null,
    tripId: null,
    tripName: null,
    vatPercent: null,
    deductionPercent: null,
    vendorName: null,
    invoiceNumber: null,
    companyId: null,
    fiscalDocumentId: null,
    voucherId: 51,
    voucherUnits: 15,
    createdAt: '2026-09-12T00:00:00Z',
    updatedAt: '2026-09-12T00:00:00Z',
  };

  it('starts the session from the consumption it adopts: date, minutes, location, price and voucher', () => {
    expect(buildTunnelSessionPrefill(consumption)).toEqual({
      transactionId: 321,
      sessionDate: '2026-09-12',
      durationMin: 15,
      location: 'Windoor Empuriabrava',
      price: 30,
      voucherId: 51,
    });
  });

  it('leaves location and minutes empty when the consumption does not carry them', () => {
    const prefill = buildTunnelSessionPrefill({ ...consumption, description: 'Sesión con coach', voucherUnits: null });

    expect(prefill.location).toBeNull();
    expect(prefill.durationMin).toBeNull();
  });
});

describe('buildJumpPrefill', () => {
  const consumption: Transaction = {
    transactionId: 654,
    categoryId: 30,
    amountCents: 2000,
    description: 'Salto – Skydive Empuriabrava',
    transactionDate: '2026-09-13',
    type: TRANSACTION_TYPE.EXPENSE,
    status: TRANSACTION_STATUS.PAID,
    sharedDivisor: SHARED_EXPENSE.DEFAULT_DIVISOR,
    originalAmountCents: null,
    recurringExpenseId: null,
    transactionGroupId: null,
    tripId: null,
    tripName: null,
    vatPercent: null,
    deductionPercent: null,
    vendorName: null,
    invoiceNumber: null,
    companyId: null,
    fiscalDocumentId: null,
    voucherId: 50,
    voucherUnits: 1,
    createdAt: '2026-09-13T00:00:00Z',
    updatedAt: '2026-09-13T00:00:00Z',
  };

  it('starts the jump from the consumption it adopts: date, dropzone, price and voucher', () => {
    expect(buildJumpPrefill(consumption)).toEqual({
      transactionId: 654,
      jumpDate: '2026-09-13',
      dropzone: 'Skydive Empuriabrava',
      priceCents: 2000,
      voucherId: 50,
    });
  });

  it('leaves the dropzone empty when the description does not carry it', () => {
    expect(buildJumpPrefill({ ...consumption, description: 'Salto tándem' }).dropzone).toBeNull();
  });
});

describe('getNextJumpNumber', () => {
  const jumpNumbered = (jumpNumber: number) => ({ jumpNumber }) as SkydiveJump;

  it('follows the highest logged jump, whatever the order', () => {
    expect(getNextJumpNumber([jumpNumbered(7), jumpNumbered(152), jumpNumbered(40)])).toBe(153);
  });

  it('starts at 1 with no jumps or while the log is loading', () => {
    expect(getNextJumpNumber([])).toBe(1);
    expect(getNextJumpNumber(undefined)).toBe(1);
  });
});
