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

  const amountEl = (
    <span className="text-sm font-semibold text-guard-danger flex-shrink-0 flex items-center justify-end gap-1 tabular-nums min-w-[90px] text-right">
      <ArrowUpRight className="h-3 w-3" aria-hidden="true" />-{formatCurrency(transaction.amountCents)}
    </span>
  );

  return (
    <div
      className="py-3 px-3 sm:px-4 hover:bg-muted/50 rounded-lg transition-colors group animate-fade-in"
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'both' }}
    >
      {/* Desktop: single row — clickable */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Edit button provides keyboard access */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Cannot use button due to nested interactive elements */}
      <div className="hidden sm:flex items-center gap-4 cursor-pointer" onClick={() => onEdit(transaction)}>
        <div className="w-16 flex-shrink-0">
          <span className="text-sm text-guard-muted">{formatDate(transaction.transactionDate)}</span>
        </div>
        <div className="flex-shrink-0 p-2 rounded-lg" style={{ backgroundColor: `${iconColor}15` }}>
          <CategoryIcon icon={transaction.category?.icon} color={iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {transaction.category?.name ?? t('transactions.no-category')}
          </p>
          {transaction.description && <p className="text-xs text-guard-muted truncate">{transaction.description}</p>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isShared && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-guard-primary/10 text-guard-primary">
              {t('transactions.shared-badge')}
            </span>
          )}
        </div>
        <div className="flex items-center justify-end flex-shrink-0">
          {amountEl}
          <div className="flex items-center overflow-hidden max-w-0 ml-2 group-hover:max-w-[96px] group-focus-within:max-w-[96px] transition-all duration-200 ease-out-quart group-hover:delay-300">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(transaction);
              }}
              className="p-1.5 rounded-lg text-guard-muted hover:bg-guard-primary/10 hover:text-guard-primary transition-colors"
              aria-label={t('category-management.actions.edit')}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
            <DeleteButton
              onDelete={() => onDelete(transaction.transactionId)}
              isDeleting={isDeleting}
              className="sm:opacity-100"
            />
          </div>
        </div>
      </div>

      {/* Mobile: two rows */}
      <div className="sm:hidden">
        {/* Row 1: Icon + Category + Amount */}
        <div className="flex items-center gap-2">
          <div className="flex-shrink-0 p-2 rounded-lg" style={{ backgroundColor: `${iconColor}15` }}>
            <CategoryIcon icon={transaction.category?.icon} color={iconColor} />
          </div>
          <p className="text-sm font-medium text-foreground truncate flex-1 min-w-0">
            {transaction.category?.name ?? t('transactions.no-category')}
          </p>
          {amountEl}
        </div>
        {/* Row 2: Date · Description ... Badges + Edit | Delete */}
        <div className="flex items-center gap-1 mt-1 ml-11">
          <span className="text-xs text-guard-muted flex-shrink-0">{formatDate(transaction.transactionDate)}</span>
          {transaction.description && (
            <span className="text-xs text-guard-muted truncate min-w-0">
              {'· '}
              {transaction.description}
            </span>
          )}
          <div className="flex items-center gap-0.5 flex-shrink-0 ml-auto">
            {isShared && (
              <span className="text-[10px] font-bold p-1 rounded bg-guard-primary/10 text-guard-primary">
                {t('transactions.shared-badge')}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(transaction);
              }}
              className="p-1 rounded-lg text-guard-muted hover:bg-guard-primary/10 hover:text-guard-primary transition-colors"
              aria-label={t('category-management.actions.edit')}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <DeleteButton onDelete={() => onDelete(transaction.transactionId)} isDeleting={isDeleting} />
          </div>
        </div>
      </div>
    </div>
  );
}
