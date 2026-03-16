/**
 * Component Tests: TripGroupRow
 * Tests collapsible trip row display: collapsed state, expand/collapse,
 * badge, amounts, expense count, shared badges, and detail link
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { SHARED_EXPENSE, TRANSACTION_TYPE } from '@/constants/finance';
import type { Transaction, TripGroupDisplay } from '@/types/finance';

// Mock useTranslate
jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'transactions.trip-group.expenses': `${params?.count ?? 0} gastos`,
        'transactions.trip-group.expand': 'Expandir viaje',
        'transactions.trip-group.collapse': 'Contraer viaje',
        'transactions.trip-group.view-detail': 'Ver detalle',
        'transactions.groups.badge': 'Agrupado',
        'trips.badge': 'Viaje',
        'transactions.shared-badge': '÷2',
        'transactions.no-category': 'Sin categoría',
      };
      return translations[key] ?? key;
    },
    locale: 'es',
    setLocale: jest.fn(),
  }),
}));

// Mock helpers
jest.mock('@/utils/helpers', () => ({
  cn: (...args: unknown[]) => {
    const result: string[] = [];
    args.forEach((item) => {
      if (typeof item === 'string') result.push(item);
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        Object.entries(item as Record<string, boolean>).forEach(([key, val]) => {
          if (val) result.push(key);
        });
      }
    });
    return result.join(' ');
  },
  formatDate: (date: string) => {
    const d = new Date(date);
    return `${d.getDate()} oct`;
  },
}));

// Mock money utils
jest.mock('@/utils/money', () => ({
  formatCurrency: (cents: number) => `${(cents / 100).toFixed(2)} €`,
}));

// Mock CategoryIcon
jest.mock('@/components/ui/CategoryIcon', () => ({
  CategoryIcon: ({ icon }: { icon: string | null }) => <span data-testid="category-icon">{icon ?? 'default'}</span>,
}));

// Mock Tooltip to render content as visible text (Radix Portal not available in JSDOM)
jest.mock('@/components/ui/Tooltip', () => ({
  Tooltip: ({ content, children }: { content: string; children: React.ReactNode }) => (
    <span>
      {children}
      <span data-testid="tooltip-content">{content}</span>
    </span>
  ),
}));

jest.mock('@/components/ui/OverflowTooltip', () => ({
  OverflowTooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock next/link
jest.mock('next/link', () => {
  return ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>
      {children}
    </a>
  );
});

import { TripGroupRow } from '@/components/transactions/TripGroupRow';

// Build mock trip group
const mockTransactions: Transaction[] = [
  {
    transactionId: 100,
    categoryId: 15,
    category: {
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
    },
    parentCategory: { categoryId: 5, name: 'Viajes' },
    amountCents: 6000,
    description: 'Hotel 2 noches',
    transactionDate: '2025-10-15',
    type: TRANSACTION_TYPE.EXPENSE,
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
    createdAt: '2025-10-15T10:00:00.000Z',
    updatedAt: '2025-10-15T10:00:00.000Z',
  },
  {
    transactionId: 101,
    categoryId: 16,
    category: {
      categoryId: 16,
      name: 'Gasolina',
      type: TRANSACTION_TYPE.EXPENSE,
      icon: 'fuel',
      color: '#F59E0B',
      sortOrder: 1,
      isActive: true,
      parentCategoryId: 5,
      defaultShared: false,
      defaultVatPercent: null,
      defaultDeductionPercent: null,
    },
    parentCategory: { categoryId: 5, name: 'Viajes' },
    amountCents: 4500,
    description: 'Repsol autopista',
    transactionDate: '2025-10-16',
    type: TRANSACTION_TYPE.EXPENSE,
    sharedDivisor: SHARED_EXPENSE.DEFAULT_DIVISOR,
    originalAmountCents: null,
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
    createdAt: '2025-10-16T10:00:00.000Z',
    updatedAt: '2025-10-16T10:00:00.000Z',
  },
];

const mockTripGroup: TripGroupDisplay = {
  tripId: 1,
  tripName: 'Sierra Nevada 2025',
  startDate: '2025-10-15',
  totalAmountCents: 10500,
  type: TRANSACTION_TYPE.EXPENSE,
  transactions: mockTransactions,
};

/** Helper: click the first expand button (desktop layout) */
function clickExpand() {
  const buttons = screen.getAllByLabelText('Expandir viaje');
  expect(buttons.length).toBeGreaterThanOrEqual(1);
  fireEvent.click(buttons[0] as HTMLElement);
}

