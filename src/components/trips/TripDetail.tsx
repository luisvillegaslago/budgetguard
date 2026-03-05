'use client';

/**
 * BudgetGuard Trip Detail
 * Main component for the trip detail page showing summary cards and expense list
 */

import { Check, MapPin, Pencil, Plus, Receipt, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useTranslate } from '@/hooks/useTranslations';
import { useDeleteTripExpense } from '@/hooks/useTripExpenses';
import { useUpdateTrip } from '@/hooks/useTrips';
import type { Transaction, TripDetail as TripDetailType } from '@/types/finance';
import { cn } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';
import { TripExpenseRow } from './TripExpenseRow';
import { TripSummaryCards } from './TripSummaryCards';

interface TripDetailProps {
  trip: TripDetailType;
  onAddExpense: () => void;
  onEditExpense: (transaction: Transaction) => void;
}

export function TripDetail({ trip, onAddExpense, onEditExpense }: TripDetailProps) {
  const { t } = useTranslate();
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(trip.name);
  const updateTrip = useUpdateTrip();
  const deleteExpense = useDeleteTripExpense(trip.tripId);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus name input when entering edit mode (accessibility-safe alternative to autoFocus)
  const startEditing = useCallback(() => {
    setIsEditingName(true);
  }, []);

  useEffect(() => {
    if (isEditingName) nameInputRef.current?.focus();
  }, [isEditingName]);

  const handleSaveName = async () => {
    if (editName.trim() && editName !== trip.name) {
      await updateTrip.mutateAsync({ tripId: trip.tripId, data: { name: editName.trim() } });
    }
    setIsEditingName(false);
  };

  const handleCancelEdit = () => {
    setEditName(trip.name);
    setIsEditingName(false);
  };

  const handleDeleteExpense = (transactionId: number) => {
    deleteExpense.mutate(transactionId);
  };

  return (
    <div className="space-y-6">
      {/* Header with editable name */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <MapPin className="h-6 w-6 text-guard-primary flex-shrink-0" aria-hidden="true" />
          {isEditingName ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName();
                  if (e.key === 'Escape') handleCancelEdit();
                }}
                className={cn(
                  'text-2xl font-bold text-foreground bg-transparent border-b-2 border-guard-primary',
                  'focus:outline-none flex-1 min-w-0',
                )}
                ref={nameInputRef}
              />
              <button
                type="button"
                onClick={handleSaveName}
                disabled={updateTrip.isPending}
                className="p-1.5 text-guard-success hover:bg-guard-success/10 rounded-lg transition-colors"
                aria-label={t('trips.detail.save-name')}
              >
                {updateTrip.isPending ? <LoadingSpinner size="sm" /> : <Check className="h-5 w-5" />}
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="p-1.5 text-guard-muted hover:bg-muted rounded-lg transition-colors"
                aria-label={t('trips.detail.cancel-edit')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-2xl font-bold text-foreground truncate">{trip.name}</h1>
              <button
                type="button"
                onClick={startEditing}
                className="p-1.5 text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors flex-shrink-0"
                aria-label={t('trips.detail.edit-name')}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        <button type="button" onClick={onAddExpense} className="btn-primary flex items-center gap-2 flex-shrink-0">
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t('trips.detail.add-expense')}</span>
        </button>
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
          <ul className="-mx-4">
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
    </div>
  );
}
