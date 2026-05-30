'use client';

/**
 * BudgetGuard Category Distribution Card
 * Single card combining the expense donut with a clickable category ranking
 * (the ranking doubles as the donut legend). Clicking a category opens its
 * transactions popup for the selected month.
 */

import { Ellipsis } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { useExpenseSummary } from '@/hooks/useFormattedSummary';
import { useTranslate } from '@/hooks/useTranslations';
import { useSelectedMonth } from '@/stores/useFinanceStore';
import type { FormattedCategorySummary } from '@/types/finance';
import { CategoryTransactionsModal } from './CategoryTransactionsModal';
import { ChartCard } from './ChartCard';
import { CATEGORY_PALETTE, CHART_COLORS, DONUT_MAX_SLICES, formatEuroValue } from './chartConfig';

interface Slice {
  name: string;
  value: number; // euros
  color: string;
  percentage: number;
  category: FormattedCategorySummary | null; // null for the aggregated "Others" slice
}

interface DonutTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: Slice }>;
}

function DonutTooltip({ active, payload }: DonutTooltipProps) {
  const first = payload?.[0];
  if (!active || !first) return null;
  const slice = first.payload;

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold text-popover-foreground">{slice.name}</p>
      <p className="text-guard-muted tabular-nums">
        {formatEuroValue(slice.value)} · {slice.percentage}%
      </p>
    </div>
  );
}

export function CategoryDistributionCard() {
  const { t } = useTranslate();
  const selectedMonth = useSelectedMonth();
  const { expenseCategories, totalExpense, totalExpenseValue, isLoading, isError, refetch } =
    useExpenseSummary(selectedMonth);
  const [selectedCategory, setSelectedCategory] = useState<FormattedCategorySummary | null>(null);

  const slices = useMemo((): Slice[] => {
    if (expenseCategories.length === 0) return [];

    const top: Slice[] = expenseCategories.slice(0, DONUT_MAX_SLICES).map((cat, index) => ({
      name: cat.categoryName,
      value: cat.totalValue,
      color: cat.categoryColor ?? CATEGORY_PALETTE[index % CATEGORY_PALETTE.length] ?? CHART_COLORS.balance,
      percentage: cat.percentage,
      category: cat,
    }));

    const rest = expenseCategories.slice(DONUT_MAX_SLICES);
    if (rest.length > 0) {
      const restValue = rest.reduce((sum, c) => sum + c.totalValue, 0);
      top.push({
        name: t('dashboard.charts.others'),
        value: restValue,
        color: CHART_COLORS.muted,
        percentage: totalExpenseValue > 0 ? Math.round((restValue / totalExpenseValue) * 100) : 0,
        category: null,
      });
    }

    return top;
  }, [expenseCategories, totalExpenseValue, t]);

  return (
    <ChartCard
      title={t('dashboard.charts.donut-title')}
      isLoading={isLoading}
      isError={isError}
      isEmpty={!isLoading && slices.length === 0}
      emptyMessage={t('dashboard.category-breakdown.empty')}
      errorMessage={t('errors.load-categories')}
      onRetry={() => refetch()}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut — fills the row height (matched to the ranking) */}
        <div className="relative w-full min-h-[18rem] order-1 lg:order-none">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="62%"
                outerRadius="88%"
                paddingAngle={2}
                stroke="none"
              >
                {slices.map((slice) => (
                  <Cell key={slice.name} fill={slice.color} />
                ))}
              </Pie>
              <Tooltip wrapperStyle={{ zIndex: 20, outline: 'none' }} content={<DonutTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs text-guard-muted">{t('dashboard.balance-cards.expenses')}</span>
            <span className="text-xl font-bold text-foreground tabular-nums">{totalExpense}</span>
          </div>
        </div>

        {/* Ranking (doubles as legend) */}
        <ol className="space-y-2.5">
          {slices.map((slice) => {
            const row = (
              <>
                <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: slice.color }} />
                <span className="flex-shrink-0">
                  {slice.category ? (
                    <CategoryIcon icon={slice.category.categoryIcon} color={slice.color} className="h-4 w-4" />
                  ) : (
                    <Ellipsis className="h-4 w-4" style={{ color: slice.color }} aria-hidden="true" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground truncate">{slice.name}</span>
                    <span className="text-sm font-semibold text-foreground flex-shrink-0 tabular-nums">
                      {formatEuroValue(slice.value)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out-quart"
                      style={{ width: `${Math.min(slice.percentage, 100)}%`, backgroundColor: slice.color }}
                    />
                  </div>
                </div>
                <span className="text-xs font-medium text-guard-muted w-9 text-right flex-shrink-0 tabular-nums">
                  {slice.percentage}%
                </span>
              </>
            );

            return (
              <li key={slice.name}>
                {slice.category ? (
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(slice.category)}
                    className="flex w-full items-center gap-3 -mx-2 px-2 py-1 rounded-lg hover:bg-muted/30 transition-colors text-left cursor-pointer"
                  >
                    {row}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 px-0 py-1">{row}</div>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {selectedCategory && (
        <CategoryTransactionsModal
          categoryId={selectedCategory.categoryId}
          categoryName={selectedCategory.categoryName}
          categoryIcon={selectedCategory.categoryIcon}
          categoryColor={selectedCategory.categoryColor}
          month={selectedMonth}
          onClose={() => setSelectedCategory(null)}
        />
      )}
    </ChartCard>
  );
}
