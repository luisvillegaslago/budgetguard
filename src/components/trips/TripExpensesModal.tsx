'use client';

/**
 * Trip Expenses Modal
 * Read-only popup that lists all expenses for a given trip.
 * Opened from the active trip badge on the dashboard.
 */

import { ArrowUpRight, ExternalLink, Receipt, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { SortControl, type SortControlOption } from '@/components/ui/SortControl';
import { SORT_DIRECTION, TRIP_COLOR } from '@/constants/finance';
import { type SortableField, useSortableData } from '@/hooks/useSortableData';
import { useTranslate } from '@/hooks/useTranslations';
import { useTrip } from '@/hooks/useTrips';
import type { Transaction } from '@/types/finance';
import { formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

const SORT_FIELDS: readonly SortableField<Transaction>[] = [
  { key: 'date', accessor: (expense) => expense.transactionDate },
  { key: 'amount', accessor: (expense) => expense.amountCents },
  { key: 'category', accessor: (expense) => expense.category?.name ?? '' },
];

interface TripExpensesModalProps {
  tripId: number;
  tripName: string;
  onClose: () => void;
}

function ExpenseRow({ transaction, index }: { transaction: Transaction; index: number }) {
  const { t } = useTranslate();
  const iconColor = transaction.category?.color ?? TRIP_COLOR;

  return (
    <li
      className="flex items-center gap-3 py-2.5 px-3 sm:px-4 rounded-lg animate-fade-in"
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'both' }}
    >
      <span className="w-12 sm:w-16 flex-shrink-0 text-xs text-guard-muted">
        {formatDate(transaction.transactionDate)}
      </span>
      <div className="flex-shrink-0 p-2 rounded-lg" style={{ backgroundColor: `${iconColor}15` }}>
        <CategoryIcon icon={transaction.category?.icon} color={iconColor} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {transaction.category?.name ?? t('transactions.no-category')}
        </p>
        {transaction.description && <p className="text-xs text-guard-muted truncate">{transaction.description}</p>}
      </div>
      <span className="text-sm font-semibold text-guard-danger flex-shrink-0 flex items-center gap-1 tabular-nums">
        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />-{formatCurrency(transaction.amountCents)}
      </span>
    </li>
  );
}

export function TripExpensesModal({ tripId, tripName, onClose }: TripExpensesModalProps) {
  const { t } = useTranslate();
  const { data: trip, isLoading } = useTrip(tripId);

  const { sorted, sort, toggleSort } = useSortableData<Transaction>(trip?.expenses ?? [], SORT_FIELDS, {
    initial: { key: 'date', direction: SORT_DIRECTION.DESC },
  });

  const sortOptions = useMemo<SortControlOption[]>(
    () => [
      { key: 'date', label: t('sort.fields.date') },
      { key: 'amount', label: t('sort.fields.amount') },
      { key: 'category', label: t('sort.fields.category') },
    ],
    [t],
  );

  return (
    <ModalBackdrop onClose={onClose} labelledBy="trip-expenses-modal-title">
      <div className="card w-full max-w-md lg:max-w-lg animate-modal-in max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="min-w-0">
            <h2 id="trip-expenses-modal-title" className="text-xl font-bold text-foreground truncate">
              {t('dashboard.active-trip.expenses-modal-title')}
            </h2>
            <p className="text-sm text-guard-muted truncate">{tripName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors flex-shrink-0"
            aria-label={t('common.buttons.close')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <LoadingSpinner size="md" />
          </div>
        ) : !trip || trip.expenses.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={t('trips.detail.empty.title')}
            subtitle={t('trips.detail.empty.subtitle')}
          />
        ) : (
          <>
            {trip.expenses.length > 1 && (
              <SortControl options={sortOptions} sort={sort} onToggle={toggleSort} className="mb-3" />
            )}
            <ul className="-mx-3 sm:-mx-4 overflow-y-auto flex-1">
              {sorted.map((expense, index) => (
                <ExpenseRow key={expense.transactionId} transaction={expense} index={index} />
              ))}
            </ul>

            {/* Total */}
            <div className="flex items-center justify-between pt-4 mt-2 border-t border-border">
              <span className="text-sm font-medium text-foreground">{t('trips.detail.total')}</span>
              <span className="text-lg font-bold text-guard-danger">-{formatCurrency(trip.totalCents)}</span>
            </div>
          </>
        )}

        {/* Footer: link to full trip detail */}
        <Link
          href={`/trips/${tripId}`}
          className="mt-4 inline-flex items-center justify-center gap-2 text-sm font-medium text-guard-primary hover:underline"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {t('dashboard.active-trip.view-trip')}
        </Link>
      </div>
    </ModalBackdrop>
  );
}
