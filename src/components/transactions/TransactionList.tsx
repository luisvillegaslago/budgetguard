'use client';

/**
 * BudgetGuard Transaction List
 * Displays transactions for the selected month
 */

import { AlertCircle, ArrowDownLeft, ArrowUpRight, Plus, Receipt, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { TRANSACTION_TYPE } from '@/constants/finance';
import { useDeleteTransaction, useTransactions } from '@/hooks/useTransactions';
import { useTranslate } from '@/hooks/useTranslations';
import { useSelectedMonth } from '@/stores/useFinanceStore';
import type { Transaction } from '@/types/finance';
import { cn, formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface TransactionRowProps {
  transaction: Transaction;
  onDelete: (id: number) => void;
  isDeleting: boolean;
  index: number;
}

function TransactionRow({ transaction, onDelete, isDeleting, index }: TransactionRowProps) {
  const { t } = useTranslate();
  const [showConfirm, setShowConfirm] = useState(false);
  const isIncome = transaction.type === TRANSACTION_TYPE.INCOME;
  const iconColor = transaction.category?.color ?? (isIncome ? '#10B981' : '#EF4444');

  const handleDelete = () => {
    if (showConfirm) {
      onDelete(transaction.transactionId);
      setShowConfirm(false);
    } else {
      setShowConfirm(true);
    }
  };

  return (
    <div
      className="flex items-center gap-4 py-3 px-4 hover:bg-muted/50 rounded-lg transition-colors group animate-fade-in"
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'both' }}
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

      {/* Amount */}
      <div
        className={cn('text-sm font-semibold', {
          'text-guard-success': isIncome,
          'text-guard-danger': !isIncome,
        })}
      >
        <span className="flex items-center gap-1">
          {isIncome ? (
            <ArrowDownLeft className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          )}
          {isIncome ? '+' : '-'}
          {formatCurrency(transaction.amountCents)}
        </span>
      </div>

      {/* Delete Button */}
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        className={cn(
          'p-2 rounded-lg transition-all duration-200 ease-out-quart',
          showConfirm
            ? 'bg-guard-danger text-white'
            : 'text-guard-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-guard-danger/10 hover:text-guard-danger',
        )}
        aria-label={showConfirm ? t('transactions.delete.confirm') : t('transactions.delete.button')}
      >
        {isDeleting ? <LoadingSpinner size="sm" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
}

interface TransactionListProps {
  onAddTransaction?: () => void;
}

export function TransactionList({ onAddTransaction }: TransactionListProps) {
  const { t } = useTranslate();
  const selectedMonth = useSelectedMonth();
  const { data, isLoading, isError, refetch } = useTransactions(selectedMonth);
  const deleteTransaction = useDeleteTransaction();

  const handleDelete = (id: number) => {
    deleteTransaction.mutate(id);
  };

  if (isLoading) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-foreground mb-4">{t('transactions.title')}</h3>
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-foreground mb-4">{t('transactions.title')}</h3>
        <div className="text-center py-8" role="alert">
          <AlertCircle className="h-12 w-12 mx-auto mb-3 text-guard-danger opacity-50" aria-hidden="true" />
          <p className="text-guard-danger">{t('errors.load-transactions')}</p>
          <button type="button" onClick={() => refetch()} className="btn-ghost mt-4 inline-flex items-center gap-2">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t('common.buttons.retry')}
          </button>
        </div>
      </div>
    );
  }

  const transactions = data?.data ?? [];

  if (transactions.length === 0) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-foreground mb-4">{t('transactions.title')}</h3>
        <div className="text-center py-8 text-guard-muted">
          <Receipt className="h-12 w-12 mx-auto mb-3 opacity-30" aria-hidden="true" />
          <p>{t('transactions.empty.title')}</p>
          <p className="text-sm mt-1">{t('transactions.empty.subtitle')}</p>
          {onAddTransaction && (
            <button
              type="button"
              onClick={onAddTransaction}
              className="btn-primary mt-4 inline-flex items-center gap-2"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('common.buttons.add-first-transaction')}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">{t('transactions.title')}</h3>
        <span className="text-sm text-guard-muted">{t('common.records', { count: transactions.length })}</span>
      </div>

      <ul className="-mx-4">
        {transactions.map((transaction, index) => (
          <li key={transaction.transactionId}>
            <TransactionRow
              transaction={transaction}
              onDelete={handleDelete}
              isDeleting={deleteTransaction.isPending}
              index={index}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
