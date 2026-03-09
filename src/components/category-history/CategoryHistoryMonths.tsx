'use client';

/**
 * Monthly transaction sections with sticky headers for category history
 * Supports optional edit/delete actions via callbacks
 */

import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Tooltip } from '@/components/ui/Tooltip';
import { SHARED_EXPENSE } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import type { CategoryHistoryMonth, Transaction } from '@/types/finance';
import { cn, formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface TransactionRowProps {
  transaction: Transaction;
  onEdit?: (transaction: Transaction) => void;
  onDelete?: (transactionId: number) => void;
}

function TransactionRow({ transaction, onEdit, onDelete }: TransactionRowProps) {
  const { t } = useTranslate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const subcategoryName = transaction.category?.name ?? t('transactions.no-category');
  const isShared = transaction.sharedDivisor > SHARED_EXPENSE.DEFAULT_DIVISOR;
  const handleDelete = () => {
    if (confirmDelete) {
      onDelete?.(transaction.transactionId);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
    }
  };

  return (
    <div className="flex items-center gap-3 py-2.5 px-4 group hover:bg-muted/30 transition-colors">
      <span className="text-xs text-guard-muted w-12 flex-shrink-0">{formatDate(transaction.transactionDate)}</span>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{transaction.description || subcategoryName}</p>
        {transaction.description && <p className="text-xs text-guard-muted truncate">{subcategoryName}</p>}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {isShared && (
          <span className="text-[10px] font-medium text-guard-primary bg-guard-primary/10 px-1 py-0.5 rounded">
            {t('transactions.shared-badge')}
          </span>
        )}
        <span className="text-sm font-semibold text-guard-danger tabular-nums">
          {formatCurrency(transaction.amountCents)}
        </span>

        {(onEdit || onDelete) && (
          <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onEdit && (
              <Tooltip content={t('category-management.actions.edit')}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(transaction);
                  }}
                  className="p-1.5 text-guard-muted hover:text-foreground rounded transition-colors"
                  aria-label={t('category-management.actions.edit')}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </Tooltip>
            )}
            {onDelete && (
              <Tooltip content={confirmDelete ? t('movements.delete-confirm') : t('movements.delete-transaction')}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete();
                  }}
                  onBlur={() => setConfirmDelete(false)}
                  className={cn(
                    'p-1.5 rounded transition-colors',
                    confirmDelete ? 'text-guard-danger bg-guard-danger/10' : 'text-guard-muted hover:text-guard-danger',
                  )}
                  aria-label={confirmDelete ? t('movements.delete-confirm') : t('movements.delete-transaction')}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface MonthSectionProps {
  monthData: CategoryHistoryMonth;
  onEdit?: (transaction: Transaction) => void;
  onDelete?: (transactionId: number) => void;
}

function MonthSection({ monthData, onEdit, onDelete }: MonthSectionProps) {
  const { t } = useTranslate();
  const monthLabel = formatDate(`${monthData.month}-01`, 'month');

  return (
    <section>
      <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-white/80 dark:bg-guard-dark/80 backdrop-blur-md border-b border-guard-muted/10">
        <span className="text-sm font-bold uppercase tracking-wider text-guard-muted">{monthLabel}</span>
        <span className="text-sm font-semibold text-guard-danger">
          {t('category-history.month-total', { amount: formatCurrency(monthData.totalCents) })}
        </span>
      </div>

      <div className="divide-y divide-border/50">
        {monthData.transactions.map((tx: Transaction) => (
          <TransactionRow key={tx.transactionId} transaction={tx} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </section>
  );
}

interface CategoryHistoryMonthsProps {
  months: CategoryHistoryMonth[];
  groupByMonth?: boolean;
  onEditTransaction?: (transaction: Transaction) => void;
  onDeleteTransaction?: (transactionId: number) => void;
}

export function CategoryHistoryMonths({
  months,
  groupByMonth = true,
  onEditTransaction,
  onDeleteTransaction,
}: CategoryHistoryMonthsProps) {
  if (!groupByMonth) {
    const allTransactions = months.flatMap((m) => m.transactions);
    return (
      <div className="card overflow-hidden p-0">
        <div className="divide-y divide-border/50">
          {allTransactions.map((tx) => (
            <TransactionRow
              key={tx.transactionId}
              transaction={tx}
              onEdit={onEditTransaction}
              onDelete={onDeleteTransaction}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden p-0">
      {months.map((monthData) => (
        <MonthSection
          key={monthData.month}
          monthData={monthData}
          onEdit={onEditTransaction}
          onDelete={onDeleteTransaction}
        />
      ))}
    </div>
  );
}
