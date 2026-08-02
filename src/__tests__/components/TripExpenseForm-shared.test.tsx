/**
 * Component Tests: TripExpenseForm shared default
 *
 * A trip flagged as shared must pre-check the shared (÷2) option for every new
 * expense, while keeping it editable. Editing an existing expense always reflects
 * the expense's own divisor, never the trip flag.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SHARED_EXPENSE, TRANSACTION_STATUS, TRANSACTION_TYPE } from '@/constants/finance';
import type { Category, Transaction } from '@/types/finance';

const mockCreate = jest.fn(async (_input: unknown) => ({ transactionId: 1 }));
const mockUpdate = jest.fn(async (_input: unknown) => ({ transactionId: 1 }));

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({ t: (key: string) => key, locale: 'es', setLocale: jest.fn() }),
}));

jest.mock('@/hooks/useTripExpenses', () => ({
  useCreateTripExpense: () => ({ mutateAsync: mockCreate, isPending: false, isError: false, errorMessage: null }),
  useUpdateTripExpense: () => ({ mutateAsync: mockUpdate, isPending: false, isError: false, errorMessage: null }),
}));

const tripCategory: Category = {
  categoryId: 15,
  name: 'Hotel',
  type: TRANSACTION_TYPE.EXPENSE,
  icon: 'bed',
  color: '#8B5CF6',
  sortOrder: 0,
  isActive: true,
  parentCategoryId: 5,
  defaultShared: false,
  defaultVatPercent: null,
  defaultDeductionPercent: null,
};

jest.mock('@/hooks/useTripCategories', () => ({
  useTripCategories: () => ({ data: [tripCategoryGetter()], isLoading: false }),
}));

const tripCategoryGetter = () => tripCategory;

jest.mock('@/components/ui/ModalBackdrop', () => ({
  ModalBackdrop: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));

import { TripExpenseForm } from '@/components/trips/TripExpenseForm';

const sharedCheckbox = () => screen.getByLabelText('trips.expense-form.fields.shared') as HTMLInputElement;

const existingSharedExpense = {
  transactionId: 100,
  categoryId: 15,
  category: tripCategory,
  parentCategory: { categoryId: 5, name: 'Viajes' },
  amountCents: 6000,
  description: 'Hotel 2 noches',
  transactionDate: '2025-10-15',
  type: TRANSACTION_TYPE.EXPENSE,
  status: TRANSACTION_STATUS.PAID,
  sharedDivisor: SHARED_EXPENSE.DIVISOR,
  originalAmountCents: 12000,
  recurringExpenseId: null,
  transactionGroupId: null,
  tripId: 1,
  tripName: 'Sierra Nevada 2025',
  vatPercent: null,
  deductionPercent: null,
  vendorName: null,
  invoiceNumber: null,
  companyId: null,
  fiscalDocumentId: null,
  voucherId: null,
  voucherUnits: null,
  createdAt: '2025-10-15T10:00:00.000Z',
  updatedAt: '2025-10-15T10:00:00.000Z',
} as unknown as Transaction;

describe('TripExpenseForm shared default', () => {
  beforeEach(() => {
    mockCreate.mockClear();
    mockUpdate.mockClear();
  });

  it('pre-checks the shared option for a new expense in a shared trip', () => {
    render(<TripExpenseForm tripId={1} onClose={jest.fn()} tripIsShared={true} />);

    expect(sharedCheckbox()).toBeChecked();
  });

  it('leaves the shared option unchecked in a non-shared trip', () => {
    render(<TripExpenseForm tripId={1} onClose={jest.fn()} tripIsShared={false} />);

    expect(sharedCheckbox()).not.toBeChecked();
  });

  it('leaves the shared option unchecked when the trip flag is omitted', () => {
    render(<TripExpenseForm tripId={1} onClose={jest.fn()} />);

    expect(sharedCheckbox()).not.toBeChecked();
  });

  it('submits isShared true from the pre-checked default', async () => {
    render(<TripExpenseForm tripId={1} onClose={jest.fn()} tripIsShared={true} />);

    fireEvent.change(screen.getByLabelText('trips.expense-form.fields.amount'), { target: { value: '120.5' } });
    fireEvent.click(screen.getByRole('button', { name: /Hotel/ }));
    fireEvent.click(screen.getByRole('button', { name: 'trips.expense-form.submit-create' }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0]?.[0]).toMatchObject({ categoryId: 15, amount: 120.5, isShared: true });
  });

  it('allows unchecking the pre-checked default before submitting', async () => {
    render(<TripExpenseForm tripId={1} onClose={jest.fn()} tripIsShared={true} />);

    fireEvent.change(screen.getByLabelText('trips.expense-form.fields.amount'), { target: { value: '120.5' } });
    fireEvent.click(screen.getByRole('button', { name: /Hotel/ }));
    fireEvent.click(sharedCheckbox());
    fireEvent.click(screen.getByRole('button', { name: 'trips.expense-form.submit-create' }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0]?.[0]).toMatchObject({ isShared: false });
    expect(sharedCheckbox()).not.toBeChecked();
  });

  it('uses the expense divisor when editing, ignoring the trip flag', () => {
    render(<TripExpenseForm tripId={1} onClose={jest.fn()} transaction={existingSharedExpense} tripIsShared={false} />);

    expect(sharedCheckbox()).toBeChecked();
  });
});
