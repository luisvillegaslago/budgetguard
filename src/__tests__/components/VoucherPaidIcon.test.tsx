/**
 * Component Tests: VoucherPaidIcon
 * The paid-with-voucher marker names the voucher once the vouchers list is
 * loaded, and falls back to a generic label otherwise.
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { Voucher } from '@/types/finance';

const voucher: Voucher = {
  voucherId: 50,
  categoryId: 30,
  categoryName: 'Saltos',
  categoryIcon: null,
  categoryColor: null,
  description: 'Bono 10 saltos Empuriabrava',
  totalAmountCents: 20000,
  totalUnits: 10,
  unitLabel: 'saltos',
  purchaseDate: '2026-01-01',
  expiryDate: null,
  consumedCents: 20000,
  remainingCents: 0,
  consumedUnits: 10,
  consumptionCount: 10,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

let mockVouchers: Voucher[] | undefined = [voucher];

jest.mock('@/hooks/useVouchers', () => ({
  useVouchers: () => ({ data: mockVouchers }),
}));

const DICT: Record<string, string> = {
  'skydiving.voucher-assign.paid-with-voucher': 'Pagado con bono',
  'skydiving.voucher-assign.paid-with-named-voucher': 'Pagado con el bono «{name}»',
  'vouchers.untitled': 'Bono',
};

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let str = DICT[key] ?? key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          str = str.replace(`{${k}}`, String(v));
        });
      }
      return str;
    },
    locale: 'es',
    setLocale: jest.fn(),
  }),
}));

import { VoucherPaidIcon } from '@/components/skydiving/VoucherPaidIcon';

describe('VoucherPaidIcon', () => {
  beforeEach(() => {
    mockVouchers = [voucher];
  });

  it('names the voucher, even when it is already spent', () => {
    render(<VoucherPaidIcon voucherId={50} />);

    expect(screen.getByRole('img', { name: 'Pagado con el bono «Bono 10 saltos Empuriabrava»' })).toBeInTheDocument();
  });

  it('uses the generic label while the vouchers list is loading', () => {
    mockVouchers = undefined;
    render(<VoucherPaidIcon voucherId={50} />);

    expect(screen.getByRole('img', { name: 'Pagado con bono' })).toBeInTheDocument();
  });

  it('uses the generic label when the voucher is not in the list', () => {
    render(<VoucherPaidIcon voucherId={999} />);

    expect(screen.getByRole('img', { name: 'Pagado con bono' })).toBeInTheDocument();
  });
});
