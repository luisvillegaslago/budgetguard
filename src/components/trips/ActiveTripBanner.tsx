'use client';

/**
 * Active Trip Banner
 * Shows a dismissable banner on the dashboard when there is an active trip
 * (today falls within the trip's date range). Includes a quick "Add Expense" button.
 * Responsive: stacks vertically on mobile, horizontal on desktop.
 */

import { Calendar, Pencil, Plane, Plus } from 'lucide-react';
import Link from 'next/link';
import { TRIP_COLOR } from '@/constants/finance';
import { useActiveTrips } from '@/hooks/useActiveTrips';
import { useTranslate } from '@/hooks/useTranslations';
import type { TripDisplay } from '@/types/finance';
import { formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface TripExpenseTarget {
  tripId: number;
  startDate: string | null;
}

interface ActiveTripBannerProps {
  onAddExpense: (target: TripExpenseTarget) => void;
}

function ActiveTripItem({
  trip,
  onAddExpense,
}: {
  trip: TripDisplay;
  onAddExpense: (target: TripExpenseTarget) => void;
}) {
  const { t } = useTranslate();

  const expenseBadge = trip.expenseCount > 0 && (
    <span
      className="text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap"
      style={{ backgroundColor: `${TRIP_COLOR}15`, color: TRIP_COLOR }}
    >
      {t('dashboard.active-trip.expenses-count', {
        count: trip.expenseCount,
        total: formatCurrency(trip.totalCents),
      })}
    </span>
  );

  return (
    <div className="flex items-end justify-between gap-2 sm:items-center">
      {/* Mobile: stacked column. Desktop: single row */}
      <div className="flex flex-col gap-1 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-1 min-w-0">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 shrink-0" style={{ color: TRIP_COLOR }} aria-hidden="true" />
          <span className="font-medium text-foreground">{trip.name}</span>
          <Link
            href={`/trips/${trip.tripId}`}
            className="p-1 rounded-md text-guard-muted hover:text-foreground hover:bg-muted transition-colors"
            aria-label={`${t('common.buttons.edit')} ${trip.name}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Link>
          {trip.startDate && trip.endDate && (
            <>
              <span className="text-guard-muted text-xs hidden sm:inline">-</span>
              <span className="text-guard-muted text-xs whitespace-nowrap hidden sm:inline">
                {formatDate(trip.startDate)} — {formatDate(trip.endDate)}
              </span>
            </>
          )}
        </div>
        {trip.startDate && trip.endDate && (
          <span className="text-guard-muted text-xs pl-6 sm:hidden">
            {formatDate(trip.startDate)} — {formatDate(trip.endDate)}
          </span>
        )}
        <div className="pl-6 sm:pl-0">{expenseBadge}</div>
      </div>
      <button
        type="button"
        onClick={() => onAddExpense({ tripId: trip.tripId, startDate: trip.startDate })}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-md transition-colors shrink-0"
        style={{ backgroundColor: TRIP_COLOR }}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        {t('dashboard.active-trip.add-expense')}
      </button>
    </div>
  );
}

export function ActiveTripBanner({ onAddExpense }: ActiveTripBannerProps) {
  const { t } = useTranslate();
  const { activeTrips } = useActiveTrips();

  if (activeTrips.length === 0) return null;

  return (
    <div
      className="rounded-lg border p-3 sm:p-4 mb-6"
      style={{ backgroundColor: `${TRIP_COLOR}08`, borderColor: `${TRIP_COLOR}30` }}
    >
      <div className="flex items-start gap-2 sm:gap-3">
        <Plane className="h-5 w-5 mt-0.5 shrink-0 hidden sm:block" style={{ color: TRIP_COLOR }} aria-hidden="true" />
        <div className="space-y-3 flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Plane className="h-4 w-4 shrink-0 sm:hidden" style={{ color: TRIP_COLOR }} aria-hidden="true" />
            {t('dashboard.active-trip.banner-title')}
          </p>
          {activeTrips.map((trip) => (
            <ActiveTripItem key={trip.tripId} trip={trip} onAddExpense={onAddExpense} />
          ))}
        </div>
      </div>
    </div>
  );
}