/** Helper: click the first collapse button (desktop layout) */
function clickCollapse() {
  const buttons = screen.getAllByLabelText('Contraer viaje');
  expect(buttons.length).toBeGreaterThanOrEqual(1);
  fireEvent.click(buttons[0] as HTMLElement);
}

// ============================
// Collapsed State
// ============================
describe('TripGroupRow — Collapsed State', () => {
  it('should display trip name', () => {
    render(<TripGroupRow tripGroup={mockTripGroup} index={0} />);
    expect(screen.getAllByText('Sierra Nevada 2025').length).toBeGreaterThanOrEqual(1);
  });

  it('should display expense count', () => {
    render(<TripGroupRow tripGroup={mockTripGroup} index={0} />);
    // Text is embedded within a parent alongside date: "15 oct · 2 gastos"
    expect(screen.getAllByText(/2 gastos/).length).toBeGreaterThanOrEqual(1);
  });

  it('should display grouped badge', () => {
    render(<TripGroupRow tripGroup={mockTripGroup} index={0} />);
    expect(screen.getByText('Agrupado')).toBeInTheDocument();
  });

  it('should display total amount', () => {
    const { container } = render(<TripGroupRow tripGroup={mockTripGroup} index={0} />);
    expect(container.textContent).toContain('105.00 €');
  });

  it('should show expand button with correct aria label', () => {
    render(<TripGroupRow tripGroup={mockTripGroup} index={0} />);
    // Desktop + mobile both have expand buttons
    const buttons = screen.getAllByLabelText('Expandir viaje');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('should have link to trip detail page', () => {
    render(<TripGroupRow tripGroup={mockTripGroup} index={0} />);
    const link = screen.getByLabelText('Ver detalle');
    expect(link).toHaveAttribute('href', '/trips/1?from=dashboard');
  });

  it('should NOT show individual expenses when collapsed', () => {
    render(<TripGroupRow tripGroup={mockTripGroup} index={0} />);
    expect(screen.queryByText('Hotel 2 noches')).not.toBeInTheDocument();
  });
});

// ============================
// Expand / Collapse
// ============================
describe('TripGroupRow — Expand/Collapse', () => {
  it('should expand when clicking the chevron button', () => {
    render(<TripGroupRow tripGroup={mockTripGroup} index={0} />);

    clickExpand();

    // Individual expenses should now be visible (desktop + mobile layouts)
    expect(screen.getAllByText(/Hotel 2 noches/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Repsol autopista/).length).toBeGreaterThanOrEqual(1);
  });

  it('should collapse when clicking the chevron again', () => {
    render(<TripGroupRow tripGroup={mockTripGroup} index={0} />);

    // Expand
    clickExpand();
    expect(screen.getAllByText(/Hotel 2 noches/).length).toBeGreaterThanOrEqual(1);

    // Collapse
    clickCollapse();
    expect(screen.queryByText(/Hotel 2 noches/)).not.toBeInTheDocument();
  });

  it('should show category breadcrumbs when expanded', () => {
    const { container } = render(<TripGroupRow tripGroup={mockTripGroup} index={0} />);
    clickExpand();

    // Should show "Parent › Child" format — appears in both desktop and mobile
    expect(container.textContent).toContain('Viajes › Hotel');
    expect(container.textContent).toContain('Viajes › Gasolina');
  });

  it('should show shared badge for shared expenses when expanded', () => {
    render(<TripGroupRow tripGroup={mockTripGroup} index={0} />);
    clickExpand();

    // Transaction 100 is shared (sharedDivisor = 2), transaction 101 is not
    const badges = screen.getAllByText('÷2');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('should display individual expense amounts when expanded', () => {
    const { container } = render(<TripGroupRow tripGroup={mockTripGroup} index={0} />);
    clickExpand();

    // Transaction 100: 6000 cents → "60.00 €"
    // Transaction 101: 4500 cents → "45.00 €"
    expect(container.textContent).toContain('60.00 €');
    expect(container.textContent).toContain('45.00 €');
  });
});

// ============================
// Edit Callback
// ============================
describe('TripGroupRow — Edit Callback', () => {
  it('should call onEditTransaction when clicking an expanded expense', () => {
    const onEdit = jest.fn();
    render(<TripGroupRow tripGroup={mockTripGroup} onEditTransaction={onEdit} index={0} />);

    // Expand
    clickExpand();

    // Click the first expense row (contains "Hotel 2 noches")
    const hotelRow = (screen.getAllByText(/Hotel 2 noches/)[0] as HTMLElement).closest('[class*="cursor-pointer"]');
    if (hotelRow) {
      fireEvent.click(hotelRow);
    }

    expect(onEdit).toHaveBeenCalledWith(mockTransactions[0]);
  });
});
