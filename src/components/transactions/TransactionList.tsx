'use client';

/**
 * BudgetGuard Transaction List
 * Displays transactions for the selected month, with grouped transactions shown as collapsible rows
 */

import {
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  CheckCircle,
  Clock,
  FileCheck,
  Pencil,
  Plane,
  Plus,
  Receipt,
  Repeat,
  Ticket,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { DeleteButton } from '@/components/ui/DeleteButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { OverflowTooltip } from '@/components/ui/OverflowTooltip';
import { SearchInput } from '@/components/ui/SearchInput';
import { Tooltip } from '@/components/ui/Tooltip';
import { FILTER_TYPE, SHARED_EXPENSE, STATUS_FILTER, TRANSACTION_STATUS, TRANSACTION_TYPE } from '@/constants/finance';
import { useDeleteTransactionGroup } from '@/hooks/useTransactionGroups';
import { useDeleteTransaction, useGroupedTransactions, useUpdateTransactionStatus } from '@/hooks/useTransactions';
import { useTranslate } from '@/hooks/useTranslations';
import { useVouchers } from '@/hooks/useVouchers';
import { useFilters, useSelectedMonth, useSetFilters } from '@/stores/useFinanceStore';
import type { StatusFilter, Transaction, TransactionGroupDisplay, TripGroupDisplay } from '@/types/finance';
import { cn, formatDate, normalizeForSearch } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';
import { TransactionGroupForm } from './TransactionGroupForm';
import { TransactionGroupRow } from './TransactionGroupRow';
import { TripGroupRow } from './TripGroupRow';

interface TransactionRowProps {
  transaction: Transaction;
  onDelete: (id: number) => void;
  onEdit: (transaction: Transaction) => void;
  onMarkAsPaid?: (id: number) => void;
  isDeleting: boolean;
  index: number;
  voucherName?: string | null;
}

function TransactionRow({
  transaction,
  onDelete,
  onEdit,
  onMarkAsPaid,
  isDeleting,
  index,
  voucherName,
}: TransactionRowProps) {
  const { t } = useTranslate();
  const isIncome = transaction.type === TRANSACTION_TYPE.INCOME;
  const isShared = transaction.sharedDivisor > SHARED_EXPENSE.DEFAULT_DIVISOR;
  const isPending = transaction.status === TRANSACTION_STATUS.PENDING;
  const isCancelled = transaction.status === TRANSACTION_STATUS.CANCELLED;
  const iconColor = transaction.category?.color ?? (isIncome ? '#10B981' : '#EF4444');
  const sharedTooltip =
    isShared && transaction.originalAmountCents != null
      ? t('transactions.shared-tooltip-total', { total: formatCurrency(transaction.originalAmountCents) })
      : t('transactions.shared-badge');

  // Build category display name with parent breadcrumb
  const categoryName = transaction.parentCategory
    ? `${transaction.parentCategory.name} › ${transaction.category?.name ?? ''}`
    : (transaction.category?.name ?? t('transactions.no-category'));

  const amountEl = (
    <span
      className={cn(
        'text-sm font-semibold flex-shrink-0 flex items-center justify-end gap-1 tabular-nums min-w-[90px] text-right',
        isPending
          ? 'text-guard-muted/50'
          : {
              'text-guard-success': isIncome,
              'text-guard-danger': !isIncome,
            },
      )}
    >
      {isIncome ? (
        <ArrowDownLeft className="h-3 w-3" aria-hidden="true" />
      ) : (
        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
      )}
      {isIncome ? '+' : '-'}
      {formatCurrency(transaction.amountCents)}
    </span>
  );

  return (
    <div
      className={cn(
        'py-3 px-3 sm:px-4 hover:bg-muted/50 rounded-lg transition-colors group animate-fade-in',
        isCancelled && 'opacity-50',
      )}
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'both' }}
    >
      {/* Desktop: single row — clickable */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Edit button provides keyboard access */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Cannot use button due to nested interactive elements */}
      <div className="hidden sm:flex items-center gap-4 cursor-pointer" onClick={() => onEdit(transaction)}>
        <div className="flex-shrink-0 p-2 rounded-lg" style={{ backgroundColor: `${iconColor}15` }}>
          <CategoryIcon icon={transaction.category?.icon} color={iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <OverflowTooltip content={categoryName}>
            <p className="text-sm font-medium text-foreground truncate">{categoryName}</p>
          </OverflowTooltip>
          <div className="flex items-center gap-1.5 text-xs text-guard-muted min-w-0">
            <span className="flex-shrink-0">{formatDate(transaction.transactionDate)}</span>
            {transaction.description && (
              <>
                <span className="flex-shrink-0">·</span>
                <span className="truncate">{transaction.description}</span>
              </>
            )}
            {voucherName && (
              <>
                <span className="flex-shrink-0">·</span>
                <span className="flex items-center gap-0.5 flex-shrink-0 text-guard-primary">
                  <Ticket className="h-3 w-3" aria-hidden="true" />
                  <span className="truncate">{voucherName}</span>
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-1.5 flex-shrink-0 w-20">
          {isPending && (
            <Tooltip content={t('transaction-status.pending')}>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-guard-warning/10 text-guard-warning">
                <Clock className="h-3 w-3" aria-hidden="true" />
              </span>
            </Tooltip>
          )}
          {isCancelled && (
            <Tooltip content={t('transaction-status.cancelled')}>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-guard-muted/10 text-guard-muted">
                <Ban className="h-3 w-3" aria-hidden="true" />
              </span>
            </Tooltip>
          )}
          {transaction.recurringExpenseId && (
            <Tooltip content={t('recurring.badge')}>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-guard-warning/10 text-guard-warning">
                <Repeat className="h-3 w-3" aria-hidden="true" />
              </span>
            </Tooltip>
          )}
          {transaction.tripId && (
            <Tooltip content={transaction.tripName ?? t('trips.badge')}>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                <Plane className="h-3 w-3" aria-hidden="true" />
              </span>
            </Tooltip>
          )}
          {transaction.fiscalDocumentId != null && (
            <Tooltip content={t('transactions.fiscal-doc-badge')}>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                <FileCheck className="h-3 w-3" aria-hidden="true" />
              </span>
            </Tooltip>
          )}
          {isShared && (
            <Tooltip content={sharedTooltip}>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400">
                <Users className="h-3 w-3" aria-hidden="true" />
              </span>
            </Tooltip>
          )}
        </div>
        <div className="flex items-center justify-end flex-shrink-0">
          {amountEl}
          <div className="flex items-center overflow-hidden max-w-0 ml-2 group-hover:max-w-[96px] group-focus-within:max-w-[96px] transition-all duration-200 ease-out-quart group-hover:delay-300">
            {isPending && onMarkAsPaid && (
              <Tooltip content={t('transactions.mark-as-paid')}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkAsPaid(transaction.transactionId);
                  }}
                  className="p-1.5 rounded-lg text-guard-muted hover:bg-guard-success/10 hover:text-guard-success transition-colors"
                  aria-label={t('transactions.mark-as-paid')}
                >
                  <CheckCircle className="h-4 w-4" aria-hidden="true" />
                </button>
              </Tooltip>
            )}
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
          <p className="text-sm font-medium text-foreground truncate flex-1 min-w-0">{categoryName}</p>
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
          {voucherName && (
            <span className="flex items-center gap-0.5 flex-shrink-0 text-xs text-guard-primary min-w-0">
              <Ticket className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
              <span className="truncate">{voucherName}</span>
            </span>
          )}
          <div className="flex items-center gap-0.5 flex-shrink-0 ml-auto">
            {isPending && (
              <Tooltip content={t('transaction-status.pending')}>
                <span className="text-[10px] font-bold p-1 rounded bg-guard-warning/10 text-guard-warning">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                </span>
              </Tooltip>
            )}
            {isCancelled && (
              <Tooltip content={t('transaction-status.cancelled')}>
                <span className="text-[10px] font-bold p-1 rounded bg-guard-muted/10 text-guard-muted">
                  <Ban className="h-3 w-3" aria-hidden="true" />
                </span>
              </Tooltip>
            )}
            {transaction.recurringExpenseId && (
              <Tooltip content={t('recurring.badge')}>
                <span className="text-[10px] font-bold p-1 rounded bg-guard-warning/10 text-guard-warning">
                  <Repeat className="h-3 w-3" aria-hidden="true" />
                </span>
              </Tooltip>
            )}
            {transaction.tripId && (
              <Tooltip content={transaction.tripName ?? t('trips.badge')}>
                <span className="text-[10px] font-bold p-1 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                  <Plane className="h-3 w-3" aria-hidden="true" />
                </span>
              </Tooltip>
            )}
            {transaction.fiscalDocumentId != null && (
              <Tooltip content={t('transactions.fiscal-doc-badge')}>
                <span className="text-[10px] font-bold p-1 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                  <FileCheck className="h-3 w-3" aria-hidden="true" />
                </span>
              </Tooltip>
            )}
            {isShared && (
              <Tooltip content={sharedTooltip}>
                <span className="text-[10px] font-bold p-1 rounded bg-guard-primary/10 text-guard-primary">
                  <Users className="h-3 w-3" aria-hidden="true" />
                </span>
              </Tooltip>
            )}
            {isPending && onMarkAsPaid && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkAsPaid(transaction.transactionId);
                }}
                className="p-1 rounded-lg text-guard-muted hover:bg-guard-success/10 hover:text-guard-success transition-colors"
                aria-label={t('transactions.mark-as-paid')}
              >
                <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
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

// Union type for sorted list items
type ListItem =
  | { kind: 'transaction'; data: Transaction }
  | { kind: 'group'; data: TransactionGroupDisplay }
  | { kind: 'trip'; data: TripGroupDisplay };

interface TransactionListProps {
  onAddTransaction?: () => void;
  onEditTransaction?: (transaction: Transaction) => void;
}

/** Check if a transaction matches the search query (accent- and case-insensitive) */
function matchesSearch(tx: Transaction, query: string, voucherName?: string | null): boolean {
  const q = normalizeForSearch(query);
  return (
    normalizeForSearch(tx.description ?? '').includes(q) ||
    normalizeForSearch(tx.category?.name ?? '').includes(q) ||
    normalizeForSearch(tx.parentCategory?.name ?? '').includes(q) ||
    (voucherName != null && normalizeForSearch(voucherName).includes(q))
  );
}

export function TransactionList({ onAddTransaction, onEditTransaction }: TransactionListProps) {
  const { t } = useTranslate();
  const selectedMonth = useSelectedMonth();
  const filters = useFilters();
  const setFilters = useSetFilters();
  const { isLoading, isError, refetch, grouped } = useGroupedTransactions(selectedMonth);
  const { data: vouchers } = useVouchers();
  const deleteTransaction = useDeleteTransaction();
  const deleteGroup = useDeleteTransactionGroup();
  const updateStatus = useUpdateTransactionStatus();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingGroup, setEditingGroup] = useState<TransactionGroupDisplay | null>(null);

  // Map voucherId → display name so consumptions can show which voucher they draw from
  const voucherNames = useMemo(() => {
    const map = new Map<number, string>();
    (vouchers ?? []).forEach((v) => {
      map.set(v.voucherId, v.description || v.categoryName || t('vouchers.untitled'));
    });
    return map;
  }, [vouchers, t]);

  const handleDelete = (id: number) => {
    deleteTransaction.mutate(id);
  };

  const handleMarkAsPaid = (id: number) => {
    updateStatus.mutate({ id, status: TRANSACTION_STATUS.PAID });
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

    // Status filter
    if (filters.status !== STATUS_FILTER.ALL) {
      items = items.filter((item) => {
        if (item.kind === 'transaction') return item.data.status === filters.status;
        if (item.kind === 'group') return item.data.transactions.some((tx) => tx.status === filters.status);
        return item.data.transactions.some((tx) => tx.status === filters.status);
      });
    }

    // Search filter
    if (searchQuery) {
      const txVoucherName = (tx: Transaction): string | null =>
        tx.voucherId != null ? (voucherNames.get(tx.voucherId) ?? null) : null;
      const q = normalizeForSearch(searchQuery);
      items = items.filter((item) => {
        if (item.kind === 'transaction') {
          return matchesSearch(item.data, searchQuery, txVoucherName(item.data));
        }
        if (item.kind === 'group') {
          return (
            normalizeForSearch(item.data.description ?? '').includes(q) ||
            normalizeForSearch(item.data.parentCategoryName ?? '').includes(q) ||
            item.data.transactions.some((tx) => matchesSearch(tx, searchQuery, txVoucherName(tx)))
          );
        }
        return (
          normalizeForSearch(item.data.tripName).includes(q) ||
          item.data.transactions.some((tx) => matchesSearch(tx, searchQuery, txVoucherName(tx)))
        );
      });
    }

    return items;
  }, [sortedItems, searchQuery, filters.type, filters.status, voucherNames]);

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

      {/* Search + Status filter */}
      <div className="mb-3 -mx-3 px-3 sm:-mx-4 sm:px-4 space-y-2">
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder={t('transactions.search-placeholder')} />
        <div className="flex gap-1.5 overflow-x-auto">
          {(
            [STATUS_FILTER.ALL, STATUS_FILTER.PAID, STATUS_FILTER.PENDING, STATUS_FILTER.CANCELLED] as StatusFilter[]
          ).map((statusOption) => (
            <button
              key={statusOption}
              type="button"
              onClick={() => setFilters({ status: statusOption })}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap',
                filters.status === statusOption
                  ? 'bg-guard-primary text-white'
                  : 'bg-muted text-guard-muted hover:text-foreground',
              )}
            >
              {t(`transactions.status-filter.${statusOption}`)}
            </button>
          ))}
        </div>
      </div>

      <ul className="-mx-3 sm:-mx-4">
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
                  onEdit={setEditingGroup}
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
                onMarkAsPaid={handleMarkAsPaid}
                isDeleting={deleteTransaction.isPending}
                index={index}
                voucherName={item.data.voucherId != null ? (voucherNames.get(item.data.voucherId) ?? null) : null}
              />
            </li>
          );
        })}
      </ul>

      {editingGroup && <TransactionGroupForm group={editingGroup} onClose={() => setEditingGroup(null)} />}
    </div>
  );
}
