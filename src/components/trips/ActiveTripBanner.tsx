'use client';

/**
 * Active Trip Banner
 * Shows a dismissable banner on the dashboard when there is an active trip
 * (today falls within the trip's date range). Includes a quick "Add Expense" button.
 */

import { Calendar, Plane, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { TRIP_COLOR } from '@/constants/finance';
import { useActiveTrips } from '@/hooks/useActiveTrips';
import { useTranslate } from '@/hooks/useTranslations';
import type { TripDisplay } from '@/types/finance';
import { formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface ActiveTripBannerProps {
  onAddExpense: (tripId: number) => void;
}

function ActiveTripItem({ trip, onAddExpense }: { trip: TripDisplay; onAddExpense: (tripId: number) => void }) {
  const { t } = useTranslate();

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm min-w-0">
        <Calendar className="h-4 w-4 shrink-0" style={{ color: TRIP_COLOR }} aria-hidden="true" />
        <span className="font-medium text-foreground truncate">{trip.name}</span>
        {trip.startDate && trip.endDate && (
          <span className="text-guard-muted hidden sm:inline">
            {formatDate(trip.startDate)} — {formatDate(trip.endDate)}
          </span>
        )}
        {trip.expenseCount > 0 && (
          <span
            className="text-xs px-1.5 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: `${TRIP_COLOR}15`, color: TRIP_COLOR }}
          >
            {t('dashboard.active-trip.expenses-count', {
              count: trip.expenseCount,
              total: formatCurrency(trip.totalCents),
            })}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => onAddExpense(trip.tripId)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-lg transition-colors shrink-0"
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
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed || activeTrips.length === 0) return null;

  return (
    <div
      className="rounded-lg border p-4 mb-6"
      style={{ backgroundColor: `${TRIP_COLOR}08`, borderColor: `${TRIP_COLOR}30` }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <Plane className="h-5 w-5 mt-0.5 shrink-0" style={{ color: TRIP_COLOR }} aria-hidden="true" />
          <div className="space-y-2 flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{t('dashboard.active-trip.banner-title')}</p>
            {activeTrips.map((trip) => (
              <ActiveTripItem key={trip.tripId} trip={trip} onAddExpense={onAddExpense} />
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          className="p-1 text-guard-muted hover:text-foreground transition-colors"
          aria-label={t('common.buttons.close')}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
