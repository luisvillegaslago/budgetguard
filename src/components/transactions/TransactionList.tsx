'use client';

/**
 * BudgetGuard Transaction List
 * Displays transactions for the selected month
 */

import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Beer,
  Briefcase,
  Calendar,
  Car,
  Cloud,
  Dog,
  Dumbbell,
  Home,
  type LucideIcon,
  Plane,
  PlusCircle,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  Utensils,
} from 'lucide-react';
import { useState } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { TRANSACTION_TYPE } from '@/constants/finance';
import { useDeleteTransaction, useTransactions } from '@/hooks/useTransactions';
import { useTranslate } from '@/hooks/useTranslations';
import { useSelectedMonth } from '@/stores/useFinanceStore';
import type { Transaction } from '@/types/finance';
import { cn, formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

// Map icon names to Lucide components
const iconMap: Record<string, LucideIcon> = {
  home: Home,
  dog: Dog,
  briefcase: Briefcase,
  dumbbell: Dumbbell,
  cloud: Cloud,
  'shopping-cart': ShoppingCart,
  car: Car,
  utensils: Utensils,
  'shopping-bag': ShoppingBag,
  beer: Beer,
  'alert-circle': AlertCircle,
  plane: Plane,
  calendar: Calendar,
  banknote: Banknote,
  receipt: Receipt,
  'plus-circle': PlusCircle,
};

interface TransactionRowProps {
  transaction: Transaction;
  onDelete: (id: number) => void;
  isDeleting: boolean;
}

function TransactionRow({ transaction, onDelete, isDeleting }: TransactionRowProps) {
  const { t } = useTranslate();
  const [showConfirm, setShowConfirm] = useState(false);
  const isIncome = transaction.type === TRANSACTION_TYPE.INCOME;
  const IconComponent = transaction.category?.icon ? iconMap[transaction.category.icon] : AlertCircle;
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
    <div className="flex items-center gap-4 py-3 px-4 hover:bg-muted/50 rounded-lg transition-colors group animate-fade-in">
      {/* Date */}
      <div className="w-16 flex-shrink-0">
        <span className="text-sm text-guard-muted">{formatDate(transaction.transactionDate)}</span>
      </div>

      {/* Category Icon */}
      <div className="flex-shrink-0 p-2 rounded-lg" style={{ backgroundColor: `${iconColor}15` }}>
        {IconComponent && <IconComponent className="h-4 w-4" style={{ color: iconColor }} />}
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
          {isIncome ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
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
          'p-2 rounded-lg transition-all',
          showConfirm
            ? 'bg-guard-danger text-white'
            : 'text-guard-muted opacity-0 group-hover:opacity-100 hover:bg-guard-danger/10 hover:text-guard-danger',
        )}
        aria-label={showConfirm ? t('transactions.delete.confirm') : t('transactions.delete.button')}
      >
        {isDeleting ? <LoadingSpinner size="sm" /> : <Trash2 className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function TransactionList() {
  const { t } = useTranslate();
  const selectedMonth = useSelectedMonth();
  const { data, isLoading, isError } = useTransactions(selectedMonth);
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
        <p className="text-guard-danger text-center py-8">{t('errors.load-transactions')}</p>
      </div>
    );
  }

  const transactions = data?.data ?? [];

  if (transactions.length === 0) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-foreground mb-4">{t('transactions.title')}</h3>
        <div className="text-center py-8 text-guard-muted">
          <Receipt className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>{t('transactions.empty.title')}</p>
          <p className="text-sm mt-1">{t('transactions.empty.subtitle')}</p>
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

      <div className="-mx-4">
        {transactions.map((transaction) => (
          <TransactionRow
            key={transaction.transactionId}
            transaction={transaction}
            onDelete={handleDelete}
            isDeleting={deleteTransaction.isPending}
          />
        ))}
      </div>
    </div>
  );
}
