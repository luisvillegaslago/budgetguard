/**
 * Component Tests: TransactionList — Shared Badge and Subcategory Breadcrumb
 * Tests that shared transactions display ÷2 badge and subcategory breadcrumbs
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { TRANSACTION_TYPE } from '@/constants/finance';
import type { Transaction } from '@/types/finance';

// Build mock transactions
const mockTransactions: Transaction[] = [
  {
    transactionId: 1,
    categoryId: 10,
    category: {
      categoryId: 10,
      name: 'Internet',
      type: TRANSACTION_TYPE.EXPENSE,
      icon: 'wifi',
      color: '#EF4444',
      sortOrder: 1,
      isActive: true,
      parentCategoryId: 1,
      defaultShared: true,
      defaultVatPercent: null,
      defaultDeductionPercent: null,
    },
    parentCategory: { categoryId: 1, name: 'Vivienda' },
    amountCents: 2500,
    description: 'Fibra optica',
    transactionDate: '2025-01-15',
    type: TRANSACTION_TYPE.EXPENSE,
    sharedDivisor: 2,
    originalAmountCents: 5000,
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
    createdAt: '2025-01-15T00:00:00Z',
    updatedAt: '2025-01-15T00:00:00Z',
  },
  {
    transactionId: 2,
    categoryId: 7,
    category: {
      categoryId: 7,
      name: 'Transporte',
      type: TRANSACTION_TYPE.EXPENSE,
      icon: 'car',
      color: '#14B8A6',
      sortOrder: 7,
      isActive: true,
      parentCategoryId: null,
      defaultShared: false,
      defaultVatPercent: null,
      defaultDeductionPercent: null,
    },
    parentCategory: null,
    amountCents: 4500,
    description: 'Gasolina',
    transactionDate: '2025-01-14',
    type: TRANSACTION_TYPE.EXPENSE,
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
    createdAt: '2025-01-14T00:00:00Z',
    updatedAt: '2025-01-14T00:00:00Z',
  },
];

// Mock hooks
jest.mock('@/hooks/useTransactions', () => ({
  useGroupedTransactions: () => ({
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    grouped: {
      ungrouped: mockTransactions,
      groups: [],
      tripGroups: [],
    },
  }),
  useDeleteTransaction: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
}));

jest.mock('@/hooks/useTransactionGroups', () => ({
  useDeleteTransactionGroup: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
}));

jest.mock('@/stores/useFinanceStore', () => ({
  useSelectedMonth: () => '2025-01',
  useFilters: () => ({ type: 'all', categoryId: null }),
}));

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'transactions.title': 'Transactions',
        'transactions.shared-badge': '÷2',
        'transactions.no-category': 'No category',
        'transactions.delete.button': 'Delete transaction',
        'transactions.delete.confirm': 'Confirm deletion',
        'common.records': `${params?.count ?? 0} records`,
      };
      return translations[key] ?? key;
    },
    locale: 'en',
    setLocale: jest.fn(),
  }),
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
    return `${d.getDate()} ${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][d.getMonth()]}`;
  },
}));

jest.mock('@/utils/money', () => ({
  formatCurrency: (cents: number) => `${(cents / 100).toFixed(2)} €`,
}));

jest.mock('@/components/ui/CategoryIcon', () => ({
  CategoryIcon: ({ icon }: { icon: string | null }) => <span data-testid="category-icon">{icon ?? 'default'}</span>,
}));

jest.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => <span>Loading...</span>,
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

import { TransactionList } from '@/components/transactions/TransactionList';

describe('TransactionList — Shared Badge', () => {
  it('should show shared badge for shared transactions', () => {
    render(<TransactionList />);

    // ÷2 appears in both desktop and mobile layouts for 1 shared transaction
    const badges = screen.getAllByText('÷2');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('should NOT show ÷2 badge for non-shared transactions', () => {
    render(<TransactionList />);

    // Only transaction 1 is shared — total badge count comes only from that transaction
    const badges = screen.getAllByText('÷2');
    // Desktop + mobile = 2 badges from the single shared transaction
    expect(badges).toHaveLength(2);
  });
});

describe('TransactionList — Subcategory Breadcrumb', () => {
  it('should show "Parent › Child" breadcrumb for subcategory transactions', () => {
    render(<TransactionList />);

    // Transaction 1 has parentCategory "Vivienda" and category "Internet"
    // Appears in both desktop and mobile layouts
    const breadcrumbs = screen.getAllByText('Vivienda › Internet');
    expect(breadcrumbs.length).toBeGreaterThanOrEqual(1);
  });

  it('should show plain category name for non-subcategory transactions', () => {
    render(<TransactionList />);

    // Transaction 2 has no parent, just "Transporte" — appears in both layouts
    const names = screen.getAllByText('Transporte');
    expect(names.length).toBeGreaterThanOrEqual(1);
  });
});

describe('TransactionList — Amount Display', () => {
  it('should display the effective (halved) amount for shared transactions', () => {
    const { container } = render(<TransactionList />);

    // Transaction 1: amountCents = 2500 → "25.00 €" inside the amount span
    expect(container.textContent).toContain('25.00 €');
  });

  it('should display the full amount for non-shared transactions', () => {
    const { container } = render(<TransactionList />);

    // Transaction 2: amountCents = 4500 → "45.00 €" inside the amount span
    expect(container.textContent).toContain('45.00 €');
  });
});
