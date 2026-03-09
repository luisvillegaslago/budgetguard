/**
 * Component Tests: CategoryTree
 * Tests hierarchical rendering, expand/collapse, action callbacks,
 * and visual states (inactive, shared badges)
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import { TRANSACTION_TYPE } from '@/constants/finance';
import type { Category } from '@/types/finance';

const mockCategories: Category[] = [
  {
    categoryId: 1,
    name: 'Vivienda',
    type: TRANSACTION_TYPE.EXPENSE,
    icon: 'home',
    color: '#EF4444',
    sortOrder: 1,
    isActive: true,
    parentCategoryId: null,
    defaultShared: true,
    defaultVatPercent: null,
    defaultDeductionPercent: null,
    subcategories: [
      {
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
      {
        categoryId: 11,
        name: 'Luz',
        type: TRANSACTION_TYPE.EXPENSE,
        icon: 'zap',
        color: '#EF4444',
        sortOrder: 2,
        isActive: false,
        parentCategoryId: 1,
        defaultShared: false,
        defaultVatPercent: null,
        defaultDeductionPercent: null,
      },
    ],
  },
  {
    categoryId: 2,
    name: 'Nomina',
    type: TRANSACTION_TYPE.INCOME,
    icon: 'banknote',
    color: '#10B981',
    sortOrder: 1,
    isActive: true,
    parentCategoryId: null,
    defaultShared: false,
    defaultVatPercent: null,
    defaultDeductionPercent: null,
    subcategories: [],
  },
  {
    categoryId: 3,
    name: 'Obsoleta',
    type: TRANSACTION_TYPE.EXPENSE,
    icon: null,
    color: null,
    sortOrder: 3,
    isActive: false,
    parentCategoryId: null,
    defaultShared: false,
    defaultVatPercent: null,
    defaultDeductionPercent: null,
    subcategories: [],
  },
];

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'dashboard.category-breakdown.expand': 'Expand subcategories',
        'dashboard.category-breakdown.collapse': 'Collapse subcategories',
        'category-management.badges.inactive': 'Inactive',
        'category-management.badges.shared': 'Shared',
        'category-management.filter.income': 'Income',
        'category-management.filter.expense': 'Expenses',
        'category-management.actions.edit': 'Edit',
        'category-management.actions.delete': 'Delete',
        'category-management.actions.activate': 'Activate',
        'category-management.actions.deactivate': 'Deactivate',
        'category-management.actions.add-subcategory': 'Add subcategory',
      };
      return translations[key] ?? key;
    },
    locale: 'en',
    setLocale: jest.fn(),
  }),
}));

jest.mock('@/utils/helpers', () => ({
  cn: (...args: (string | boolean | undefined | null)[]) => args.filter((a) => typeof a === 'string').join(' '),
}));

jest.mock('@/components/ui/CategoryIcon', () => ({
  CATEGORY_ICON_MAP: {},
  CategoryIcon: ({ icon }: { icon: string | null }) => <span data-testid="category-icon">{icon ?? 'default'}</span>,
}));

import { CategoryTree } from '@/components/categories/CategoryTree';

describe('CategoryTree', () => {
  const mockOnEdit = jest.fn();
  const mockOnDelete = jest.fn();
  const mockOnToggleActive = jest.fn();
  const mockOnAddSubcategory = jest.fn();

  const defaultProps = {
    categories: mockCategories,
    onEdit: mockOnEdit,
    onDelete: mockOnDelete,
    onToggleActive: mockOnToggleActive,
    onAddSubcategory: mockOnAddSubcategory,
  };

  beforeEach(() => {
    mockOnEdit.mockClear();
    mockOnDelete.mockClear();
    mockOnToggleActive.mockClear();
    mockOnAddSubcategory.mockClear();
  });

  it('should render all parent categories', () => {
    render(<CategoryTree {...defaultProps} />);

    expect(screen.getByText('Vivienda')).toBeInTheDocument();
    expect(screen.getByText('Nomina')).toBeInTheDocument();
    expect(screen.getByText('Obsoleta')).toBeInTheDocument();
  });

  it('should NOT render subcategories initially (collapsed)', () => {
    render(<CategoryTree {...defaultProps} />);

    expect(screen.queryByText('Internet')).not.toBeInTheDocument();
    expect(screen.queryByText('Luz')).not.toBeInTheDocument();
  });

  it('should show subcategories when parent expand button is clicked', () => {
    render(<CategoryTree {...defaultProps} />);

    // Click the expand button for Vivienda
    const expandButton = screen.getAllByLabelText('Expand subcategories')[0]!;
    fireEvent.click(expandButton);

    expect(screen.getByText('Internet')).toBeInTheDocument();
    expect(screen.getByText('Luz')).toBeInTheDocument();
  });

  it('should hide subcategories when collapse button is clicked', () => {
    render(<CategoryTree {...defaultProps} />);

    // Expand
    const expandButton = screen.getAllByLabelText('Expand subcategories')[0]!;
    fireEvent.click(expandButton);
    expect(screen.getByText('Internet')).toBeInTheDocument();

    // Collapse
    const collapseButton = screen.getByLabelText('Collapse subcategories');
    fireEvent.click(collapseButton);
    expect(screen.queryByText('Internet')).not.toBeInTheDocument();
  });

  it('should show "Inactive" badge for inactive categories', () => {
    render(<CategoryTree {...defaultProps} />);

    const inactiveBadges = screen.getAllByText('Inactive');
    // Obsoleta is inactive at parent level
    expect(inactiveBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('should show "Shared" badge for defaultShared categories', () => {
    render(<CategoryTree {...defaultProps} />);

    const sharedBadges = screen.getAllByText('Shared');
    // Vivienda has defaultShared: true
    expect(sharedBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('should show type badge for each category', () => {
    render(<CategoryTree {...defaultProps} />);

    // Vivienda and Obsoleta are expenses
    const expenseBadges = screen.getAllByText('Expenses');
    expect(expenseBadges.length).toBe(2);

    // Nomina is income
    const incomeBadges = screen.getAllByText('Income');
    expect(incomeBadges.length).toBe(1);
  });

  it('should call onEdit with category when edit button is clicked', () => {
    render(<CategoryTree {...defaultProps} />);

    const editButtons = screen.getAllByLabelText('Edit');
    fireEvent.click(editButtons[0]!);

    expect(mockOnEdit).toHaveBeenCalledTimes(1);
    expect(mockOnEdit).toHaveBeenCalledWith(mockCategories[0]);
  });

  it('should call onDelete with category when delete button is clicked', () => {
    render(<CategoryTree {...defaultProps} />);

    const deleteButtons = screen.getAllByLabelText('Delete');
    fireEvent.click(deleteButtons[0]!);

    expect(mockOnDelete).toHaveBeenCalledTimes(1);
    expect(mockOnDelete).toHaveBeenCalledWith(mockCategories[0]);
  });

  it('should call onToggleActive when toggle button is clicked', () => {
    render(<CategoryTree {...defaultProps} />);

    // First parent (Vivienda) is active → button should say "Deactivate"
    const deactivateButtons = screen.getAllByLabelText('Deactivate');
    fireEvent.click(deactivateButtons[0]!);

    expect(mockOnToggleActive).toHaveBeenCalledTimes(1);
    expect(mockOnToggleActive).toHaveBeenCalledWith(mockCategories[0]);
  });

  it('should show "Activate" button for inactive categories', () => {
    render(<CategoryTree {...defaultProps} />);

    // Obsoleta is inactive → should have "Activate" button
    const activateButtons = screen.getAllByLabelText('Activate');
    expect(activateButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('should call onAddSubcategory when add subcategory button is clicked', () => {
    render(<CategoryTree {...defaultProps} />);

    const addSubButtons = screen.getAllByLabelText('Add subcategory');
    fireEvent.click(addSubButtons[0]!);

    expect(mockOnAddSubcategory).toHaveBeenCalledTimes(1);
    expect(mockOnAddSubcategory).toHaveBeenCalledWith(mockCategories[0]);
  });

  it('should show inactive badge on subcategory when expanded', () => {
    render(<CategoryTree {...defaultProps} />);

    // Expand Vivienda
    const expandButton = screen.getAllByLabelText('Expand subcategories')[0]!;
    fireEvent.click(expandButton);

    // Luz is inactive — there should be 2 "Inactive" badges (Obsoleta + Luz)
    const inactiveBadges = screen.getAllByText('Inactive');
    expect(inactiveBadges.length).toBe(2);
  });

  it('should render empty list when no categories', () => {
    const { container } = render(<CategoryTree {...defaultProps} categories={[]} />);
    expect(container.querySelector('.divide-y')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
