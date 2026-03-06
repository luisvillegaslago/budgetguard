/**
 * Component Tests: CategorySelector
 * Tests hierarchical category selection, subcategory rendering,
 * and shared default propagation with searchable combobox UI
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import type { Category } from '@/types/finance';

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

const mockHierarchicalCategories: Category[] = [
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
    subcategories: [
      {
        categoryId: 10,
        name: 'Internet',
        type: 'expense',
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
        type: 'expense',
        icon: 'zap',
        color: '#EF4444',
        sortOrder: 2,
        isActive: true,
        parentCategoryId: 1,
        defaultShared: false,
        defaultVatPercent: null,
        defaultDeductionPercent: null,
      },
    ],
  },
  {
    categoryId: 2,
    name: 'Transporte',
    type: 'expense',
    icon: 'car',
    color: '#14B8A6',
    sortOrder: 2,
    isActive: true,
    parentCategoryId: null,
    defaultShared: false,
    defaultVatPercent: null,
    defaultDeductionPercent: null,
    subcategories: [],
  },
];

// Mock hooks
jest.mock('@/hooks/useCategories', () => ({
  useCategoriesHierarchical: () => ({
    data: mockHierarchicalCategories,
    isLoading: false,
  }),
}));

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'transactions.form.fields.category': 'Category',
        'transactions.form.fields.category-placeholder': 'Select a category',
        'transactions.form.fields.subcategory': 'Subcategory',
        'transactions.form.fields.subcategory-placeholder': 'Select subcategory',
      };
      return translations[key] ?? key;
    },
    locale: 'en',
    setLocale: jest.fn(),
  }),
}));

jest.mock('@/utils/helpers', () => ({
  cn: (...args: unknown[]) => args.filter((a) => typeof a === 'string').join(' '),
}));

import { CategorySelector } from '@/components/transactions/CategorySelector';

describe('CategorySelector', () => {
  const mockOnCategoryChange = jest.fn();
  const mockOnSharedDefaultChange = jest.fn();

  const defaultProps = {
    type: 'expense' as const,
    onCategoryChange: mockOnCategoryChange,
    onSharedDefaultChange: mockOnSharedDefaultChange,
  };

  beforeEach(() => {
    mockOnCategoryChange.mockClear();
    mockOnSharedDefaultChange.mockClear();
  });

  it('should render parent category combobox', () => {
    render(<CategorySelector {...defaultProps} />);

    expect(screen.getByLabelText('Category')).toBeInTheDocument();
  });

  it('should show options when input is focused', () => {
    render(<CategorySelector {...defaultProps} />);

    const input = screen.getByLabelText('Category');
    fireEvent.focus(input);

    expect(screen.getByText('Vivienda')).toBeInTheDocument();
    expect(screen.getByText('Transporte')).toBeInTheDocument();
  });

  it('should not show subcategory combobox initially', () => {
    render(<CategorySelector {...defaultProps} />);

    expect(screen.queryByLabelText('Subcategory')).not.toBeInTheDocument();
  });

  it('should show subcategory combobox when selecting parent with subcategories', () => {
    render(<CategorySelector {...defaultProps} />);

    // Open and select Vivienda
    const input = screen.getByLabelText('Category');
    fireEvent.focus(input);
    fireEvent.click(screen.getByText('Vivienda'));

    expect(screen.getByLabelText('Subcategory')).toBeInTheDocument();
  });

  it('should NOT show subcategory combobox for parent without subcategories', () => {
    render(<CategorySelector {...defaultProps} />);

    const input = screen.getByLabelText('Category');
    fireEvent.focus(input);
    fireEvent.click(screen.getByText('Transporte'));

    expect(screen.queryByLabelText('Subcategory')).not.toBeInTheDocument();
  });

  it('should call onSharedDefaultChange with true when selecting shared parent', () => {
    render(<CategorySelector {...defaultProps} />);

    const input = screen.getByLabelText('Category');
    fireEvent.focus(input);
    fireEvent.click(screen.getByText('Vivienda'));

    expect(mockOnSharedDefaultChange).toHaveBeenCalledWith(true);
  });

  it('should call onSharedDefaultChange with false when selecting non-shared parent', () => {
    render(<CategorySelector {...defaultProps} />);

    const input = screen.getByLabelText('Category');
    fireEvent.focus(input);
    fireEvent.click(screen.getByText('Transporte'));

    expect(mockOnSharedDefaultChange).toHaveBeenCalledWith(false);
  });

  it('should call onCategoryChange with parent ID when parent has no subcategories', () => {
    render(<CategorySelector {...defaultProps} />);

    const input = screen.getByLabelText('Category');
    fireEvent.focus(input);
    fireEvent.click(screen.getByText('Transporte'));

    expect(mockOnCategoryChange).toHaveBeenCalledWith(2);
  });

  it('should call onCategoryChange with parent ID initially when parent has subcategories', () => {
    render(<CategorySelector {...defaultProps} />);

    const input = screen.getByLabelText('Category');
    fireEvent.focus(input);
    fireEvent.click(screen.getByText('Vivienda'));

    expect(mockOnCategoryChange).toHaveBeenCalledWith(1);
  });

  it('should call onCategoryChange with subcategory ID when subcategory is selected', () => {
    render(<CategorySelector {...defaultProps} />);

    // Select parent
    const input = screen.getByLabelText('Category');
    fireEvent.focus(input);
    fireEvent.click(screen.getByText('Vivienda'));

    // Select subcategory
    const subInput = screen.getByLabelText('Subcategory');
    fireEvent.focus(subInput);
    fireEvent.click(screen.getByText('Luz'));

    expect(mockOnCategoryChange).toHaveBeenCalledWith(11);
  });

  it('should display error message when error prop is provided', () => {
    render(<CategorySelector {...defaultProps} error="Please select a category" />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Please select a category')).toBeInTheDocument();
  });

  it('should not display error when error prop is undefined', () => {
    render(<CategorySelector {...defaultProps} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should disable input when disabled prop is true', () => {
    render(<CategorySelector {...defaultProps} disabled />);

    const input = screen.getByLabelText('Category');
    expect(input).toBeDisabled();
  });
});
