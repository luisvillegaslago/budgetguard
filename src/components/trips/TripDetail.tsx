'use client';

/**
 * BudgetGuard Trip Detail
 * Main component for the trip detail page showing summary cards and expense list
 */

import { Calendar, Check, MapPin, Pencil, Plus, Receipt, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useTranslate } from '@/hooks/useTranslations';
import { useDeleteTripExpense } from '@/hooks/useTripExpenses';
import { useUpdateTrip } from '@/hooks/useTrips';
import type { Transaction, TripDetail as TripDetailType } from '@/types/finance';
import { cn, formatDate } from '@/utils/helpers';
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
  const [isEditingDates, setIsEditingDates] = useState(false);
  const [editStartDate, setEditStartDate] = useState(trip.startDate ?? '');
  const [editEndDate, setEditEndDate] = useState(trip.endDate ?? '');
  const updateTrip = useUpdateTrip();
  const deleteExpense = useDeleteTripExpense(trip.tripId);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const startDateInputRef = useRef<HTMLInputElement>(null);

  // Focus name input when entering edit mode (accessibility-safe alternative to autoFocus)
  const startEditing = useCallback(() => {
    setIsEditingName(true);
  }, []);

  useEffect(() => {
    if (isEditingName) nameInputRef.current?.focus();
  }, [isEditingName]);

  const startEditingDates = useCallback(() => {
    setEditStartDate(trip.startDate ?? '');
    setEditEndDate(trip.endDate ?? '');
    setIsEditingDates(true);
  }, [trip.startDate, trip.endDate]);

  useEffect(() => {
    if (isEditingDates) startDateInputRef.current?.focus();
  }, [isEditingDates]);

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

  const handleSaveDates = async () => {
    if (editStartDate && editEndDate && editEndDate >= editStartDate) {
      const hasChanged = editStartDate !== trip.startDate || editEndDate !== trip.endDate;
      if (hasChanged) {
        await updateTrip.mutateAsync({
          tripId: trip.tripId,
          data: { startDate: new Date(editStartDate), endDate: new Date(editEndDate) },
        });
      }
    }
    setIsEditingDates(false);
  };

  const handleCancelDatesEdit = () => {
    setEditStartDate(trip.startDate ?? '');
    setEditEndDate(trip.endDate ?? '');
    setIsEditingDates(false);
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

      {/* Editable date range */}
      <div className="-mt-4">
        {isEditingDates ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-guard-muted flex-shrink-0" aria-hidden="true" />
              <input
                ref={startDateInputRef}
                type="date"
                value={editStartDate}
                onChange={(e) => setEditStartDate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveDates();
                  if (e.key === 'Escape') handleCancelDatesEdit();
                }}
                className={cn(
                  'px-2 py-1 text-sm rounded border bg-background text-foreground',
                  'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
                  editStartDate && editEndDate && editEndDate < editStartDate ? 'border-guard-danger' : 'border-input',
                )}
              />
              <span className="text-sm text-guard-muted">—</span>
            </div>
            <div className="flex items-center gap-2 pl-5 sm:pl-0">
              <input
                type="date"
                value={editEndDate}
                min={editStartDate || undefined}
                onChange={(e) => setEditEndDate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveDates();
                  if (e.key === 'Escape') handleCancelDatesEdit();
                }}
                className={cn(
                  'px-2 py-1 text-sm rounded border bg-background text-foreground',
                  'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
                  editStartDate && editEndDate && editEndDate < editStartDate ? 'border-guard-danger' : 'border-input',
                )}
              />
              <button
                type="button"
                onClick={handleSaveDates}
                disabled={updateTrip.isPending || !editStartDate || !editEndDate || editEndDate < editStartDate}
                className="p-1 text-guard-success hover:bg-guard-success/10 rounded transition-colors disabled:opacity-50"
                aria-label={t('trips.detail.save-dates')}
              >
                {updateTrip.isPending ? <LoadingSpinner size="sm" /> : <Check className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={handleCancelDatesEdit}
                className="p-1 text-guard-muted hover:bg-muted rounded transition-colors"
                aria-label={t('trips.detail.cancel-edit')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-sm text-guard-muted group/dates">
            <Calendar className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            {trip.startDate && trip.endDate ? (
              <span>
                {formatDate(trip.startDate)} — {formatDate(trip.endDate)}
              </span>
            ) : (
              <span>{t('trips.card.no-dates')}</span>
            )}
            <button
              type="button"
              onClick={startEditingDates}
              className="p-1 text-guard-muted hover:text-foreground hover:bg-muted rounded transition-colors opacity-0 group-hover/dates:opacity-100"
              aria-label={t('trips.detail.edit-dates')}
            >
              <Pencil className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        )}
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
    </div>
  );
}
