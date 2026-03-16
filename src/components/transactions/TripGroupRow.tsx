'use client';

/**
 * BudgetGuard Trip Group Row
 * Collapsible row showing all expenses from a trip, grouped into a single entry
 */

import { ArrowUpRight, ChevronDown, ChevronRight, ExternalLink, Layers, Plane } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { OverflowTooltip } from '@/components/ui/OverflowTooltip';
import { Tooltip } from '@/components/ui/Tooltip';
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
        className="py-3 px-3 sm:px-4 hover:bg-muted/50 rounded-lg transition-colors group cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Desktop: single row */}
        <div className="hidden sm:flex items-center gap-4">
          <div className="flex-shrink-0 p-2 rounded-lg" style={{ backgroundColor: `${tripColor}15` }}>
            <Plane className="h-4 w-4" style={{ color: tripColor }} aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <OverflowTooltip content={tripGroup.tripName}>
              <p className="text-sm font-medium text-foreground truncate">{tripGroup.tripName}</p>
            </OverflowTooltip>
            <p className="text-xs text-guard-muted truncate">
              {formatDate(tripGroup.startDate)} {'· '}
              {t('transactions.trip-group.expenses', { count: tripGroup.transactions.length })}
            </p>
          </div>
          <div className="flex items-center justify-end gap-1.5 flex-shrink-0 w-20">
            <Tooltip content={t('transactions.groups.badge')}>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-guard-primary/10 text-guard-primary">
                <Layers className="h-3 w-3" aria-hidden="true" />
              </span>
            </Tooltip>
          </div>
          <span
            className={cn(
              'text-sm font-semibold flex-shrink-0 flex items-center justify-end gap-1 tabular-nums min-w-[90px] text-right',
              {
                'text-guard-success': isIncome,
                'text-guard-danger': !isIncome,
              },
            )}
          >
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />-{formatCurrency(tripGroup.totalAmountCents)}
          </span>
          <div className="flex items-center justify-end flex-shrink-0 w-16">
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
            <Link
              href={`/trips/${tripGroup.tripId}?from=dashboard`}
              className="p-1.5 rounded-lg text-guard-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-purple-500 hover:bg-purple-500/10 transition-all duration-200 ease-out-quart"
              aria-label={t('transactions.trip-group.view-detail')}
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* Mobile: two rows */}
        <div className="sm:hidden">
          {/* Row 1: Icon + Trip Name + Amount */}
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0 p-2 rounded-lg" style={{ backgroundColor: `${tripColor}15` }}>
              <Plane className="h-4 w-4" style={{ color: tripColor }} aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-foreground truncate flex-1 min-w-0">{tripGroup.tripName}</p>
            <span
              className={cn(
                'text-sm font-semibold flex-shrink-0 flex items-center justify-end gap-1 tabular-nums min-w-[90px] text-right',
                {
                  'text-guard-success': isIncome,
                  'text-guard-danger': !isIncome,
                },
              )}
            >
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />-{formatCurrency(tripGroup.totalAmountCents)}
            </span>
          </div>
          {/* Row 2: Date · Count ... Badge + Chevron */}
          <div className="flex items-center gap-1 mt-1 ml-11">
            <span className="text-xs text-guard-muted flex-shrink-0">{formatDate(tripGroup.startDate)}</span>
            <span className="text-xs text-guard-muted truncate min-w-0">
              {'· '}
              {t('transactions.trip-group.expenses', { count: tripGroup.transactions.length })}
            </span>
            <div className="flex items-center gap-0.5 flex-shrink-0 ml-auto">
              <button
                type="button"
                className="p-1 rounded-lg text-guard-muted hover:text-foreground hover:bg-muted transition-colors"
                aria-label={isExpanded ? t('transactions.trip-group.collapse') : t('transactions.trip-group.expand')}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Breakdown */}
      {isExpanded && (
        <div className="ml-10 sm:ml-[4.5rem] mb-2 animate-slide-up">
          {tripGroup.transactions.map((tx, txIndex) => {
            const isLast = txIndex === tripGroup.transactions.length - 1;
            const subColor = tx.category?.color ?? tripColor;
            const categoryName = tx.parentCategory
              ? `${tx.parentCategory.name} › ${tx.category?.name ?? ''}`
              : (tx.category?.name ?? t('transactions.no-category'));

            return (
              <div
                key={tx.transactionId}
                className="relative py-1.5 pl-6 pr-2 hover:bg-muted/50 rounded-r-lg transition-colors group/sub"
              >
                {/* Vertical line: full height for non-last, half for last */}
                <div className="absolute left-2 top-0 w-0.5 bg-muted" style={{ height: isLast ? '50%' : '100%' }} />
                {/* Horizontal connector */}
                <div className="absolute left-2 top-1/2 w-3 h-0.5 bg-muted -translate-y-px" />

                {/* Desktop: single row */}
                {/* biome-ignore lint/a11y/useKeyWithClickEvents: Edit action provides keyboard access */}
                {/* biome-ignore lint/a11y/noStaticElementInteractions: Cannot use button due to nested interactive elements */}
                <div
                  className="hidden sm:flex items-center gap-3 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditTransaction?.(tx);
                  }}
                >
                  <div className="flex-shrink-0 p-1 rounded" style={{ backgroundColor: `${subColor}15` }}>
                    <CategoryIcon icon={tx.category?.icon} color={subColor} className="h-3 w-3" />
                  </div>
                  <span className="text-xs text-guard-muted w-12 flex-shrink-0">{formatDate(tx.transactionDate)}</span>
                  <OverflowTooltip content={categoryName}>
                    <span className="text-xs text-foreground flex-1 truncate">
                      {categoryName}
                      {tx.description && <span className="text-guard-muted"> — {tx.description}</span>}
                    </span>
                  </OverflowTooltip>
                  {tx.sharedDivisor > SHARED_EXPENSE.DEFAULT_DIVISOR && (
                    <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-guard-primary/10 text-guard-primary">
                      {t('transactions.shared-badge')}
                    </span>
                  )}
                  <span
                    className={cn('text-xs font-medium flex-shrink-0', {
                      'text-guard-success': isIncome,
                      'text-guard-danger': !isIncome,
                    })}
                  >
                    -{formatCurrency(tx.amountCents)}
                  </span>
                </div>

                {/* Mobile: two rows */}
                <div className="sm:hidden">
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 p-1 rounded" style={{ backgroundColor: `${subColor}15` }}>
                      <CategoryIcon icon={tx.category?.icon} color={subColor} className="h-3 w-3" />
                    </div>
                    <span className="text-xs text-foreground truncate flex-1 min-w-0">{categoryName}</span>
                    <span
                      className={cn('text-xs font-medium flex-shrink-0', {
                        'text-guard-success': isIncome,
                        'text-guard-danger': !isIncome,
                      })}
                    >
                      -{formatCurrency(tx.amountCents)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 ml-6 text-[11px] text-guard-muted">
                    <span className="flex-shrink-0">{formatDate(tx.transactionDate)}</span>
                    {tx.description && (
                      <>
                        <span className="flex-shrink-0">·</span>
                        <span className="truncate">{tx.description}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
