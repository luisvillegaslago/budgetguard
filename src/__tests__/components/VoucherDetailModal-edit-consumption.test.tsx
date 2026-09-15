/**
 * Integration Tests: VoucherDetailModal — editing and deleting consumptions
 * Covers the per-row actions of the consumptions list: units shown even when the
 * voucher has no unit label, inline edit (prefilled, re-prorated, shared split
 * kept), delete behind a confirmation, and consumptions owned by a skydiving
 * activity staying read-only.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SHARED_EXPENSE, SKYDIVE_ACTIVITY_TYPE, TRANSACTION_STATUS, TRANSACTION_TYPE } from '@/constants/finance';
import type { VoucherDetail } from '@/hooks/useVouchers';
import type { Transaction, Voucher } from '@/types/finance';

// 370,00 € over 10 units with no unit label → 37,00 € per unit.
const voucher: Voucher = {
  voucherId: 7,
  categoryId: 12,
  categoryName: 'Coach',
  categoryIcon: null,
  categoryColor: null,
  description: 'Bono 10 saltos Alex',
  totalAmountCents: 37000,
  totalUnits: 10,
  unitLabel: null,
  purchaseDate: '2026-09-14',
  expiryDate: null,
  consumedCents: 18500,
  remainingCents: 18500,
  consumedUnits: 5,
  consumptionCount: 1,
  createdAt: '2026-09-14T00:00:00Z',
  updatedAt: '2026-09-14T00:00:00Z',
};

function makeConsumption(overrides: Partial<Transaction>): Transaction {
  return {
    transactionId: 1,
    categoryId: 12,
    amountCents: 18500,
    description: 'Coach',
    transactionDate: '2026-09-14',
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
    voucherId: 7,
    voucherUnits: 5,
    createdAt: '2026-09-14T00:00:00Z',
    updatedAt: '2026-09-14T00:00:00Z',
    ...overrides,
  };
}

let mockVoucherData: VoucherDetail;

const mockUpdateMutateAsync = jest.fn();
const mockDeleteMutateAsync = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();

jest.mock('@/hooks/useVouchers', () => ({
  useVoucher: () => ({ data: mockVoucherData, isLoading: false, isError: false, refetch: jest.fn() }),
  useDeleteVoucher: () => ({ mutateAsync: jest.fn(), isPending: false, errorMessage: null }),
  useReconcileVoucherConsumption: () => ({ mutateAsync: jest.fn(), isPending: false, errorMessage: null }),
}));

jest.mock('@/hooks/useTransactions', () => ({
  useCreateTransaction: () => ({ mutateAsync: jest.fn(), isPending: false, errorMessage: null }),
  useUpdateTransaction: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: false, errorMessage: null }),
  useDeleteTransaction: () => ({ mutateAsync: mockDeleteMutateAsync, isPending: false, errorMessage: null }),
}));

const DICT: Record<string, string> = {
  'vouchers.consumptions': 'Consumos',
  'vouchers.use.button': 'Usar bono',
  'vouchers.use.date': 'Fecha',
  'vouchers.use.units': 'Unidades a consumir',
  'vouchers.use.amount-preview': 'Importe del consumo: {amount}',
  'vouchers.consumption.edit': 'Editar consumo',
  'vouchers.consumption.delete': 'Eliminar consumo',
  'vouchers.consumption.edit-title': 'Editar consumo',
  'vouchers.consumption.save': 'Guardar cambios',
  'vouchers.consumption.saving': 'Guardando...',
  'vouchers.consumption.update-success': 'Consumo actualizado',
  'vouchers.consumption.update-error': 'No se pudo actualizar el consumo',
  'vouchers.consumption.delete-title': '¿Eliminar consumo?',
  'vouchers.consumption.delete-message': 'Se borrará el gasto de {amount}',
  'vouchers.consumption.delete-success': 'Consumo eliminado',
  'vouchers.consumption.delete-error': 'No se pudo eliminar el consumo',
  'vouchers.consumption.linked-hint': 'Vinculado a una actividad de paracaidismo',
  'vouchers.consumption.units-fallback': 'ud.',
  'common.buttons.edit': 'Editar',
  'common.buttons.delete': 'Eliminar',
  'common.buttons.close': 'Cerrar',
  'common.buttons.cancel': 'Cancelar',
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

jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

jest.mock('@/components/ui/ModalBackdrop', () => ({
  ModalBackdrop: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Renders only while open, so the delete confirmation can be driven from the test.
jest.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({
    open,
    title,
    message,
    confirmLabel,
    onConfirm,
  }: {
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <p>{message}</p>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    ) : null,
}));

jest.mock('@/components/ui/SortControl', () => ({
  SortControl: () => null,
}));

jest.mock('@/components/ui/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

jest.mock('@/components/ui/ErrorState', () => ({
  ErrorState: ({ message }: { message: string }) => <div>{message}</div>,
}));

jest.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => <span>Loading...</span>,
}));

jest.mock('@/utils/helpers', () => ({
  cn: (...args: unknown[]) => args.filter((a) => typeof a === 'string').join(' '),
  formatDate: (date: string) => String(date),
}));

jest.mock('@/utils/money', () => ({
  formatCurrency: (cents: number) => `${(cents / 100).toFixed(2)} €`,
  centsToEuros: (cents: number) => cents / 100,
  eurosToCents: (euros: number) => Math.round(euros * 100),
}));

import { VoucherDetailModal } from '@/components/vouchers/VoucherDetailModal';

describe('VoucherDetailModal — editing and deleting consumptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVoucherData = {
      voucher,
      consumptions: [makeConsumption({})],
      unlinkedConsumptions: [],
      reconcileActivityType: null,
    };
    mockUpdateMutateAsync.mockResolvedValue({});
    mockDeleteMutateAsync.mockResolvedValue(undefined);
  });

  const renderModal = () => render(<VoucherDetailModal voucherId={7} onClose={jest.fn()} onEdit={jest.fn()} />);

  it('shows the units of a consumption even when the voucher has no unit label', () => {
    renderModal();

    expect(screen.getByText('2026-09-14 · 5 ud.')).toBeInTheDocument();
  });

  it('edits the units inline, prefilled with the stored values, and re-prorates the amount', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Editar consumo' }));

    expect((screen.getByLabelText('Fecha') as HTMLInputElement).value).toBe('2026-09-14');
    const unitsInput = screen.getByLabelText(/Unidades a consumir/) as HTMLInputElement;
    expect(unitsInput.value).toBe('5');

    fireEvent.change(unitsInput, { target: { value: '4' } });
    // 4 units * (370,00 € / 10) = 148,00 €
    expect(screen.getByText('Importe del consumo: 148.00 €')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1));
    const { id, data } = mockUpdateMutateAsync.mock.calls[0][0];
    expect(id).toBe(1);
    expect(data).toEqual(expect.objectContaining({ amount: 148, voucherUnits: 4, isShared: false }));
    expect((data.transactionDate as Date).toISOString()).toBe('2026-09-14T00:00:00.000Z');

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Consumo actualizado'));
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
  });

  it('keeps the shared split and derives units from the full amount when none were stored', async () => {
    mockVoucherData.consumptions = [
      makeConsumption({
        amountCents: 3700,
        originalAmountCents: 7400,
        sharedDivisor: SHARED_EXPENSE.DIVISOR,
        voucherUnits: null,
      }),
    ];
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Editar consumo' }));

    // 74,00 € full amount / 37,00 € per unit = 2 units
    expect((screen.getByLabelText(/Unidades a consumir/) as HTMLInputElement).value).toBe('2');

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1));
    expect(mockUpdateMutateAsync.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ amount: 74, voucherUnits: 2, isShared: true }),
    );
  });

  it('shows an error toast and keeps the edit form open when the update fails', async () => {
    mockUpdateMutateAsync.mockRejectedValueOnce(new Error('boom'));
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Editar consumo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('No se pudo actualizar el consumo'));
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
  });

  it('deletes a consumption only after confirming', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar consumo' }));

    const dialog = screen.getByRole('dialog', { name: '¿Eliminar consumo?' });
    expect(within(dialog).getByText('Se borrará el gasto de 185.00 €')).toBeInTheDocument();
    expect(mockDeleteMutateAsync).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(mockDeleteMutateAsync).toHaveBeenCalledWith(1));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Consumo eliminado'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the confirmation open and shows an error toast when the delete fails', async () => {
    mockDeleteMutateAsync.mockRejectedValueOnce(new Error('boom'));
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar consumo' }));
    const dialog = screen.getByRole('dialog', { name: '¿Eliminar consumo?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('No se pudo eliminar el consumo'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('leaves consumptions linked to a skydiving activity read-only', () => {
    mockVoucherData = {
      voucher,
      consumptions: [
        makeConsumption({ transactionId: 1, description: 'Salto – Skydive Madrid', voucherUnits: 1 }),
        makeConsumption({ transactionId: 2, description: 'Saltos', voucherUnits: 3 }),
      ],
      unlinkedConsumptions: [2],
      reconcileActivityType: SKYDIVE_ACTIVITY_TYPE.JUMP,
    };
    renderModal();

    // Only the unlinked consumption (tx 2) can be edited or deleted here.
    expect(screen.getAllByRole('button', { name: 'Editar consumo' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Eliminar consumo' })).toHaveLength(1);
    expect(screen.getByText('Vinculado a una actividad de paracaidismo')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar consumo' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }));

    return waitFor(() => expect(mockDeleteMutateAsync).toHaveBeenCalledWith(2));
  });
});
