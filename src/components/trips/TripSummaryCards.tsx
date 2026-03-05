'use client';

/**
 * BudgetGuard Trip Summary Cards
 * Grid of mini-cards showing category breakdown within a trip
 * Similar to Excel header: Alojamiento 451€ | Transporte 225€ | ...
 */

import { CategoryIcon } from '@/components/ui/CategoryIcon';
import type { TripCategorySummary } from '@/types/finance';
import { formatCurrency } from '@/utils/money';

interface TripSummaryCardsProps {
  categorySummary: TripCategorySummary[];
}

export function TripSummaryCards({ categorySummary }: TripSummaryCardsProps) {
  if (categorySummary.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {categorySummary.map((cat) => {
        const color = cat.categoryColor ?? '#8B5CF6';
        return (
          <div key={cat.categoryId} className="flex items-center gap-2.5 p-3 rounded-lg border border-border bg-card">
            <div className="flex-shrink-0 p-1.5 rounded-lg" style={{ backgroundColor: `${color}15` }}>
              <CategoryIcon icon={cat.categoryIcon} color={color} className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-guard-muted truncate">{cat.categoryName}</p>
              <p className="text-sm font-semibold text-foreground">{formatCurrency(cat.totalCents)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
