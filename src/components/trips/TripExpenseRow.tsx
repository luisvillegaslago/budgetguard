'use client';

/**
 * BudgetGuard Trip Expense Row
 * Individual expense row within a trip detail view
 */

import { ArrowUpRight, Pencil } from 'lucide-react';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { DeleteButton } from '@/components/ui/DeleteButton';
import { SHARED_EXPENSE, TRIP_COLOR } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import type { Transaction } from '@/types/finance';
import { formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface TripExpenseRowProps {
  transaction: Transaction;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transactionId: number) => void;
  isDeleting: boolean;
  index: number;
}

export function TripExpenseRow({ transaction, onEdit, onDelete, isDeleting, index }: TripExpenseRowProps) {
  const { t } = useTranslate();
  const isShared = transaction.sharedDivisor > SHARED_EXPENSE.DEFAULT_DIVISOR;
  const iconColor = transaction.category?.color ?? TRIP_COLOR;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Edit button provides keyboard access
    // biome-ignore lint/a11y/noStaticElementInteractions: Cannot use <button> due to nested interactive elements
    <div
      className="flex items-center gap-4 py-3 px-4 hover:bg-muted/50 rounded-lg transition-colors group animate-fade-in cursor-pointer"
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'both' }}
      onClick={() => onEdit(transaction)}
    >
      {/* Date */}
      <div className="w-16 flex-shrink-0">
        <span className="text-sm text-guard-muted">{formatDate(transaction.transactionDate)}</span>
      </div>

      {/* Category Icon */}
      <div className="flex-shrink-0 p-2 rounded-lg" style={{ backgroundColor: `${iconColor}15` }}>
        <CategoryIcon icon={transaction.category?.icon} color={iconColor} />
      </div>

      {/* Category & Description */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {transaction.category?.name ?? t('transactions.no-category')}
        </p>
        {transaction.description && <p className="text-xs text-guard-muted truncate">{transaction.description}</p>}
      </div>

      {/* Badges + Amount */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {isShared && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-guard-primary/10 text-guard-primary">
            {t('transactions.shared-badge')}
          </span>
        )}
        <div className="text-sm font-semibold text-guard-danger">
          <span className="flex items-center gap-1">
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />-{formatCurrency(transaction.amountCents)}
          </span>
        </div>
      </div>

      {/* Edit Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit(transaction);
        }}
        className="p-2 rounded-lg transition-all duration-200 ease-out-quart text-guard-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-guard-primary/10 hover:text-guard-primary"
        aria-label={t('category-management.actions.edit')}
      >
        <Pencil className="h-4 w-4" aria-hidden="true" />
      </button>

      <DeleteButton onDelete={() => onDelete(transaction.transactionId)} isDeleting={isDeleting} />
    </div>
  );
}
