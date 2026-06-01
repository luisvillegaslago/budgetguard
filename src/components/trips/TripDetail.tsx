'use client';

/**
 * BudgetGuard Trip Detail
 * Main component for the trip detail page showing summary cards and expense list
 */

import { Calendar, MapPin, Pencil, Plus, Receipt } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useTranslate } from '@/hooks/useTranslations';
import { useDeleteTripExpense } from '@/hooks/useTripExpenses';
import type { Transaction, TripDetail as TripDetailType } from '@/types/finance';
import { formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';
import { TripEditForm } from './TripEditForm';
import { TripExpenseRow } from './TripExpenseRow';
import { TripSummaryCards } from './TripSummaryCards';

interface TripDetailProps {
  trip: TripDetailType;
  onAddExpense: () => void;
  onEditExpense: (transaction: Transaction) => void;
}

export function TripDetail({ trip, onAddExpense, onEditExpense }: TripDetailProps) {
  const { t } = useTranslate();
  const [isEditing, setIsEditing] = useState(false);
  const deleteExpense = useDeleteTripExpense(trip.tripId);

  const handleDeleteExpense = (transactionId: number) => {
    deleteExpense.mutate(transactionId);
  };

  return (
    <div className="space-y-6">
      {/* Header with trip name and edit button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <MapPin className="h-6 w-6 text-guard-primary flex-shrink-0" aria-hidden="true" />
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-2xl font-bold text-foreground truncate">{trip.name}</h1>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="p-1.5 text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors flex-shrink-0"
              aria-label={t('trips.detail.edit-trip')}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <button type="button" onClick={onAddExpense} className="btn-primary flex items-center gap-2 flex-shrink-0">
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t('trips.detail.add-expense')}</span>
        </button>
      </div>

      {/* Date range */}
      <div className="-mt-4">
        <div className="flex items-center gap-1.5 text-sm text-guard-muted">
          <Calendar className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          {trip.startDate && trip.endDate ? (
            <span>
              {formatDate(trip.startDate)} — {formatDate(trip.endDate)}
            </span>
          ) : (
            <span>{t('trips.card.no-dates')}</span>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <TripSummaryCards categorySummary={trip.categorySummary} />

      {/* Grand Total */}
      {trip.totalCents > 0 && (
        <div className="flex items-center justify-between p-4 rounded-lg bg-guard-danger/5 border border-guard-danger/10">
          <span className="text-sm font-medium text-foreground">{t('trips.detail.total')}</span>
          <span className="text-lg font-bold text-guard-danger">-{formatCurrency(trip.totalCents)}</span>
        </div>
      )}

      {/* Expense List */}
      <div className="card">
        {trip.expenses.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={t('trips.detail.empty.title')}
            subtitle={t('trips.detail.empty.subtitle')}
            action={
              <button type="button" onClick={onAddExpense} className="btn-primary inline-flex items-center gap-2">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('trips.detail.add-expense')}
              </button>
            }
          />
        ) : (
          <ul className="-mx-3 sm:-mx-4">
            {trip.expenses.map((expense, index) => (
              <li key={expense.transactionId}>
                <TripExpenseRow
                  transaction={expense}
                  onEdit={onEditExpense}
                  onDelete={handleDeleteExpense}
                  isDeleting={deleteExpense.isPending}
                  index={index}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Edit Trip Modal */}
      {isEditing && <TripEditForm trip={trip} onClose={() => setIsEditing(false)} />}
    </div>
  );
}
