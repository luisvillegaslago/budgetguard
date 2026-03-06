/**
 * Component Tests: RecurringExpenseForm
 * Tests the form for creating/editing recurring expense rules
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { RecurringExpense } from '@/types/finance';

const mockCategories = [
  {
    categoryId: 1,
    name: 'Vivienda',
    type: 'expense',
    icon: 'home',
    color: '#EF4444',
    sortOrder: 1,
    isActive: true,
    parentCategoryId: null,
    defaultShared: true,
    defaultVatPercent: null,
    defaultDeductionPercent: null,
    subcategories: [],
  },
  {
    categoryId: 2,
    name: 'Suscripciones',
    type: 'expense',
    icon: 'tv',
    color: '#8B5CF6',
    sortOrder: 2,
    isActive: true,
    parentCategoryId: null,
    defaultShared: false,
    defaultVatPercent: null,
    defaultDeductionPercent: null,
    subcategories: [],
  },
];

const mockCreateMutateAsync = jest.fn();
const mockUpdateMutateAsync = jest.fn();

jest.mock('@/hooks/useRecurringExpenses', () => ({
  useCreateRecurringExpense: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
    isError: false,
  }),
  useUpdateRecurringExpense: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
    isError: false,
  }),
}));

jest.mock('@/hooks/useCategories', () => ({
  useCategoriesHierarchical: () => ({
    data: mockCategories,
    isLoading: false,
  }),
}));

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'recurring.form.title-create': 'Nuevo gasto recurrente',
        'recurring.form.title-edit': 'Editar gasto recurrente',
        'recurring.form.fields.amount': 'Monto (€)',
        'recurring.form.fields.description': 'Descripción',
        'recurring.form.fields.frequency': 'Frecuencia',
        'recurring.form.fields.start-date': 'Fecha inicio',
        'recurring.form.fields.end-date': 'Fecha fin',
        'recurring.form.fields.day-of-week': 'Día de la semana',
        'recurring.form.fields.day-of-month': 'Día del mes',
        'recurring.form.fields.month-of-year': 'Mes del año',
        'recurring.form.fields.shared': 'Gasto compartido (÷2)',
        'recurring.form.submit-create': 'Crear',
        'recurring.form.submit-edit': 'Guardar',
        'recurring.form.saving': 'Guardando...',
        'recurring.frequency.weekly': 'Semanal',
        'recurring.frequency.monthly': 'Mensual',
        'recurring.frequency.yearly': 'Anual',
        'recurring.days-of-week.0': 'D',
        'recurring.days-of-week.1': 'L',
        'recurring.days-of-week.2': 'M',
        'recurring.days-of-week.3': 'X',
        'recurring.days-of-week.4': 'J',
        'recurring.days-of-week.5': 'V',
        'recurring.days-of-week.6': 'S',
        'recurring.months.1': 'Enero',
        'recurring.months.2': 'Febrero',
        'recurring.months.3': 'Marzo',
        'recurring.months.4': 'Abril',
        'recurring.months.5': 'Mayo',
        'recurring.months.6': 'Junio',
        'recurring.months.7': 'Julio',
        'recurring.months.8': 'Agosto',
        'recurring.months.9': 'Septiembre',
        'recurring.months.10': 'Octubre',
        'recurring.months.11': 'Noviembre',
        'recurring.months.12': 'Diciembre',
        'transactions.form.fields.category': 'Categoría',
        'transactions.form.fields.subcategory': 'Subcategoría',
        'transactions.form.fields.shared-hint': 'Total: {total}, tu parte: {half}',
        'common.buttons.close': 'Cerrar',
        'common.labels.optional': 'opcional',
      };
      return translations[key] ?? key;
    },
    locale: 'es',
    setLocale: jest.fn(),
  }),
}));

jest.mock('@/utils/helpers', () => ({
  cn: (...args: unknown[]) => {
    const flatten = (_arr: unknown[]): string[] => {
      const result: string[] = [];
      args.forEach((item) => {
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
}));

jest.mock('@/utils/money', () => ({
  formatCurrency: (cents: number) => `${(cents / 100).toFixed(2)} €`,
  centsToEuros: (cents: number) => cents / 100,
  eurosToCents: (euros: number) => Math.round(euros * 100),
}));

jest.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => <span>Loading...</span>,
}));

jest.mock('@/components/ui/CategoryIcon', () => ({
  CategoryIcon: ({ icon }: { icon: string | null }) => <span data-testid="category-icon">{icon ?? 'default'}</span>,
}));

jest.mock('@/components/transactions/CategorySelector', () => ({
  CategorySelector: ({
    onCategoryChange,
    error,
  }: {
    type: string;
    onCategoryChange: (id: number) => void;
    onSharedDefaultChange: (shared: boolean) => void;
    error?: string;
    disabled?: boolean;
    initialCategoryId?: number;
  }) => (
    <div data-testid="category-selector">
      <select
        aria-label="Categoría"
        onChange={(e) => onCategoryChange(Number(e.target.value))}
        data-testid="category-select"
      >
        <option value="">Seleccionar</option>
        <option value="1">Vivienda</option>
        <option value="2">Suscripciones</option>
      </select>
      {error && <span role="alert">{error}</span>}
    </div>
  ),
}));

import { RecurringExpenseForm } from '@/components/recurring/RecurringExpenseForm';

describe('RecurringExpenseForm — Create mode', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
    mockCreateMutateAsync.mockClear();
    mockUpdateMutateAsync.mockClear();
  });

  it('should render create form with title', () => {
    render(<RecurringExpenseForm onClose={mockOnClose} />);

    expect(screen.getByText('Nuevo gasto recurrente')).toBeInTheDocument();
  });

  it('should show amount field', () => {
    render(<RecurringExpenseForm onClose={mockOnClose} />);

    expect(screen.getByLabelText('Monto (€)')).toBeInTheDocument();
  });

  it('should show frequency selector with 3 options', () => {
    render(<RecurringExpenseForm onClose={mockOnClose} />);

    expect(screen.getByText('Semanal')).toBeInTheDocument();
    expect(screen.getByText('Mensual')).toBeInTheDocument();
    expect(screen.getByText('Anual')).toBeInTheDocument();
  });

  it('should default to monthly frequency with day-of-month field', () => {
    render(<RecurringExpenseForm onClose={mockOnClose} />);

    expect(screen.getByLabelText('Día del mes')).toBeInTheDocument();
  });

  it('should show day-of-week buttons when weekly is selected', () => {
    render(<RecurringExpenseForm onClose={mockOnClose} />);

    const weeklyButton = screen.getByText('Semanal');
    fireEvent.click(weeklyButton);

    // Should show day abbreviation buttons
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('V')).toBeInTheDocument();
    expect(screen.getByText('S')).toBeInTheDocument();
  });

  it('should show month selector when yearly is selected', () => {
    render(<RecurringExpenseForm onClose={mockOnClose} />);

    const yearlyButton = screen.getByText('Anual');
    fireEvent.click(yearlyButton);

    expect(screen.getByLabelText('Mes del año')).toBeInTheDocument();
    expect(screen.getByLabelText('Día del mes')).toBeInTheDocument();
  });

  it('should show start date field', () => {
    render(<RecurringExpenseForm onClose={mockOnClose} />);

    expect(screen.getByLabelText('Fecha inicio')).toBeInTheDocument();
  });

  it('should show end date field', () => {
    render(<RecurringExpenseForm onClose={mockOnClose} />);

    // Label includes "(optional)" suffix
    expect(screen.getByLabelText(/Fecha fin/)).toBeInTheDocument();
  });

  it('should show close button that calls onClose', () => {
    render(<RecurringExpenseForm onClose={mockOnClose} />);

    const closeButton = screen.getByLabelText('Cerrar');
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should show create submit button', () => {
    render(<RecurringExpenseForm onClose={mockOnClose} />);

    expect(screen.getByText('Crear')).toBeInTheDocument();
  });

  it('should show shared checkbox', () => {
    render(<RecurringExpenseForm onClose={mockOnClose} />);

    expect(screen.getByLabelText(/Gasto compartido/)).toBeInTheDocument();
  });

  it('should show category selector', () => {
    render(<RecurringExpenseForm onClose={mockOnClose} />);

    expect(screen.getByTestId('category-selector')).toBeInTheDocument();
  });
});

describe('RecurringExpenseForm — Edit mode', () => {
  const mockOnClose = jest.fn();
  const existingExpense: RecurringExpense = {
    recurringExpenseId: 1,
    categoryId: 1,
    category: {
      categoryId: 1,
      name: 'Vivienda',
      type: 'expense',
      icon: 'home',
      color: '#EF4444',
      sortOrder: 1,
      isActive: true,
      parentCategoryId: null,
      defaultShared: true,
      defaultVatPercent: null,
      defaultDeductionPercent: null,
    },
    amountCents: 45000,
    description: 'Alquiler mensual',
    frequency: 'monthly',
    dayOfWeek: null,
    dayOfMonth: 1,
    monthOfYear: null,
    startDate: '2026-01-01',
    endDate: null,
    isActive: true,
    sharedDivisor: 1,
    originalAmountCents: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    mockOnClose.mockClear();
    mockUpdateMutateAsync.mockClear();
  });

  it('should render edit form with title', () => {
    render(<RecurringExpenseForm expense={existingExpense} onClose={mockOnClose} />);

    expect(screen.getByText('Editar gasto recurrente')).toBeInTheDocument();
  });

  it('should pre-fill amount in euros', () => {
    render(<RecurringExpenseForm expense={existingExpense} onClose={mockOnClose} />);

    const amountInput = screen.getByLabelText('Monto (€)') as HTMLInputElement;
    expect(amountInput.value).toBe('450');
  });

  it('should pre-fill description', () => {
    render(<RecurringExpenseForm expense={existingExpense} onClose={mockOnClose} />);

    const descInput = screen.getByLabelText(/Descripción/) as HTMLInputElement;
    expect(descInput.value).toBe('Alquiler mensual');
  });

  it('should pre-fill day of month', () => {
    render(<RecurringExpenseForm expense={existingExpense} onClose={mockOnClose} />);

    const dayInput = screen.getByLabelText('Día del mes') as HTMLInputElement;
    expect(dayInput.value).toBe('1');
  });

  it('should show save button instead of create', () => {
    render(<RecurringExpenseForm expense={existingExpense} onClose={mockOnClose} />);

    expect(screen.getByText('Guardar')).toBeInTheDocument();
    expect(screen.queryByText('Crear')).not.toBeInTheDocument();
  });
});
