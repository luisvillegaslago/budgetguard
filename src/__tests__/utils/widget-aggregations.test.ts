/**
 * Unit Tests: dashboard widget aggregations
 * aggregateTopVendors (Top vendors) and splitFixedVariable (fixed vs variable).
 */

import { splitFixedVariable } from '@/components/dashboard/widgets/FixedVsVariableCard';
import { aggregateTopVendors } from '@/components/dashboard/widgets/TopVendorsWidget';
import { TRANSACTION_STATUS, TRANSACTION_TYPE } from '@/constants/finance';
import type { Transaction } from '@/types/finance';

function makeTx(overrides: Partial<Transaction>): Transaction {
  return {
    transactionId: 0,
    categoryId: 1,
    amountCents: 0,
    description: null,
    transactionDate: '2025-05-10',
    type: TRANSACTION_TYPE.EXPENSE,
    status: TRANSACTION_STATUS.PAID,
    sharedDivisor: 1,
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
    voucherId: null,
    voucherUnits: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('aggregateTopVendors', () => {
  it('sums expenses by vendor, ignores income and null vendors, sorts desc', () => {
    const txs = [
      makeTx({ vendorName: 'Mercadona', amountCents: 3000 }),
      makeTx({ vendorName: 'Mercadona', amountCents: 2000 }),
      makeTx({ vendorName: 'Amazon', amountCents: 4000 }),
      makeTx({ vendorName: null, amountCents: 9999 }),
      makeTx({ vendorName: 'Cliente', amountCents: 100000, type: TRANSACTION_TYPE.INCOME }),
    ];

    const result = aggregateTopVendors(txs, 5);

    expect(result).toEqual([
      { vendor: 'Mercadona', totalCents: 5000, count: 2 },
      { vendor: 'Amazon', totalCents: 4000, count: 1 },
    ]);
  });

  it('respects the limit', () => {
    const txs = [
      makeTx({ vendorName: 'A', amountCents: 100 }),
      makeTx({ vendorName: 'B', amountCents: 200 }),
      makeTx({ vendorName: 'C', amountCents: 300 }),
    ];
    expect(aggregateTopVendors(txs, 2)).toHaveLength(2);
  });
});

describe('splitFixedVariable', () => {
  it('splits expenses by recurring flag and ignores income', () => {
    const txs = [
      makeTx({ amountCents: 1000, recurringExpenseId: 5 }),
      makeTx({ amountCents: 2000, recurringExpenseId: null }),
      makeTx({ amountCents: 500, recurringExpenseId: 7 }),
      makeTx({ amountCents: 99999, type: TRANSACTION_TYPE.INCOME, recurringExpenseId: 1 }),
    ];

    expect(splitFixedVariable(txs)).toEqual({ fixedCents: 1500, variableCents: 2000 });
  });
});
