'use client';

/**
 * BudgetGuard Category Breakdown
 * Shows expenses grouped by category with progress bars
 */

import {
  AlertCircle,
  Beer,
  Briefcase,
  Calendar,
  Car,
  Cloud,
  Dog,
  Dumbbell,
  Home,
  type LucideIcon,
  Plane,
  ShoppingBag,
  ShoppingCart,
  Utensils,
} from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useExpenseSummary } from '@/hooks/useFormattedSummary';
import { useTranslate } from '@/hooks/useTranslations';
import { useSelectedMonth } from '@/stores/useFinanceStore';

// Map icon names to Lucide components
const iconMap: Record<string, LucideIcon> = {
  home: Home,
  dog: Dog,
  briefcase: Briefcase,
  dumbbell: Dumbbell,
  cloud: Cloud,
  'shopping-cart': ShoppingCart,
  car: Car,
  utensils: Utensils,
  'shopping-bag': ShoppingBag,
  beer: Beer,
  'alert-circle': AlertCircle,
  plane: Plane,
  calendar: Calendar,
};

interface CategoryRowProps {
  name: string;
  total: string;
  percentage: number;
  icon: string | null;
  color: string | null;
}

function CategoryRow({ name, total, percentage, icon, color }: CategoryRowProps) {
  const IconComponent = icon ? iconMap[icon] : AlertCircle;
  const barColor = color ?? '#6366F1';

  return (
    <div className="flex items-center gap-4 py-3 animate-slide-up">
      {/* Icon */}
      <div className="flex-shrink-0 p-2 rounded-lg" style={{ backgroundColor: `${barColor}15` }}>
        {IconComponent && <IconComponent className="h-4 w-4" style={{ color: barColor }} />}
      </div>

      {/* Category name and progress bar */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-foreground truncate">{name}</span>
          <span className="text-sm font-semibold text-foreground ml-2">{total}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${Math.min(percentage, 100)}%`,
              backgroundColor: barColor,
            }}
          />
        </div>
      </div>

      {/* Percentage */}
      <span className="text-xs font-medium text-guard-muted w-10 text-right">{percentage}%</span>
    </div>
  );
}

export function CategoryBreakdown() {
  const { t } = useTranslate();
  const selectedMonth = useSelectedMonth();
  const { expenseCategories, totalExpense, isLoading, isError } = useExpenseSummary(selectedMonth);

  if (isLoading) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-foreground mb-4">{t('dashboard.category-breakdown.title')}</h3>
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-foreground mb-4">{t('dashboard.category-breakdown.title')}</h3>
        <p className="text-guard-danger text-center py-8">{t('errors.load-categories')}</p>
      </div>
    );
  }

  if (expenseCategories.length === 0) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-foreground mb-4">{t('dashboard.category-breakdown.title')}</h3>
        <div className="text-center py-8 text-guard-muted">
          <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>{t('dashboard.category-breakdown.empty')}</p>
        </div>
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
        {expenseCategories.map((category) => (
          <CategoryRow
            key={category.categoryId}
            name={category.categoryName}
            total={category.total}
            percentage={category.percentage}
            icon={category.categoryIcon}
            color={category.categoryColor}
          />
        ))}
      </div>
    </div>
  );
}
