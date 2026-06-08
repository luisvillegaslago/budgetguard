'use client';

/**
 * Monthly transaction sections with sticky headers for category history
 * Supports optional edit/delete actions via callbacks.
 *
 * Money is colored by the category transaction type (income = success,
 * expense = danger) with a non-color sign cue (+/−) per DESIGN.md, instead of
 * a hardcoded "expense red". Deletion uses the shared ConfirmDialog (variant
 * danger) rather than a fragile double-click/onBlur pattern.
 */

import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Tooltip } from '@/components/ui/Tooltip';
import { SHARED_EXPENSE, TRANSACTION_TYPE } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import type { CategoryHistoryMonth, Transaction, TransactionType } from '@/types/finance';
import { cn, formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

/** Build a signed, type-aware money string (+/− cue beyond color). */
function signedAmount(cents: number, type: TransactionType): string {
  const sign = type === TRANSACTION_TYPE.INCOME ? '+' : '−';
  return `${sign}${formatCurrency(cents)}`;
}

/** Color token for money by transaction type. */
function amountAccent(type: TransactionType): string {
  return type === TRANSACTION_TYPE.INCOME ? 'text-guard-success' : 'text-guard-danger';
}

interface TransactionRowProps {
  transaction: Transaction;
  categoryType: TransactionType;
  onEdit?: (transaction: Transaction) => void;
  onRequestDelete?: (transaction: Transaction) => void;
}

function TransactionRow({ transaction, categoryType, onEdit, onRequestDelete }: TransactionRowProps) {
  const { t } = useTranslate();
  const subcategoryName = transaction.category?.name ?? t('transactions.no-category');
  const isShared = transaction.sharedDivisor > SHARED_EXPENSE.DEFAULT_DIVISOR;

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
        <span className={cn('text-sm font-semibold tabular-nums', amountAccent(categoryType))}>
          {signedAmount(transaction.amountCents, categoryType)}
        </span>

        {(onEdit || onRequestDelete) && (
          <div className="flex items-center gap-0.5 ml-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
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
            {onRequestDelete && (
              <Tooltip content={t('movements.delete-transaction')}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestDelete(transaction);
                  }}
                  className="p-1.5 rounded transition-colors text-guard-muted hover:text-guard-danger"
                  aria-label={t('movements.delete-transaction')}
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
  categoryType: TransactionType;
  onEdit?: (transaction: Transaction) => void;
  onRequestDelete?: (transaction: Transaction) => void;
}

function MonthSection({ monthData, categoryType, onEdit, onRequestDelete }: MonthSectionProps) {
  const { t } = useTranslate();
  const monthLabel = formatDate(`${monthData.month}-01`, 'month');

  return (
    <section>
      <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-white/80 dark:bg-guard-dark/80 backdrop-blur-md border-b border-guard-muted/10">
        <span className="text-sm font-bold uppercase tracking-wider text-guard-muted">{monthLabel}</span>
        <span className={cn('text-sm font-semibold tabular-nums', amountAccent(categoryType))}>
          {t('category-history.month-total', { amount: signedAmount(monthData.totalCents, categoryType) })}
        </span>
      </div>

      <div className="divide-y divide-border/50">
        {monthData.transactions.map((tx: Transaction) => (
          <TransactionRow
            key={tx.transactionId}
            transaction={tx}
            categoryType={categoryType}
            onEdit={onEdit}
            onRequestDelete={onRequestDelete}
          />
        ))}
      </div>
    </section>
  );
}

interface CategoryHistoryMonthsProps {
  months: CategoryHistoryMonth[];
  categoryType: TransactionType;
  groupByMonth?: boolean;
  onEditTransaction?: (transaction: Transaction) => void;
  onDeleteTransaction?: (transactionId: number) => void;
  /** Whether a delete request is in flight (drives the ConfirmDialog spinner). */
  isDeleting?: boolean;
}

export function CategoryHistoryMonths({
  months,
  categoryType,
  groupByMonth = true,
  onEditTransaction,
  onDeleteTransaction,
  isDeleting = false,
}: CategoryHistoryMonthsProps) {
  const { t } = useTranslate();
  // Transaction pending confirmation in the shared dialog (null = closed).
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);

  const requestDelete = onDeleteTransaction ? (transaction: Transaction) => setPendingDelete(transaction) : undefined;

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    onDeleteTransaction?.(pendingDelete.transactionId);
    setPendingDelete(null);
  };

  const deleteDialog = (
    <ConfirmDialog
      open={pendingDelete !== null}
      title={t('movements.delete-transaction')}
      message={t('category-history.delete.confirm', {
        description: pendingDelete?.description || pendingDelete?.category?.name || t('transactions.no-category'),
      })}
      confirmLabel={t('common.buttons.delete')}
      variant="danger"
      isLoading={isDeleting}
      onConfirm={confirmDelete}
      onCancel={() => setPendingDelete(null)}
    />
  );

  if (!groupByMonth) {
    const allTransactions = months.flatMap((m) => m.transactions);
    return (
      <div className="card overflow-hidden p-0">
        <div className="divide-y divide-border/50">
          {allTransactions.map((tx) => (
            <TransactionRow
              key={tx.transactionId}
              transaction={tx}
              categoryType={categoryType}
              onEdit={onEditTransaction}
              onRequestDelete={requestDelete}
            />
          ))}
        </div>
        {deleteDialog}
      </div>
    );
  }

  return (
    <div className="card overflow-hidden p-0">
      {months.map((monthData) => (
        <MonthSection
          key={monthData.month}
          monthData={monthData}
          categoryType={categoryType}
          onEdit={onEditTransaction}
          onRequestDelete={requestDelete}
        />
      ))}
      {deleteDialog}
    </div>
  );
}
