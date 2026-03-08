'use client';

/**
 * BudgetGuard Category Selector
 * Searchable combobox for hierarchical category selection with auto-toggle shared default
 */

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useCategoriesHierarchical } from '@/hooks/useCategories';
import { useTranslate } from '@/hooks/useTranslations';
import type { Category, TransactionType } from '@/types/finance';
import { cn } from '@/utils/helpers';

interface SearchableSelectProps {
  id: string;
  label: string;
  placeholder: string;
  options: { id: number; name: string }[];
  value: number | '';
  onChange: (id: number | '') => void;
  onSelected?: () => void;
  disabled?: boolean;
  error?: string;
}

function SearchableSelect({
  id,
  label,
  placeholder,
  options,
  value,
  onChange,
  onSelected,
  disabled,
  error,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Display text: selected option name or search input
  const selectedOption = options.find((o) => o.id === value);

  const filtered = search ? options.filter((o) => o.name.toLowerCase().includes(search.toLowerCase())) : options;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
        setHighlightIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex]);

  const handleInputFocus = () => {
    setIsOpen(true);
    setSearch('');
    setHighlightIndex(-1);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setIsOpen(true);
    setHighlightIndex(0);
  };

  const handleSelect = (option: { id: number; name: string }) => {
    onChange(option.id);
    setIsOpen(false);
    setSearch('');
    setHighlightIndex(-1);
    if (onSelected) {
      onSelected();
    } else {
      inputRef.current?.blur();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
        setHighlightIndex(0);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter': {
        e.preventDefault();
        const selected = filtered[highlightIndex];
        if (highlightIndex >= 0 && selected) {
          handleSelect(selected);
        }
        break;
      }
      case 'Tab': {
        // Close dropdown and let browser handle focus naturally.
        // Only select if user explicitly highlighted an option.
        setIsOpen(false);
        setSearch('');
        if (highlightIndex >= 0) {
          const tabSelected = filtered[highlightIndex];
          if (tabSelected) {
            onChange(tabSelected.id);
            if (onSelected) onSelected();
          }
        }
        setHighlightIndex(-1);
        break;
      }
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        setSearch('');
        setHighlightIndex(-1);
        break;
    }
  };

  const selectClasses = cn(
    'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground pr-10',
    'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'transition-colors duration-200 ease-out-quart',
    error ? 'border-guard-danger' : 'border-input',
  );

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground mb-1.5">
        {label}
      </label>
      <div ref={containerRef} className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={`${id}-listbox`}
          aria-activedescendant={highlightIndex >= 0 ? `${id}-option-${highlightIndex}` : undefined}
          autoComplete="off"
          disabled={disabled}
          className={selectClasses}
          placeholder={placeholder}
          value={isOpen ? search : (selectedOption?.name ?? '')}
          onFocus={handleInputFocus}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
        />
        <ChevronDown
          className={cn(
            'absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-guard-muted pointer-events-none transition-transform',
            isOpen && 'rotate-180',
          )}
          aria-hidden="true"
        />

        {isOpen && (
          <div
            ref={listRef}
            id={`${id}-listbox`}
            className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-input bg-background shadow-lg"
          >
            {filtered.length === 0 ? (
              <div className="px-4 py-2.5 text-sm text-guard-muted">—</div>
            ) : (
              filtered.map((option, index) => (
                <button
                  type="button"
                  key={option.id}
                  id={`${id}-option-${index}`}
                  tabIndex={-1}
                  className={cn(
                    'w-full text-left px-4 py-2.5 text-sm cursor-pointer transition-colors',
                    index === highlightIndex
                      ? 'bg-guard-primary/10 text-guard-primary'
                      : 'text-foreground hover:bg-muted/50',
                    option.id === value && 'font-medium',
                  )}
                  onClick={() => handleSelect(option)}
                >
                  {option.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm text-guard-danger">
          {error}
        </p>
      )}
    </div>
  );
}

interface CategorySelectorProps {
  type: TransactionType;
  onCategoryChange: (categoryId: number) => void;
  onSharedDefaultChange: (defaultShared: boolean) => void;
  error?: string;
  disabled?: boolean;
  initialCategoryId?: number;
}

export function CategorySelector({
  type,
  onCategoryChange,
  onSharedDefaultChange,
  error,
  disabled,
  initialCategoryId,
}: CategorySelectorProps) {
  const { t } = useTranslate();
  const { data: categories, isLoading } = useCategoriesHierarchical(type);
  const [selectedParentId, setSelectedParentId] = useState<number | ''>('');
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<number | ''>('');
  const [selectedParent, setSelectedParent] = useState<Category | null>(null);

  // Reset selections when type changes (using ref to avoid useEffect lint issue)
  const prevTypeRef = useRef(type);
  if (prevTypeRef.current !== type) {
    prevTypeRef.current = type;
    setSelectedParentId('');
    setSelectedSubcategoryId('');
    setSelectedParent(null);
  }

  // Pre-select category when editing and categories are loaded
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initialCategoryId || !categories?.length || initializedRef.current) return;
    initializedRef.current = true;

    let foundParent: Category | null = null;
    let foundSubId: number | '' = '';

    categories.forEach((parent) => {
      if (parent.categoryId === initialCategoryId) {
        foundParent = parent;
      }
      parent.subcategories?.forEach((sub) => {
        if (sub.categoryId === initialCategoryId) {
          foundParent = parent;
          foundSubId = sub.categoryId;
        }
      });
    });

    if (foundParent) {
      setSelectedParentId((foundParent as Category).categoryId);
      setSelectedParent(foundParent);
      setSelectedSubcategoryId(foundSubId);
      onCategoryChange(initialCategoryId);
      onSharedDefaultChange(
        foundSubId
          ? ((foundParent as Category).subcategories?.find((s) => s.categoryId === foundSubId)?.defaultShared ?? false)
          : (foundParent as Category).defaultShared,
      );
    }
  }, [categories, initialCategoryId, onCategoryChange, onSharedDefaultChange]);

  const handleParentChange = (id: number | '') => {
    setSelectedSubcategoryId('');

    if (!id) {
      setSelectedParentId('');
      setSelectedParent(null);
      return;
    }

    setSelectedParentId(id);

    const parent = categories?.find((c) => c.categoryId === id) ?? null;
    setSelectedParent(parent);

    onSharedDefaultChange(parent?.defaultShared ?? false);

    if (!parent?.subcategories?.length) {
      onCategoryChange(id);
    } else {
      onCategoryChange(id);
    }
  };

  const handleSubcategoryChange = (id: number | '') => {
    if (!id) {
      setSelectedSubcategoryId('');
      if (selectedParentId) {
        onCategoryChange(Number(selectedParentId));
      }
      return;
    }

    setSelectedSubcategoryId(id);
    onCategoryChange(id);

    const subcategory = selectedParent?.subcategories?.find((s) => s.categoryId === id);
    if (subcategory) {
      onSharedDefaultChange(subcategory.defaultShared);
    }
  };

  const hasSubcategories = (selectedParent?.subcategories?.length ?? 0) > 0;

  const parentOptions = (categories ?? []).map((c) => ({ id: c.categoryId, name: c.name }));
  const subcategoryOptions = (selectedParent?.subcategories ?? []).map((s) => ({ id: s.categoryId, name: s.name }));

  return (
    <div className="space-y-3">
      <SearchableSelect
        id="parentCategory"
        label={t('transactions.form.fields.category')}
        placeholder={t('transactions.form.fields.category-placeholder')}
        options={parentOptions}
        value={selectedParentId}
        onChange={handleParentChange}
        onSelected={() => {
          // Focus subcategory after render, or fall back to shared toggle
          requestAnimationFrame(() => {
            const subInput = document.getElementById('subcategory');
            if (subInput) {
              subInput.focus();
            } else {
              document.getElementById('isShared')?.focus();
            }
          });
        }}
        disabled={isLoading || disabled}
        error={error}
      />

      {hasSubcategories && (
        <div className="animate-slide-up">
          <SearchableSelect
            id="subcategory"
            label={t('transactions.form.fields.subcategory')}
            placeholder={t('transactions.form.fields.subcategory-placeholder')}
            options={subcategoryOptions}
            value={selectedSubcategoryId}
            onChange={handleSubcategoryChange}
            onSelected={() => {
              document.getElementById('isShared')?.focus();
            }}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
