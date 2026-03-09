'use client';

/**
 * BudgetGuard Category Breakdown
 * Shows expenses grouped by category with progress bars
 * Supports expandable subcategory drill-down
 */

import { ChevronRight, History, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useExpenseSummary } from '@/hooks/useFormattedSummary';
import { useSubcategorySummary } from '@/hooks/useSubcategorySummary';
import { useTranslate } from '@/hooks/useTranslations';
import { useSelectedMonth } from '@/stores/useFinanceStore';
import type { FormattedCategorySummary, SubcategorySummary } from '@/types/finance';
import { cn } from '@/utils/helpers';
import { calculatePercentage, formatCurrency } from '@/utils/money';

interface SubcategoryRowProps {
  subcategory: SubcategorySummary;
  parentTotalCents: number;
  index: number;
}

function SubcategoryRow({ subcategory, parentTotalCents, index }: SubcategoryRowProps) {
  const { t } = useTranslate();
  const barColor = subcategory.subcategoryColor ?? '#6366F1';
  const percentage = calculatePercentage(subcategory.totalCents, parentTotalCents);

  // Label for uncategorized transactions (assigned directly to parent)
  const displayName = subcategory.isSubcategory
    ? subcategory.subcategoryName
    : t('dashboard.category-breakdown.general');

  return (
    <div
      className="flex items-center gap-3 py-2 pl-12 animate-fade-in"
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'both' }}
    >
      <div className="flex-shrink-0 p-1.5 rounded" style={{ backgroundColor: `${barColor}10` }}>
        <CategoryIcon icon={subcategory.subcategoryIcon} color={barColor} className="h-3 w-3" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs font-medium text-guard-muted truncate">{displayName}</span>
          <span className="text-xs font-semibold text-foreground ml-2">{formatCurrency(subcategory.totalCents)}</span>
        </div>
        <div
          className="h-1.5 bg-muted rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${displayName}: ${percentage}%`}
        >
          <div
            className="h-full rounded-full transition-all duration-300 ease-out-quart"
            style={{
              width: `${Math.min(percentage, 100)}%`,
              backgroundColor: barColor,
              opacity: 0.6,
            }}
          />
        </div>
      </div>

      <span className="text-[10px] font-medium text-guard-muted w-8 text-right">{percentage}%</span>
    </div>
  );
}

interface ExpandableSubcategoriesProps {
  month: string;
  categoryId: number;
  parentTotalCents: number;
}

function ExpandableSubcategories({ month, categoryId, parentTotalCents }: ExpandableSubcategoriesProps) {
  const { t } = useTranslate();
  const { data: subcategories, isLoading } = useSubcategorySummary(month, categoryId);

  if (isLoading) {
    return (
      <div className="pl-12 py-2">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  if (!subcategories?.length) return null;

  return (
    <div className="border-t border-border/50">
      {subcategories.map((sub, index) => (
        <SubcategoryRow key={sub.subcategoryId} subcategory={sub} parentTotalCents={parentTotalCents} index={index} />
      ))}
      <Link
        href={`/movements?category=${categoryId}`}
        className="flex items-center gap-2 py-2 pl-12 text-xs text-guard-primary hover:text-guard-primary/80 transition-colors"
      >
        <History className="h-3 w-3" aria-hidden="true" />
        {t('category-history.view-link')}
      </Link>
    </div>
  );
}

interface CategoryRowProps {
  category: FormattedCategorySummary;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  month: string;
}

function CategoryRow({ category, index, isExpanded, onToggle, month }: CategoryRowProps) {
  const { t } = useTranslate();
  const barColor = category.categoryColor ?? '#6366F1';

  return (
    <div>
      <button
        type="button"
        className={cn(
          'flex items-center gap-4 py-3 w-full text-left animate-slide-up cursor-pointer',
          'hover:bg-muted/30 -mx-2 px-2 rounded-lg transition-colors',
        )}
        style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? t('dashboard.category-breakdown.collapse') : t('dashboard.category-breakdown.expand')}
      >
        {/* Expand/collapse chevron */}
        <div className="w-4 flex-shrink-0">
          <ChevronRight
            className={cn(
              'h-4 w-4 text-guard-muted transition-transform duration-200 ease-out-quart',
              isExpanded && 'rotate-90',
            )}
            aria-hidden="true"
          />
        </div>

        {/* Icon */}
        <div className="flex-shrink-0 p-2 rounded-lg" style={{ backgroundColor: `${barColor}15` }}>
          <CategoryIcon icon={category.categoryIcon} color={barColor} />
        </div>

        {/* Category name and progress bar */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-foreground truncate">{category.categoryName}</span>
            <span className="text-sm font-semibold text-foreground ml-2">{category.total}</span>
          </div>
          <div
            className="h-2 bg-muted rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={category.percentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${category.categoryName}: ${category.percentage}%`}
          >
            <div
              className="h-full rounded-full transition-all duration-500 ease-out-quart"
              style={{
                width: `${Math.min(category.percentage, 100)}%`,
                backgroundColor: barColor,
              }}
            />
          </div>
        </div>

        {/* Percentage */}
        <span className="text-xs font-medium text-guard-muted w-10 text-right">{category.percentage}%</span>
      </button>

      {/* Expanded subcategories (lazy loaded) */}
      {isExpanded && (
        <ExpandableSubcategories
          month={month}
          categoryId={category.categoryId}
          parentTotalCents={category.totalCents}
        />
      )}
    </div>
  );
}

export function CategoryBreakdown() {
  const { t } = useTranslate();
  const selectedMonth = useSelectedMonth();
  const { expenseCategories, totalExpense, isLoading, isError, refetch } = useExpenseSummary(selectedMonth);
  const [expandedCategoryId, setExpandedCategoryId] = useState<number | null>(null);

  const handleToggle = (categoryId: number) => {
    setExpandedCategoryId((prev) => (prev === categoryId ? null : categoryId));
  };

  if (isLoading) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-foreground mb-4">{t('dashboard.category-breakdown.title')}</h3>
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 animate-pulse">
              <div className="h-10 w-10 bg-muted rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 bg-muted rounded" />
                <div className="h-2 w-full bg-muted rounded-full" />
              </div>
              <div className="h-4 w-8 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-foreground mb-4">{t('dashboard.category-breakdown.title')}</h3>
        <ErrorState message={t('errors.load-categories')} onRetry={() => refetch()} />
      </div>
    );
  }

  if (expenseCategories.length === 0) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-foreground mb-4">{t('dashboard.category-breakdown.title')}</h3>
        <EmptyState icon={ShoppingCart} title={t('dashboard.category-breakdown.empty')} />
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">{t('dashboard.category-breakdown.title')}</h3>
        <span className="text-sm font-medium text-guard-muted">{t('common.total', { amount: totalExpense })}</span>
      </div>

      <div className="divide-y divide-border">
        {expenseCategories.map((category, index) => (
          <CategoryRow
            key={category.categoryId}
            category={category}
            index={index}
            isExpanded={expandedCategoryId === category.categoryId}
            onToggle={() => handleToggle(category.categoryId)}
            month={selectedMonth}
          />
        ))}
      </div>
    </div>
  );
}
