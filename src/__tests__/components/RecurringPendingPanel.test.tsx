/**
 * Component Tests: RecurringPendingPanel
 * Tests the dashboard panel for pending recurring expense occurrences
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { OCCURRENCE_STATUS, RECURRING_FREQUENCY, TRANSACTION_TYPE } from '@/constants/finance';
import type { PendingOccurrencesSummary, RecurringOccurrence } from '@/types/finance';

const mockOccurrence: RecurringOccurrence = {
  occurrenceId: 1,
  recurringExpenseId: 10,
  occurrenceDate: '2026-03-01',
  status: OCCURRENCE_STATUS.PENDING,
  transactionId: null,
  modifiedAmountCents: null,
  processedAt: null,
  recurringExpense: {
    recurringExpenseId: 10,
    categoryId: 1,
    category: {
      categoryId: 1,
      name: 'Vivienda',
      type: TRANSACTION_TYPE.EXPENSE,
      icon: 'home',
      color: '#EF4444',
      sortOrder: 0,
      isActive: true,
      parentCategoryId: null,
      defaultShared: false,
      defaultVatPercent: null,
      defaultDeductionPercent: null,
    },
    amountCents: 45000,
    description: 'Alquiler',
    frequency: RECURRING_FREQUENCY.MONTHLY,
    dayOfWeek: null,
    dayOfMonth: 1,
    monthOfYear: null,
    startDate: '2026-01-01',
    endDate: null,
    isActive: true,
    sharedDivisor: 1,
    originalAmountCents: null,
    vatPercent: null,
    deductionPercent: null,
    vendorName: null,
    companyId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
};

const mockOccurrence2: RecurringOccurrence = {
  ...mockOccurrence,
  occurrenceId: 2,
  occurrenceDate: '2026-03-01',
  recurringExpense: {
    ...mockOccurrence.recurringExpense,
    recurringExpenseId: 11,
    categoryId: 2,
    category: {
      categoryId: 2,
      name: 'Suscripciones',
      type: TRANSACTION_TYPE.EXPENSE,
      icon: 'tv',
      color: '#8B5CF6',
      sortOrder: 2,
      isActive: true,
      parentCategoryId: null,
      defaultShared: false,
      defaultVatPercent: null,
      defaultDeductionPercent: null,
    },
    amountCents: 1599,
    description: 'Netflix',
  },
};

const mockSummary: PendingOccurrencesSummary = {
  months: [
    {
      month: '2026-03',
      occurrences: [mockOccurrence, mockOccurrence2],
      totalPendingCents: 46599,
      count: 2,
    },
  ],
  totalCount: 2,
};

const mockMultiMonthSummary: PendingOccurrencesSummary = {
  months: [
    {
      month: '2026-02',
      occurrences: [{ ...mockOccurrence, occurrenceId: 3, occurrenceDate: '2026-02-01' }],
      totalPendingCents: 45000,
      count: 1,
    },
    {
      month: '2026-03',
      occurrences: [mockOccurrence],
      totalPendingCents: 45000,
      count: 1,
    },
  ],
  totalCount: 2,
};

const mockConfirmMutate = jest.fn();
const mockSkipMutate = jest.fn();
const mockConfirmAllMutate = jest.fn();
let currentMockData: PendingOccurrencesSummary | undefined = mockSummary;
let mockIsCollapsed = false;
const mockTogglePanel = jest.fn();

jest.mock('@/hooks/usePendingOccurrences', () => ({
  usePendingOccurrences: () => ({
    data: currentMockData,
    isLoading: false,
  }),
  useConfirmOccurrence: () => ({
    mutate: mockConfirmMutate,
    isPending: false,
  }),
  useSkipOccurrence: () => ({
    mutate: mockSkipMutate,
    isPending: false,
  }),
  useConfirmAllOccurrences: () => ({
    mutate: mockConfirmAllMutate,
    isPending: false,
  }),
}));

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'recurring.pending.title': 'Gastos recurrentes pendientes',
        'recurring.pending.count': `(${params?.count ?? 0})`,
        'recurring.pending.confirm': 'Confirmar',
        'recurring.pending.skip': 'Omitir',
        'recurring.pending.modify': 'Modificar',
        'recurring.pending.modified-amount': 'Monto modificado',
        'recurring.pending.confirm-all': `Confirmar todos (${params?.count ?? 0})`,
        'recurring.pending.confirm-all-month': `Confirmar todos de ${params?.month ?? ''}`,
        'recurring.pending.processing': 'Procesando...',
        'recurring.months.2': 'Febrero',
        'recurring.months.3': 'Marzo',
        'common.buttons.cancel': 'Cancelar',
      };
      return translations[key] ?? key;
    },
    locale: 'es',
    setLocale: jest.fn(),
  }),
}));

jest.mock('@/stores/useFinanceStore', () => ({
  useIsRecurringPanelCollapsed: () => mockIsCollapsed,
  useToggleRecurringPanel: () => mockTogglePanel,
}));

jest.mock('@/utils/helpers', () => ({
  cn: (...args: unknown[]) => {
    const flatten = (arr: unknown[]): string[] => {
      const result: string[] = [];
      arr.forEach((item) => {
        if (typeof item === 'string') result.push(item);
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          Object.entries(item as Record<string, boolean>).forEach(([key, val]) => {
            if (val) result.push(key);
          });
        }
      });
      return result;
    };
    return flatten(args).join(' ');
  },
  formatDate: (date: string) => {
    const d = new Date(date);
    return `${d.getDate()} mar`;
  },
}));

jest.mock('@/utils/money', () => ({
  formatCurrency: (cents: number) => `${(cents / 100).toFixed(2)} €`,
  centsToEuros: (cents: number) => cents / 100,
}));

jest.mock('@/components/ui/CategoryIcon', () => ({
  CategoryIcon: ({ icon }: { icon: string | null }) => <span data-testid="category-icon">{icon ?? 'default'}</span>,
}));

jest.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => <span>Loading...</span>,
}));

import { RecurringPendingPanel } from '@/components/recurring/RecurringPendingPanel';

describe('RecurringPendingPanel', () => {
  beforeEach(() => {
    mockConfirmMutate.mockClear();
    mockSkipMutate.mockClear();
    mockConfirmAllMutate.mockClear();
    mockTogglePanel.mockClear();
    currentMockData = mockSummary;
    mockIsCollapsed = false;
  });

  it('should render panel with pending count', () => {
    render(<RecurringPendingPanel />);

    expect(screen.getByText(/Gastos recurrentes pendientes/)).toBeInTheDocument();
  });

  it('should render nothing when no pending occurrences', () => {
    currentMockData = { months: [], totalCount: 0 };
    const { container } = render(<RecurringPendingPanel />);

    expect(container.firstChild).toBeNull();
  });

  it('should render nothing when data is undefined', () => {
    currentMockData = undefined;
    const { container } = render(<RecurringPendingPanel />);

    expect(container.firstChild).toBeNull();
  });

  it('should show category names for occurrences', () => {
    render(<RecurringPendingPanel />);

    expect(screen.getByText('Vivienda')).toBeInTheDocument();
    expect(screen.getByText('Suscripciones')).toBeInTheDocument();
  });

  it('should show amounts for each occurrence', () => {
    const { container } = render(<RecurringPendingPanel />);

    expect(container.textContent).toContain('450.00 €');
    expect(container.textContent).toContain('15.99 €');
  });

  it('should show confirm and skip buttons for each occurrence', () => {
    render(<RecurringPendingPanel />);

    const confirmButtons = screen.getAllByText('Confirmar');
    const skipButtons = screen.getAllByText('Omitir');

    expect(confirmButtons.length).toBeGreaterThanOrEqual(2);
    expect(skipButtons.length).toBeGreaterThanOrEqual(2);
  });

  it('should call confirmMutation when confirm is clicked', () => {
    render(<RecurringPendingPanel />);

    const confirmButtons = screen.getAllByLabelText('Confirmar');
    fireEvent.click(confirmButtons[0]!);

    expect(mockConfirmMutate).toHaveBeenCalledWith(
      { occurrenceId: 1 },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('should call skipMutation when skip is clicked', () => {
    render(<RecurringPendingPanel />);

    const skipButtons = screen.getAllByLabelText('Omitir');
    fireEvent.click(skipButtons[0]!);

    expect(mockSkipMutate).toHaveBeenCalledWith(1);
  });

  it('should toggle panel when header is clicked', () => {
    render(<RecurringPendingPanel />);

    const header = screen.getByRole('button', { expanded: true });
    fireEvent.click(header);

    expect(mockTogglePanel).toHaveBeenCalled();
  });

  it('should not show content when collapsed', () => {
    mockIsCollapsed = true;
    render(<RecurringPendingPanel />);

    // Header should still be visible
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument();
    // Content is hidden via CSS (gridTemplateRows: 0fr), not removed from DOM
    // Verify the panel is visually collapsed via grid style
    const contentGrid = screen.getByRole('button', { expanded: false }).nextElementSibling as HTMLElement;
    expect(contentGrid.style.gridTemplateRows).toBe('0fr');
  });

  it('should show confirm-all button when multiple months exist', () => {
    currentMockData = mockMultiMonthSummary;
    render(<RecurringPendingPanel />);

    expect(screen.getByText('Confirmar todos (2)')).toBeInTheDocument();
  });

  it('should not show global confirm-all when only one month', () => {
    render(<RecurringPendingPanel />);

    // Only per-month buttons exist, no global "Confirmar todos (N)"
    expect(screen.queryByText('Confirmar todos (2)')).not.toBeInTheDocument();
  });

  it('should show month sections with labels', () => {
    currentMockData = mockMultiMonthSummary;
    render(<RecurringPendingPanel />);

    expect(screen.getByText(/Febrero 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Marzo 2026/)).toBeInTheDocument();
  });

  it('should show modify button for each occurrence', () => {
    render(<RecurringPendingPanel />);

    // Each occurrence has desktop + mobile modify buttons (hidden via CSS)
    const modifyButtons = screen.getAllByLabelText('Modificar');
    expect(modifyButtons).toHaveLength(4);
  });

  it('should show input field when modify is clicked', () => {
    render(<RecurringPendingPanel />);

    const modifyButtons = screen.getAllByLabelText('Modificar');
    fireEvent.click(modifyButtons[0]!);

    // Both desktop and mobile inputs render (hidden via CSS), so use getAllByLabelText
    const inputs = screen.getAllByLabelText('Monto modificado');
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });
});
