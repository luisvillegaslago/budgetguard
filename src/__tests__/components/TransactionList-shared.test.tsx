/**
 * Component Tests: TransactionList — Shared Badge and Subcategory Breadcrumb
 * Tests that shared transactions display ÷2 badge and subcategory breadcrumbs
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { Transaction } from '@/types/finance';

// Build mock transactions
const mockTransactions: Transaction[] = [
  {
    transactionId: 1,
    categoryId: 10,
    category: {
      categoryId: 10,
      name: 'Internet',
      type: 'expense',
      icon: 'wifi',
      color: '#EF4444',
      sortOrder: 1,
      isActive: true,
      parentCategoryId: 1,
      defaultShared: true,
    },
    parentCategory: { categoryId: 1, name: 'Vivienda' },
    amountCents: 2500,
    description: 'Fibra optica',
    transactionDate: '2025-01-15',
    type: 'expense',
    sharedDivisor: 2,
    originalAmountCents: 5000,
    recurringExpenseId: null,
    transactionGroupId: null,
    tripId: null,
    tripName: null,
    createdAt: '2025-01-15T00:00:00Z',
    updatedAt: '2025-01-15T00:00:00Z',
  },
  {
    transactionId: 2,
    categoryId: 7,
    category: {
      categoryId: 7,
      name: 'Transporte',
      type: 'expense',
      icon: 'car',
      color: '#14B8A6',
      sortOrder: 7,
      isActive: true,
      parentCategoryId: null,
      defaultShared: false,
    },
    parentCategory: null,
    amountCents: 4500,
    description: 'Gasolina',
    transactionDate: '2025-01-14',
    type: 'expense',
    sharedDivisor: 1,
    originalAmountCents: null,
    recurringExpenseId: null,
    transactionGroupId: null,
    tripId: null,
    tripName: null,
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

import { TransactionList } from '@/components/transactions/TransactionList';

describe('TransactionList — Shared Badge', () => {
  it('should show ÷2 badge for shared transactions', () => {
    render(<TransactionList />);

    const badges = screen.getAllByText('÷2');
    expect(badges).toHaveLength(1); // Only transaction 1 is shared
  });

  it('should NOT show ÷2 badge for non-shared transactions', () => {
    render(<TransactionList />);

    // There should be exactly 1 badge (for the shared transaction)
    const badges = screen.getAllByText('÷2');
    expect(badges).toHaveLength(1);
  });
});

describe('TransactionList — Subcategory Breadcrumb', () => {
  it('should show "Parent › Child" breadcrumb for subcategory transactions', () => {
    render(<TransactionList />);

    // Transaction 1 has parentCategory "Vivienda" and category "Internet"
    expect(screen.getByText('Vivienda › Internet')).toBeInTheDocument();
  });

  it('should show plain category name for non-subcategory transactions', () => {
    render(<TransactionList />);

    // Transaction 2 has no parent, just "Transporte"
    expect(screen.getByText('Transporte')).toBeInTheDocument();
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
