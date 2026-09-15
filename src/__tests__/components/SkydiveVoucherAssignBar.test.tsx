/**
 * Component Tests: SkydiveVoucherAssignBar
 * Bulk "assign to voucher" bar shown while jumps/tunnel sessions are selected:
 * hidden without a selection, overdraw warning, and the assignment request.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SKYDIVE_ACTIVITY_TYPE } from '@/constants/finance';
import type { Voucher } from '@/types/finance';

// 10 jumps, 8 used -> 2 left
const jumpVoucher: Voucher = {
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

let mockVouchers: Voucher[] = [jumpVoucher];
const mockMutateAsync = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();

jest.mock('@/hooks/useSkydiveVouchers', () => ({
  useSkydiveVouchers: () => mockVouchers,
}));

jest.mock('@/hooks/useSkydiveVoucherAssignment', () => ({
  useAssignSkydiveVoucher: () => ({ mutateAsync: mockMutateAsync, isPending: false, errorMessage: null }),
}));

jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

const DICT: Record<string, string> = {
  'skydiving.voucher.select-placeholder': 'Selecciona un bono',
  'skydiving.voucher-assign.selected': '{count} seleccionados',
  'skydiving.voucher-assign.assign': 'Asignar a bono',
  'skydiving.voucher-assign.assigning': 'Asignando...',
  'skydiving.voucher-assign.clear': 'Quitar selección',
  'skydiving.voucher-assign.no-vouchers': 'No hay bonos con saldo para esta actividad',
  'skydiving.voucher-assign.over-units': 'Quedan {remaining} {unit} en el bono y la selección consume {needed}',
  'skydiving.voucher-assign.success': '{count} asignados al bono',
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

import { SkydiveVoucherAssignBar } from '@/components/skydiving/SkydiveVoucherAssignBar';

const threeJumps = [1, 2, 3].map((id) => ({ id, units: 1, priceCents: null, voucherId: null }));

describe('SkydiveVoucherAssignBar', () => {
  const onClear = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockVouchers = [jumpVoucher];
  });

  it('renders nothing without a selection', () => {
    const { container } = render(
      <SkydiveVoucherAssignBar activityType={SKYDIVE_ACTIVITY_TYPE.JUMP} selectedItems={[]} onClear={onClear} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('warns when the selection needs more units than the voucher has left', () => {
    render(
      <SkydiveVoucherAssignBar
        activityType={SKYDIVE_ACTIVITY_TYPE.JUMP}
        selectedItems={threeJumps}
        onClear={onClear}
      />,
    );

    expect(screen.getByText('3 seleccionados')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Asignar a bono' })).toBeDisabled();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '50' } });

    expect(screen.getByRole('status')).toHaveTextContent('Quedan 2 saltos en el bono y la selección consume 3');
  });

  it('assigns every selected id to the chosen voucher and clears the selection', async () => {
    mockMutateAsync.mockResolvedValue({ assigned: 3 });
    render(
      <SkydiveVoucherAssignBar
        activityType={SKYDIVE_ACTIVITY_TYPE.JUMP}
        selectedItems={threeJumps}
        onClear={onClear}
      />,
    );

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Asignar a bono' }));

    await waitFor(() => expect(onClear).toHaveBeenCalled());
    expect(mockMutateAsync).toHaveBeenCalledWith({ ids: [1, 2, 3], voucherId: 50 });
    expect(mockToastSuccess).toHaveBeenCalledWith('3 asignados al bono');
  });

  it('keeps the selection when the assignment fails', async () => {
    mockMutateAsync.mockRejectedValue(new Error('fail'));
    render(
      <SkydiveVoucherAssignBar
        activityType={SKYDIVE_ACTIVITY_TYPE.JUMP}
        selectedItems={threeJumps}
        onClear={onClear}
      />,
    );

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Asignar a bono' }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(onClear).not.toHaveBeenCalled();
  });

  it('explains when there is no voucher with balance', () => {
    mockVouchers = [];
    render(
      <SkydiveVoucherAssignBar
        activityType={SKYDIVE_ACTIVITY_TYPE.JUMP}
        selectedItems={threeJumps}
        onClear={onClear}
      />,
    );

    expect(screen.getByText('No hay bonos con saldo para esta actividad')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
