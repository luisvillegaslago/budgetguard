'use client';

/**
 * BudgetGuard Trip Group Row
 * Collapsible row showing all expenses from a trip, grouped into a single entry
 */

import { ArrowUpRight, ChevronDown, ChevronRight, ExternalLink, Plane } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { SHARED_EXPENSE, TRANSACTION_TYPE, TRIP_COLOR } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import type { Transaction, TripGroupDisplay } from '@/types/finance';
import { cn, formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface TripGroupRowProps {
  tripGroup: TripGroupDisplay;
  onEditTransaction?: (transaction: Transaction) => void;
  index: number;
}

export function TripGroupRow({ tripGroup, onEditTransaction, index }: TripGroupRowProps) {
  const { t } = useTranslate();
  const [isExpanded, setIsExpanded] = useState(false);
  const isIncome = tripGroup.type === TRANSACTION_TYPE.INCOME;
  const tripColor = TRIP_COLOR;

  return (
    <div className="animate-fade-in" style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'both' }}>
      {/* Collapsed/Header Row */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Chevron button provides keyboard access */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Cannot use button due to nested interactive elements */}
      <div
        className="flex items-center gap-4 py-3 px-4 hover:bg-muted/50 rounded-lg transition-colors group cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Date */}
        <div className="w-16 flex-shrink-0">
          <span className="text-sm text-guard-muted">{formatDate(tripGroup.startDate)}</span>
        </div>

        {/* Trip Icon */}
        <div className="flex-shrink-0 p-2 rounded-lg" style={{ backgroundColor: `${tripColor}15` }}>
          <Plane className="h-4 w-4" style={{ color: tripColor }} aria-hidden="true" />
        </div>

        {/* Trip Name & Count */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate" title={tripGroup.tripName}>
            {tripGroup.tripName}
          </p>
          <p className="text-xs text-guard-muted">
            {t('transactions.trip-group.expenses', { count: tripGroup.transactions.length })}
          </p>
        </div>

        {/* Badge */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
            {t('trips.badge')}
          </span>
        </div>

        {/* Amount */}
        <div
          className={cn('text-sm font-semibold flex-shrink-0', {
            'text-guard-success': isIncome,
            'text-guard-danger': !isIncome,
          })}
        >
          <span className="flex items-center gap-1">
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />-{formatCurrency(tripGroup.totalAmountCents)}
          </span>
        </div>

        {/* Expand/Collapse Chevron */}
        <button
          type="button"
          className="p-1.5 rounded-lg text-guard-muted hover:text-foreground hover:bg-muted transition-colors"
          aria-label={isExpanded ? t('transactions.trip-group.collapse') : t('transactions.trip-group.expand')}
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          )}
        </button>

        {/* Link to trip detail page */}
        <Link
          href={`/trips/${tripGroup.tripId}?from=dashboard`}
          className="p-1.5 rounded-lg text-guard-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-purple-500 hover:bg-purple-500/10 transition-all duration-200 ease-out-quart"
          aria-label={t('transactions.trip-group.view-detail')}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      {/* Expanded Breakdown */}
      {isExpanded && (
        <div className="ml-[4.5rem] mb-2 animate-slide-up">
          {tripGroup.transactions.map((tx, txIndex) => {
            const isLast = txIndex === tripGroup.transactions.length - 1;
            const subColor = tx.category?.color ?? tripColor;
            const categoryName = tx.parentCategory
              ? `${tx.parentCategory.name} › ${tx.category?.name ?? ''}`
              : (tx.category?.name ?? t('transactions.no-category'));

            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: Edit action provides keyboard access
              // biome-ignore lint/a11y/noStaticElementInteractions: Cannot use button due to nested interactive elements
              <div
                key={tx.transactionId}
                className="relative flex items-center gap-3 py-1.5 pl-6 pr-2 cursor-pointer hover:bg-muted/50 rounded-r-lg transition-colors group/sub"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditTransaction?.(tx);
                }}
              >
                {/* Vertical line: full height for non-last, half for last */}
                <div className="absolute left-2 top-0 w-0.5 bg-muted" style={{ height: isLast ? '50%' : '100%' }} />
                {/* Horizontal connector */}
                <div className="absolute left-2 top-1/2 w-3 h-0.5 bg-muted -translate-y-px" />
                <div className="flex-shrink-0 p-1 rounded" style={{ backgroundColor: `${subColor}15` }}>
                  <CategoryIcon icon={tx.category?.icon} color={subColor} className="h-3 w-3" />
                </div>
                <span className="text-xs text-guard-muted w-12 flex-shrink-0">{formatDate(tx.transactionDate)}</span>
                <span className="text-xs text-foreground flex-1 truncate" title={categoryName}>
                  {categoryName}
                  {tx.description && <span className="text-guard-muted"> — {tx.description}</span>}
                </span>
                {tx.sharedDivisor > SHARED_EXPENSE.DEFAULT_DIVISOR && (
                  <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-guard-primary/10 text-guard-primary">
                    {t('transactions.shared-badge')}
                  </span>
                )}
                <span
                  className={cn('text-xs font-medium', {
                    'text-guard-success': isIncome,
                    'text-guard-danger': !isIncome,
                  })}
                >
                  -{formatCurrency(tx.amountCents)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
