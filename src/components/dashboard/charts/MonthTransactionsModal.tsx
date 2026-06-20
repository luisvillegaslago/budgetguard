'use client';

/**
 * BudgetGuard Month Transactions Modal
 * Generic popup that lists the selected month's transactions matching a filter.
 * Shared shell for the category and type drill-down popups on the dashboard.
 */

import { History, ShoppingCart, X } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useMemo } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { SortControl, type SortControlOption } from '@/components/ui/SortControl';
import { SORT_DIRECTION } from '@/constants/finance';
import { type SortableField, useSortableData } from '@/hooks/useSortableData';
import { useTransactions } from '@/hooks/useTransactions';
import { useTranslate } from '@/hooks/useTranslations';
import type { Transaction } from '@/types/finance';
import { formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

const TITLE_ID = 'month-transactions-title';

interface MonthTransactionsModalProps {
  title: string;
  /** Pre-styled icon node rendered in the header (e.g. a colored icon box). */
  icon: ReactNode;
  month: string;
  filter: (tx: Transaction) => boolean;
  /** Optional secondary line per row (e.g. subcategory or category breadcrumb). */
  secondary?: (tx: Transaction) => string | null;
  footerHref: string;
  onFooterClick?: () => void;
  onClose: () => void;
}

export function MonthTransactionsModal({
  title,
  icon,
  month,
  filter,
  secondary,
  footerHref,
  onFooterClick,
  onClose,
}: MonthTransactionsModalProps) {
  const { t, locale } = useTranslate();
  const { data, isLoading, isError, refetch } = useTransactions(month);

  const transactions = useMemo(() => (data?.data ?? []).filter(filter), [data, filter]);
  const totalCents = transactions.reduce((sum, tx) => sum + tx.amountCents, 0);

  // Capture title/secondary so the accessors stay pure between renders.
  const sortFields = useMemo<SortableField<Transaction>[]>(
    () => [
      { key: 'date', accessor: (tx) => tx.transactionDate },
      { key: 'amount', accessor: (tx) => tx.amountCents },
      { key: 'title', accessor: (tx) => tx.description || secondary?.(tx) || title },
    ],
    [secondary, title],
  );

  const { sorted, sort, toggleSort } = useSortableData<Transaction>(transactions, sortFields, {
    initial: { key: 'date', direction: SORT_DIRECTION.DESC },
  });

  const sortOptions: SortControlOption[] = [
    { key: 'date', label: t('sort.fields.date') },
    { key: 'amount', label: t('sort.fields.amount') },
    { key: 'title', label: t('sort.fields.title') },
  ];

  return (
    <ModalBackdrop onClose={onClose} labelledBy={TITLE_ID}>
      <div className="card w-full max-w-lg animate-modal-in flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {icon}
            <div className="min-w-0">
              <h2 id={TITLE_ID} className="text-lg font-bold text-foreground truncate">
                {title}
              </h2>
              <p className="text-xs text-guard-muted first-letter:uppercase">
                {formatDate(`${month}-01`, 'month', locale)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            aria-label={t('common.buttons.close')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="md" />
          </div>
        ) : isError ? (
          <ErrorState message={t('errors.load-transactions')} onRetry={() => refetch()} />
        ) : transactions.length === 0 ? (
          <EmptyState icon={ShoppingCart} title={t('dashboard.category-breakdown.empty')} />
        ) : (
          <>
            <div className="flex items-center justify-between text-sm mb-2 px-1">
              <span className="text-guard-muted">{t('common.records', { count: transactions.length })}</span>
              <span className="font-semibold text-foreground tabular-nums">
                {t('common.total', { amount: formatCurrency(totalCents) })}
              </span>
            </div>

            {transactions.length > 1 && (
              <div className="mb-2 px-1">
                <SortControl options={sortOptions} sort={sort} onToggle={toggleSort} />
              </div>
            )}

            <ul className="divide-y divide-border overflow-y-auto -mx-1 px-1">
              {sorted.map((tx) => {
                const sub = secondary?.(tx) ?? null;
                return (
                  <li key={tx.transactionId} className="flex items-center gap-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{tx.description || sub || title}</p>
                      <p className="text-xs text-guard-muted truncate">
                        {formatDate(tx.transactionDate, 'short', locale)}
                        {sub && tx.description ? ` · ${sub}` : ''}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-foreground flex-shrink-0 tabular-nums">
                      {formatCurrency(tx.amountCents)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-border">
          <Link
            href={footerHref}
            onClick={() => {
              onFooterClick?.();
              onClose();
            }}
            className="inline-flex items-center gap-1.5 text-sm text-guard-primary hover:text-guard-primary/80 transition-colors"
          >
            <History className="h-4 w-4" aria-hidden="true" />
            {t('category-history.view-link')}
          </Link>
        </div>
      </div>
    </ModalBackdrop>
  );
}
