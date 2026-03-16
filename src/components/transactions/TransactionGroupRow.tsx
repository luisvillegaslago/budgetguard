'use client';

/**
 * BudgetGuard Transaction Group Row
 * Collapsible row showing a group of linked transactions with expandable breakdown
 */

import { ArrowUpRight, ChevronDown, ChevronRight, Layers, Users } from 'lucide-react';
import { useState } from 'react';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { DeleteButton } from '@/components/ui/DeleteButton';
import { OverflowTooltip } from '@/components/ui/OverflowTooltip';
import { Tooltip } from '@/components/ui/Tooltip';
import { SHARED_EXPENSE, TRANSACTION_TYPE } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import type { Transaction, TransactionGroupDisplay } from '@/types/finance';
import { cn, formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface TransactionGroupRowProps {
  group: TransactionGroupDisplay;
  onDelete: (groupId: number) => void;
  onEditTransaction?: (transaction: Transaction) => void;
  isDeleting: boolean;
  index: number;
}

export function TransactionGroupRow({
  group,
  onDelete,
  onEditTransaction,
  isDeleting,
  index,
}: TransactionGroupRowProps) {
  const { t } = useTranslate();
  const [isExpanded, setIsExpanded] = useState(false);
  const isIncome = group.type === TRANSACTION_TYPE.INCOME;
  const iconColor = group.parentCategoryColor ?? (isIncome ? '#10B981' : '#EF4444');

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
          <div className="flex-shrink-0 p-2 rounded-lg" style={{ backgroundColor: `${iconColor}15` }}>
            <CategoryIcon icon={group.parentCategoryIcon} color={iconColor} />
          </div>
          <div className="flex-1 min-w-0">
            <OverflowTooltip content={group.parentCategoryName}>
              <p className="text-sm font-medium text-foreground truncate">{group.parentCategoryName}</p>
            </OverflowTooltip>
            <p className="text-xs text-guard-muted truncate">
              {formatDate(group.transactionDate)} · {group.transactions.length}{' '}
              {t('common.records', { count: group.transactions.length }).split(' ').slice(1).join(' ')}
            </p>
          </div>
          <div className="flex items-center justify-end gap-1.5 flex-shrink-0 w-20">
            <Tooltip content={t('transactions.groups.badge')}>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-guard-primary/10 text-guard-primary">
                <Layers className="h-3 w-3" aria-hidden="true" />
              </span>
            </Tooltip>
            {group.isShared && (
              <Tooltip content={t('transactions.shared-badge')}>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400">
                  <Users className="h-3 w-3" aria-hidden="true" />
                </span>
              </Tooltip>
            )}
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
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />-{formatCurrency(group.totalAmountCents)}
          </span>
          <div className="flex items-center justify-end flex-shrink-0 w-16">
            <button
              type="button"
              className="p-1.5 rounded-lg text-guard-muted hover:text-foreground hover:bg-muted transition-colors"
              aria-label={isExpanded ? t('transactions.groups.collapse') : t('transactions.groups.expand')}
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
            <DeleteButton
              onDelete={() => onDelete(group.transactionGroupId)}
              isDeleting={isDeleting}
              confirmLabel={t('transactions.groups.delete.confirm', { count: group.transactions.length })}
              defaultLabel={t('transactions.groups.delete.button')}
            />
          </div>
        </div>

        {/* Mobile: two rows */}
        <div className="sm:hidden">
          {/* Row 1: Icon + Category + Amount */}
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0 p-2 rounded-lg" style={{ backgroundColor: `${iconColor}15` }}>
              <CategoryIcon icon={group.parentCategoryIcon} color={iconColor} />
            </div>
            <p className="text-sm font-medium text-foreground truncate flex-1 min-w-0">{group.parentCategoryName}</p>
            <span
              className={cn(
                'text-sm font-semibold flex-shrink-0 flex items-center justify-end gap-1 tabular-nums min-w-[90px] text-right',
                {
                  'text-guard-success': isIncome,
                  'text-guard-danger': !isIncome,
                },
              )}
            >
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />-{formatCurrency(group.totalAmountCents)}
            </span>
          </div>
          {/* Row 2: Date · Count ... Badge + Chevron | Delete */}
          <div className="flex items-center gap-1 mt-1 ml-11">
            <span className="text-xs text-guard-muted flex-shrink-0">{formatDate(group.transactionDate)}</span>
            <span className="text-xs text-guard-muted truncate min-w-0">
              {'· '}
              {group.transactions.length}{' '}
              {t('common.records', { count: group.transactions.length }).split(' ').slice(1).join(' ')}
            </span>
            <div className="flex items-center gap-0.5 flex-shrink-0 ml-auto">
              <Tooltip content={t('transactions.groups.badge')}>
                <span className="text-[10px] font-bold p-1 rounded bg-guard-primary/10 text-guard-primary">
                  <Layers className="h-3 w-3" aria-hidden="true" />
                </span>
              </Tooltip>
              {group.isShared && (
                <Tooltip content={t('transactions.shared-badge')}>
                  <span className="text-[10px] font-bold p-1 rounded bg-guard-primary/10 text-guard-primary">
                    <Users className="h-3 w-3" aria-hidden="true" />
                  </span>
                </Tooltip>
              )}
              <button
                type="button"
                className="p-1 rounded-lg text-guard-muted hover:text-foreground hover:bg-muted transition-colors"
                aria-label={isExpanded ? t('transactions.groups.collapse') : t('transactions.groups.expand')}
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
              <DeleteButton
                onDelete={() => onDelete(group.transactionGroupId)}
                isDeleting={isDeleting}
                confirmLabel={t('transactions.groups.delete.confirm', { count: group.transactions.length })}
                defaultLabel={t('transactions.groups.delete.button')}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Breakdown */}
      {isExpanded && (
        <div className="ml-10 sm:ml-[4.5rem] mb-2 animate-slide-up">
          {group.transactions.map((tx, txIndex) => {
            const isLast = txIndex === group.transactions.length - 1;
            const subColor = tx.category?.color ?? iconColor;
            const categoryName = tx.category?.name ?? t('transactions.no-category');
            const hasOwnDescription = tx.description && tx.description !== group.description;
            const displayName = hasOwnDescription ? `${categoryName} (${tx.description})` : categoryName;

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
                {/* biome-ignore lint/a11y/useKeyWithClickEvents: Edit button provides keyboard access */}
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
                  <OverflowTooltip content={displayName}>
                    <span className="text-xs text-foreground flex-1 truncate">
                      {categoryName}
                      {hasOwnDescription && <span className="text-guard-muted"> ({tx.description})</span>}
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
                  {hasOwnDescription && (
                    <p className="mt-0.5 ml-6 text-[11px] text-guard-muted truncate">{tx.description}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
