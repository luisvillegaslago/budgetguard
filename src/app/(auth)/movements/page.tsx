'use client';

/**
 * BudgetGuard Movements Page
 * Master-detail layout: category browser (left) + history detail (right)
 */

import { ArrowLeft, List } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CategoryBrowser } from '@/components/movements/CategoryBrowser';
import { CompanyMovementDetail } from '@/components/movements/CompanyMovementDetail';
import { MovementDetail } from '@/components/movements/MovementDetail';
import { TRANSACTION_TYPE } from '@/constants/finance';
import { useCategoriesHierarchical } from '@/hooks/useCategories';
import { useAllCompanies } from '@/hooks/useCompanies';
import { useTranslate } from '@/hooks/useTranslations';
import type { Category } from '@/types/finance';

export default function MovementsPage() {
  const { t } = useTranslate();
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get('category');
  const companyIdParam = searchParams.get('companyId');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [initialSubcategoryId, setInitialSubcategoryId] = useState<number | null>(null);

  const { data: categories } = useCategoriesHierarchical(TRANSACTION_TYPE.EXPENSE);

  // Resolve company from URL param
  const companyId = companyIdParam ? Number(companyIdParam) : null;
  const companyRole = searchParams.get('role');
  const { data: companies } = useAllCompanies();
  const selectedCompany = useMemo(() => {
    if (!companyId || !companies) return null;
    return companies.find((c) => c.companyId === companyId) ?? null;
  }, [companyId, companies]);

  // Build back URL preserving the company role sub-tab
  const backUrl = companyRole ? `/settings?tab=companies&role=${companyRole}` : '/settings?tab=companies';

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

  // Company mode: full-width detail view
  if (selectedCompany) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header with back link */}
        <div className="mb-8">
          <Link
            href={backUrl}
            className="inline-flex items-center gap-1.5 text-sm text-guard-muted hover:text-foreground transition-colors mb-3"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('companies.back-to-list')}
          </Link>
          <h1 className="text-2xl font-bold text-foreground">{t('movements.title')}</h1>
          <p className="text-sm text-guard-muted mt-0.5">{t('movements.subtitle')}</p>
        </div>

        <CompanyMovementDetail company={selectedCompany} />
      </div>
    );
  }

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
