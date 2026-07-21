/**
 * Integration Tests: VoucherDetailModal — quick-consume flow
 * Covers the "Usar bono" action that logs an expense transaction linked to the
 * voucher: default date (today) + default 1 unit, prorated amount, editable
 * units, and the unit-less voucher fallback (raw amount input).
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TRANSACTION_STATUS, TRANSACTION_TYPE } from '@/constants/finance';
import type { Voucher } from '@/types/finance';

// Unit-based voucher: 280,00 € over 8 "clases" → 35,00 € per class.
const unitVoucher: Voucher = {
  voucherId: 42,
  categoryId: 5,
  categoryName: 'Padel',
  categoryIcon: null,
  categoryColor: null,
  description: '8 clases Iberiamart',
  totalAmountCents: 28000,
  totalUnits: 8,
  unitLabel: 'clases',
  purchaseDate: '2026-05-27',
  expiryDate: null,
  consumedCents: 21000,
  remainingCents: 7000,
  consumedUnits: 6,
  consumptionCount: 6,
  createdAt: '2026-05-27T00:00:00Z',
  updatedAt: '2026-05-27T00:00:00Z',
};

// Unit-less voucher: amount-only balance (no units → raw amount input).
const amountVoucher: Voucher = {
  ...unitVoucher,
  voucherId: 99,
  description: 'Bono saldo libre',
  totalUnits: null,
  unitLabel: null,
};

let mockVoucherData: { voucher: Voucher; consumptions: never[] } = {
  voucher: unitVoucher,
  consumptions: [],
};

const mockCreateMutateAsync = jest.fn();
const mockDeleteMutateAsync = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();

jest.mock('@/hooks/useVouchers', () => ({
  useVoucher: () => ({
    data: mockVoucherData,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useDeleteVoucher: () => ({
    mutateAsync: mockDeleteMutateAsync,
    isPending: false,
    errorMessage: null,
  }),
  useReconcileVoucherConsumption: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
    errorMessage: null,
  }),
}));

jest.mock('@/hooks/useTransactions', () => ({
  useCreateTransaction: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
    errorMessage: null,
  }),
}));

const DICT: Record<string, string> = {
  'vouchers.detail.title': 'Detalle del bono',
  'vouchers.untitled': 'Bono',
  'vouchers.remaining': 'Saldo restante',
  'vouchers.consumed-of-total': '{consumed} de {total}',
  'vouchers.purchased': 'Comprado',
  'vouchers.consumptions': 'Consumos',
  'vouchers.no-consumptions': 'Todavía no hay consumos de este bono',
  'vouchers.use.button': 'Usar bono',
  'vouchers.use.title': 'Registrar consumo',
  'vouchers.use.date': 'Fecha',
  'vouchers.use.units': 'Unidades a consumir',
  'vouchers.use.amount': 'Importe (€)',
  'vouchers.use.amount-placeholder': '0,00',
  'vouchers.use.amount-preview': 'Importe del consumo: {amount}',
  'vouchers.use.submit': 'Registrar consumo',
  'vouchers.use.saving': 'Registrando...',
  'vouchers.use.success': 'Consumo registrado',
  'vouchers.use.error': 'No se pudo registrar el consumo',
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

jest.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
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

describe('VoucherDetailModal — quick-consume flow', () => {
  const mockOnClose = jest.fn();
  const mockOnEdit = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockVoucherData = { voucher: unitVoucher, consumptions: [] };
    mockCreateMutateAsync.mockResolvedValue({});
  });

  const renderModal = () => render(<VoucherDetailModal voucherId={42} onClose={mockOnClose} onEdit={mockOnEdit} />);

  const usarBonoButton = () => screen.getByRole('button', { name: 'Usar bono' });
  const submitButton = () => screen.getByRole('button', { name: 'Registrar consumo' });
  const querySubmitButton = () => screen.queryByRole('button', { name: 'Registrar consumo' });

  it('shows the "Usar bono" button and hides the consume form initially', () => {
    renderModal();

    expect(usarBonoButton()).toBeInTheDocument();
    expect(querySubmitButton()).not.toBeInTheDocument();
  });

  it('reveals the consume form with date (today) and 1 unit pre-filled', () => {
    renderModal();

    fireEvent.click(usarBonoButton());

    const dateInput = screen.getByLabelText('Fecha') as HTMLInputElement;
    const unitsInput = screen.getByLabelText(/Unidades a consumir/) as HTMLInputElement;
    const today = new Date().toISOString().split('T')[0];

    expect(dateInput.value).toBe(today);
    expect(unitsInput.value).toBe('1');
  });

  it('prorates the amount preview from the unit price and updates on change', () => {
    renderModal();
    fireEvent.click(usarBonoButton());

    // 1 class * (280,00 € / 8) = 35,00 €
    expect(screen.getByText('Importe del consumo: 35.00 €')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Unidades a consumir/), { target: { value: '2' } });

    expect(screen.getByText('Importe del consumo: 70.00 €')).toBeInTheDocument();
  });

  it('creates a linked expense transaction with the correct payload on submit', async () => {
    renderModal();
    fireEvent.click(usarBonoButton());

    const today = (screen.getByLabelText('Fecha') as HTMLInputElement).value;
    fireEvent.click(submitButton());

    await waitFor(() => expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1));

    expect(mockCreateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: 5,
        amount: 35,
        description: '',
        type: TRANSACTION_TYPE.EXPENSE,
        isShared: false,
        status: TRANSACTION_STATUS.PAID,
        voucherId: 42,
        voucherUnits: 1,
      }),
    );

    const payload = mockCreateMutateAsync.mock.calls[0][0];
    expect(payload.transactionDate).toBeInstanceOf(Date);
    expect((payload.transactionDate as Date).toISOString()).toBe(`${today}T00:00:00.000Z`);
  });

  it('shows a success toast and closes the form after submit', async () => {
    renderModal();
    fireEvent.click(usarBonoButton());
    fireEvent.click(submitButton());

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Consumo registrado'));

    // Form collapses back to the "Usar bono" button.
    expect(usarBonoButton()).toBeInTheDocument();
    expect(querySubmitButton()).not.toBeInTheDocument();
  });

  it('uses a custom unit amount when the units are changed before submitting', async () => {
    renderModal();
    fireEvent.click(usarBonoButton());

    fireEvent.change(screen.getByLabelText(/Unidades a consumir/), { target: { value: '3' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1));

    expect(mockCreateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 105, // 3 * 35,00 €
        voucherUnits: 3,
      }),
    );
  });

  it('surfaces an error toast and keeps the form open when creation fails', async () => {
    mockCreateMutateAsync.mockRejectedValueOnce(new Error('boom'));
    renderModal();
    fireEvent.click(usarBonoButton());
    fireEvent.click(submitButton());

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('No se pudo registrar el consumo'));

    expect(submitButton()).toBeInTheDocument();
  });

  it('cancelling the consume form returns to the action buttons', () => {
    renderModal();
    fireEvent.click(usarBonoButton());
    expect(submitButton()).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(querySubmitButton()).not.toBeInTheDocument();
    expect(usarBonoButton()).toBeInTheDocument();
  });

  describe('unit-less voucher', () => {
    beforeEach(() => {
      mockVoucherData = { voucher: amountVoucher, consumptions: [] };
    });

    it('asks for a raw amount instead of units and submits it', async () => {
      render(<VoucherDetailModal voucherId={99} onClose={mockOnClose} onEdit={mockOnEdit} />);
      fireEvent.click(usarBonoButton());

      expect(screen.getByLabelText('Importe (€)')).toBeInTheDocument();
      expect(screen.queryByLabelText(/Unidades a consumir/)).not.toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Importe (€)'), { target: { value: '50' } });
      fireEvent.click(submitButton());

      await waitFor(() => expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1));

      expect(mockCreateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: 5,
          amount: 50,
          voucherId: 99,
          voucherUnits: null,
        }),
      );
    });
  });
});
