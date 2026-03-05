'use client';

/**
 * BudgetGuard Transaction Group Row
 * Collapsible row showing a group of linked transactions with expandable breakdown
 */

import { ArrowUpRight, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SHARED_EXPENSE, TRANSACTION_TYPE } from '@/constants/finance';
import { useConfirmTimeout } from '@/hooks/useConfirmTimeout';
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
  const { showConfirm, handleConfirm: handleDelete } = useConfirmTimeout(() => onDelete(group.transactionGroupId));
  const isIncome = group.type === TRANSACTION_TYPE.INCOME;
  const iconColor = group.parentCategoryColor ?? (isIncome ? '#10B981' : '#EF4444');

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
          <span className="text-sm text-guard-muted">{formatDate(group.transactionDate)}</span>
        </div>

        {/* Category Icon */}
        <div className="flex-shrink-0 p-2 rounded-lg" style={{ backgroundColor: `${iconColor}15` }}>
          <CategoryIcon icon={group.parentCategoryIcon} color={iconColor} />
        </div>

        {/* Category & Description */}
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-medium text-foreground truncate"
            title={`${group.parentCategoryName}${group.description ? ` › ${group.description}` : ''}`}
          >
            {group.parentCategoryName}
            {group.description ? ` › ${group.description}` : ''}
          </p>
          <p className="text-xs text-guard-muted">
            {group.transactions.length}{' '}
            {t('common.records', { count: group.transactions.length }).split(' ').slice(1).join(' ')}
          </p>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-guard-primary/10 text-guard-primary">
            {t('transactions.groups.badge')}
          </span>
          {group.isShared && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-guard-primary/10 text-guard-primary">
              {t('transactions.shared-badge')}
            </span>
          )}
        </div>

        {/* Amount */}
        <div
          className={cn('text-sm font-semibold flex-shrink-0', {
            'text-guard-success': isIncome,
            'text-guard-danger': !isIncome,
          })}
        >
          <span className="flex items-center gap-1">
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />-{formatCurrency(group.totalAmountCents)}
          </span>
        </div>

        {/* Expand/Collapse Chevron */}
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

        {/* Delete Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleDelete();
          }}
          disabled={isDeleting}
          className={cn(
            'p-2 rounded-lg transition-all duration-200 ease-out-quart',
            showConfirm
              ? 'bg-guard-danger text-white'
              : 'text-guard-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-guard-danger/10 hover:text-guard-danger',
          )}
          aria-label={
            showConfirm
              ? t('transactions.groups.delete.confirm', { count: group.transactions.length })
              : t('transactions.groups.delete.button')
          }
        >
          {isDeleting ? (
            <LoadingSpinner size="sm" />
          ) : showConfirm ? (
            <span className="text-xs font-bold">?</span>
          ) : (
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Expanded Breakdown */}
      {isExpanded && (
        <div className="ml-[4.5rem] mb-2 animate-slide-up">
          {group.transactions.map((tx, txIndex) => {
            const isLast = txIndex === group.transactions.length - 1;
            const subColor = tx.category?.color ?? iconColor;
            const categoryName = tx.category?.name ?? t('transactions.no-category');
            const hasOwnDescription = tx.description && tx.description !== group.description;
            const displayName = hasOwnDescription ? `${categoryName} (${tx.description})` : categoryName;

            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: Edit button provides keyboard access
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
                <span className="text-xs text-foreground flex-1 truncate" title={displayName}>
                  {categoryName}
                  {hasOwnDescription && <span className="text-guard-muted"> ({tx.description})</span>}
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
