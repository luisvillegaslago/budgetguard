'use client';

/**
 * BudgetGuard Movements Page
 * Master-detail layout: category browser (left) + history detail (right)
 */

import { List } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CategoryBrowser } from '@/components/movements/CategoryBrowser';
import { MovementDetail } from '@/components/movements/MovementDetail';
import { TRANSACTION_TYPE } from '@/constants/finance';
import { useCategoriesHierarchical } from '@/hooks/useCategories';
import { useTranslate } from '@/hooks/useTranslations';
import type { Category } from '@/types/finance';

export default function MovementsPage() {
  const { t } = useTranslate();
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get('category');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [initialSubcategoryId, setInitialSubcategoryId] = useState<number | null>(null);

  const { data: categories } = useCategoriesHierarchical(TRANSACTION_TYPE.EXPENSE);

  // Pre-select category from URL param
  useEffect(() => {
    if (categoryParam && categories && !selectedCategory) {
      const id = Number.parseInt(categoryParam, 10);
      const found = categories.find((c) => c.categoryId === id);
      if (found) setSelectedCategory(found);
    }
  }, [categoryParam, categories, selectedCategory]);

  const handleSelectCategory = useCallback((category: Category, subcategoryId?: number) => {
    setSelectedCategory(category);
    setInitialSubcategoryId(subcategoryId ?? null);
    // Update URL without navigation
    const url = new URL(window.location.href);
    url.searchParams.set('category', String(category.categoryId));
    window.history.replaceState({}, '', url.toString());
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">{t('movements.title')}</h1>
        <p className="text-sm text-guard-muted mt-0.5">{t('movements.subtitle')}</p>
      </div>

      {/* Master-detail layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Category browser (left panel) */}
        <div className="lg:col-span-4">
          <CategoryBrowser
            selectedCategoryId={selectedCategory?.categoryId ?? null}
            selectedSubcategoryId={initialSubcategoryId}
            onSelectCategory={handleSelectCategory}
          />
        </div>

        {/* Detail (right panel) */}
        <div className="lg:col-span-8">
          {selectedCategory ? (
            <MovementDetail
              key={`${selectedCategory.categoryId}-${initialSubcategoryId ?? 'all'}`}
              category={selectedCategory}
              initialSubcategoryId={initialSubcategoryId}
            />
          ) : (
            <div className="card flex flex-col items-center justify-center py-20 text-center">
              <List className="h-12 w-12 text-guard-muted/30 mb-4" aria-hidden="true" />
              <p className="text-guard-muted">{t('movements.select-category')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
