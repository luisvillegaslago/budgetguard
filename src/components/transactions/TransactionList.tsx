'use client';

/**
 * BudgetGuard Transaction List
 * Displays transactions for the selected month, with grouped transactions shown as collapsible rows
 */

import { ArrowDownLeft, ArrowUpRight, Pencil, Plane, Plus, Receipt, Repeat, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { DeleteButton } from '@/components/ui/DeleteButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FILTER_TYPE, SHARED_EXPENSE, TRANSACTION_TYPE } from '@/constants/finance';
import { useDeleteTransactionGroup } from '@/hooks/useTransactionGroups';
import { useDeleteTransaction, useGroupedTransactions } from '@/hooks/useTransactions';
import { useTranslate } from '@/hooks/useTranslations';
import { useFilters, useSelectedMonth } from '@/stores/useFinanceStore';
import type { Transaction, TransactionGroupDisplay, TripGroupDisplay } from '@/types/finance';
import { cn, formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';
import { TransactionGroupRow } from './TransactionGroupRow';
import { TripGroupRow } from './TripGroupRow';

interface TransactionRowProps {
  transaction: Transaction;
  onDelete: (id: number) => void;
  onEdit: (transaction: Transaction) => void;
  isDeleting: boolean;
  index: number;
}

function TransactionRow({ transaction, onDelete, onEdit, isDeleting, index }: TransactionRowProps) {
  const { t } = useTranslate();
  const isIncome = transaction.type === TRANSACTION_TYPE.INCOME;
  const isShared = transaction.sharedDivisor > SHARED_EXPENSE.DEFAULT_DIVISOR;
  const iconColor = transaction.category?.color ?? (isIncome ? '#10B981' : '#EF4444');

  // Build category display name with parent breadcrumb
  const categoryName = transaction.parentCategory
    ? `${transaction.parentCategory.name} › ${transaction.category?.name ?? ''}`
    : (transaction.category?.name ?? t('transactions.no-category'));

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Edit button provides keyboard access
    // biome-ignore lint/a11y/noStaticElementInteractions: Cannot use <button> here due to nested interactive elements
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
        <p className="text-sm font-medium text-foreground truncate" title={categoryName}>
          {categoryName}
        </p>
        {transaction.description && (
          <p className="text-xs text-guard-muted truncate" title={transaction.description}>
            {transaction.description}
          </p>
        )}
      </div>

      {/* Amount + Shared Badge */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {transaction.recurringExpenseId && (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
            title={t('recurring.badge')}
          >
            <Repeat className="h-2.5 w-2.5" aria-hidden="true" />
          </span>
        )}
        {transaction.tripId && (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 flex items-center gap-0.5"
            title={transaction.tripName ?? t('trips.badge')}
          >
            <Plane className="h-2.5 w-2.5" aria-hidden="true" />
          </span>
        )}
        {isShared && (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-guard-primary/10 text-guard-primary"
            title={t('transactions.shared-badge')}
          >
            {t('transactions.shared-badge')}
          </span>
        )}
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

// Union type for sorted list items
type ListItem =
  | { kind: 'transaction'; data: Transaction }
  | { kind: 'group'; data: TransactionGroupDisplay }
  | { kind: 'trip'; data: TripGroupDisplay };

interface TransactionListProps {
  onAddTransaction?: () => void;
  onEditTransaction?: (transaction: Transaction) => void;
}

/** Check if a transaction matches the search query */
function matchesSearch(tx: Transaction, query: string): boolean {
  const q = query.toLowerCase();
  return (
    (tx.description?.toLowerCase().includes(q) ?? false) ||
    (tx.category?.name?.toLowerCase().includes(q) ?? false) ||
    (tx.parentCategory?.name?.toLowerCase().includes(q) ?? false)
  );
}

export function TransactionList({ onAddTransaction, onEditTransaction }: TransactionListProps) {
  const { t } = useTranslate();
  const selectedMonth = useSelectedMonth();
  const filters = useFilters();
  const { isLoading, isError, refetch, grouped } = useGroupedTransactions(selectedMonth);
  const deleteTransaction = useDeleteTransaction();
  const deleteGroup = useDeleteTransactionGroup();
  const [searchQuery, setSearchQuery] = useState('');

  const handleDelete = (id: number) => {
    deleteTransaction.mutate(id);
  };

  const handleDeleteGroup = (groupId: number) => {
    deleteGroup.mutate(groupId);
  };

  // Merge ungrouped transactions and groups into a single sorted list by date
  const sortedItems = useMemo((): ListItem[] => {
    const items: ListItem[] = [];

    grouped.ungrouped.forEach((tx) => {
      items.push({ kind: 'transaction', data: tx });
    });

    grouped.groups.forEach((group) => {
      items.push({ kind: 'group', data: group });
    });

    grouped.tripGroups.forEach((trip) => {
      items.push({ kind: 'trip', data: trip });
    });

    // Sort by date descending
    items.sort((a, b) => {
      const dateA =
        a.kind === 'transaction'
          ? a.data.transactionDate
          : a.kind === 'group'
            ? a.data.transactionDate
            : a.data.startDate;
      const dateB =
        b.kind === 'transaction'
          ? b.data.transactionDate
          : b.kind === 'group'
            ? b.data.transactionDate
            : b.data.startDate;
      return dateB.localeCompare(dateA);
    });

    return items;
  }, [grouped]);

  // Client-side type + search filter
  const filteredItems = useMemo((): ListItem[] => {
    let items = sortedItems;

    // Type filter from BalanceCards
    if (filters.type !== FILTER_TYPE.ALL) {
      items = items.filter((item) => {
        if (item.kind === 'transaction') return item.data.type === filters.type;
        if (item.kind === 'group') return item.data.type === filters.type;
        return item.data.type === filters.type;
      });
    }

    // Search filter
    if (searchQuery) {
      items = items.filter((item) => {
        if (item.kind === 'transaction') {
          return matchesSearch(item.data, searchQuery);
        }
        if (item.kind === 'group') {
          const q = searchQuery.toLowerCase();
          return (
            (item.data.description?.toLowerCase().includes(q) ?? false) ||
            (item.data.parentCategoryName?.toLowerCase().includes(q) ?? false) ||
            item.data.transactions.some((tx) => matchesSearch(tx, q))
          );
        }
        const q = searchQuery.toLowerCase();
        return (
          item.data.tripName.toLowerCase().includes(q) || item.data.transactions.some((tx) => matchesSearch(tx, q))
        );
      });
    }

    return items;
  }, [sortedItems, searchQuery, filters.type]);

  if (isLoading) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-foreground mb-4">{t('transactions.title')}</h3>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 py-3 px-4 animate-pulse">
              <div className="h-4 w-12 bg-muted rounded" />
              <div className="h-9 w-9 bg-muted rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-28 bg-muted rounded" />
                <div className="h-3 w-20 bg-muted rounded" />
              </div>
              <div className="h-4 w-16 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-foreground mb-4">{t('transactions.title')}</h3>
        <ErrorState message={t('errors.load-transactions')} onRetry={() => refetch()} />
      </div>
    );
  }

  const totalCount =
    grouped.ungrouped.length +
    grouped.groups.reduce((sum, g) => sum + g.transactions.length, 0) +
    grouped.tripGroups.reduce((sum, tg) => sum + tg.transactions.length, 0);

  if (sortedItems.length === 0 && !searchQuery) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-foreground mb-4">{t('transactions.title')}</h3>
        <EmptyState
          icon={Receipt}
          title={t('transactions.empty.title')}
          subtitle={t('transactions.empty.subtitle')}
          action={
            onAddTransaction && (
              <button type="button" onClick={onAddTransaction} className="btn-primary inline-flex items-center gap-2">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('common.buttons.add-first-transaction')}
              </button>
            )
          }
        />
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">{t('transactions.title')}</h3>
        <span className="text-sm text-guard-muted">{t('common.records', { count: totalCount })}</span>
      </div>

      {/* Search filter */}
      <div className="relative mb-3 -mx-4 px-4">
        <Search className="absolute left-7 top-1/2 -translate-y-1/2 h-4 w-4 text-guard-muted" aria-hidden="true" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('transactions.search-placeholder')}
          className="w-full pl-9 pr-9 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-guard-primary focus:border-transparent transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-7 top-1/2 -translate-y-1/2 p-0.5 text-guard-muted hover:text-foreground transition-colors"
            aria-label={t('common.buttons.clear')}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <ul className="-mx-4">
        {filteredItems.length === 0 && searchQuery ? (
          <li className="text-center py-6 text-sm text-guard-muted">{t('transactions.search-empty')}</li>
        ) : null}
        {filteredItems.map((item, index) => {
          if (item.kind === 'group') {
            return (
              <li key={`group-${item.data.transactionGroupId}`}>
                <TransactionGroupRow
                  group={item.data}
                  onDelete={handleDeleteGroup}
                  onEditTransaction={onEditTransaction}
                  isDeleting={deleteGroup.isPending}
                  index={index}
                />
              </li>
            );
          }

          if (item.kind === 'trip') {
            return (
              <li key={`trip-${item.data.tripId}`}>
                <TripGroupRow tripGroup={item.data} onEditTransaction={onEditTransaction} index={index} />
              </li>
            );
          }

          return (
            <li key={item.data.transactionId}>
              <TransactionRow
                transaction={item.data}
                onDelete={handleDelete}
                onEdit={onEditTransaction ?? (() => {})}
                isDeleting={deleteTransaction.isPending}
                index={index}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
