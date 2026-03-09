'use client';

/**
 * Category Browser
 * Searchable list of expense categories for the movements page
 * Searches both parent categories and subcategories
 */

import { ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SearchInput } from '@/components/ui/SearchInput';
import { TRANSACTION_TYPE } from '@/constants/finance';
import { useCategoriesHierarchical } from '@/hooks/useCategories';
import { useTranslate } from '@/hooks/useTranslations';
import type { Category } from '@/types/finance';
import { cn } from '@/utils/helpers';

interface CategoryBrowserProps {
  selectedCategoryId: number | null;
  selectedSubcategoryId: number | null;
  onSelectCategory: (category: Category, subcategoryId?: number) => void;
}

interface SearchResult {
  parent: Category;
  matchedSubcategories: Category[];
  parentMatches: boolean;
}

export function CategoryBrowser({ selectedCategoryId, selectedSubcategoryId, onSelectCategory }: CategoryBrowserProps) {
  const { t } = useTranslate();
  const [search, setSearch] = useState('');
  const { data: categories, isLoading } = useCategoriesHierarchical(TRANSACTION_TYPE.EXPENSE);

  const results = useMemo((): SearchResult[] => {
    if (!categories) return [];
    const term = search.trim().toLowerCase();

    if (!term) {
      return categories.map((c) => ({ parent: c, matchedSubcategories: [], parentMatches: true }));
    }

    return categories
      .map((c) => {
        const parentMatches = c.name.toLowerCase().includes(term);
        const matchedSubcategories = (c.subcategories ?? []).filter((sub) => sub.name.toLowerCase().includes(term));
        return { parent: c, matchedSubcategories, parentMatches };
      })
      .filter((r) => r.parentMatches || r.matchedSubcategories.length > 0);
  }, [categories, search]);

  if (isLoading) {
    return (
      <div className="card flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden">
      {/* Search */}
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('movements.search-placeholder')}
        className="p-3 border-b border-border"
      />

      {/* Category list */}
      <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
        {results.length === 0 ? (
          <p className="text-sm text-guard-muted text-center py-8">{t('movements.no-categories')}</p>
        ) : (
          results.map(({ parent, matchedSubcategories, parentMatches }) => {
            const color = parent.color ?? '#6366F1';
            const isSearching = search.trim().length > 0;
            const showSubcategories = isSearching && !parentMatches && matchedSubcategories.length > 0;

            return (
              <div key={parent.categoryId}>
                {/* Parent category */}
                <button
                  type="button"
                  onClick={() => onSelectCategory(parent)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                    'hover:bg-muted/50 border-b border-border/50 last:border-b-0',
                    selectedCategoryId === parent.categoryId && !selectedSubcategoryId && 'bg-guard-primary/5',
                  )}
                >
                  <div className="p-2 rounded-lg flex-shrink-0" style={{ backgroundColor: `${color}15` }}>
                    <CategoryIcon icon={parent.icon} color={color} className="h-4 w-4" />
                  </div>
                  <span
                    className={cn(
                      'text-sm font-medium truncate flex-1',
                      selectedCategoryId === parent.categoryId && !selectedSubcategoryId
                        ? 'text-guard-primary'
                        : 'text-foreground',
                    )}
                  >
                    {parent.name}
                  </span>
                  {isSearching && matchedSubcategories.length > 0 && parentMatches && (
                    <span className="text-xs text-guard-muted">+{matchedSubcategories.length}</span>
                  )}
                </button>

                {/* Matched subcategories (shown when search matches subcategory) */}
                {showSubcategories &&
                  matchedSubcategories.map((sub) => (
                    <button
                      key={sub.categoryId}
                      type="button"
                      onClick={() => onSelectCategory(parent, sub.categoryId)}
                      className={cn(
                        'w-full flex items-center gap-3 pl-8 pr-4 py-2.5 text-left transition-colors',
                        'hover:bg-muted/50 border-b border-border/50 last:border-b-0',
                        selectedCategoryId === parent.categoryId &&
                          selectedSubcategoryId === sub.categoryId &&
                          'bg-guard-primary/5',
                      )}
                    >
                      <ChevronRight className="h-3 w-3 text-guard-muted flex-shrink-0" aria-hidden="true" />
                      <span
                        className={cn(
                          'text-sm truncate',
                          selectedCategoryId === parent.categoryId && selectedSubcategoryId === sub.categoryId
                            ? 'text-guard-primary font-medium'
                            : 'text-guard-muted',
                        )}
                      >
                        {sub.name}
                      </span>
                    </button>
                  ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
