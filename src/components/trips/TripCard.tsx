'use client';

/**
 * BudgetGuard Trip Card
 * Card component showing trip summary with category color bar
 */

import { Calendar, MapPin } from 'lucide-react';
import Link from 'next/link';
import { DeleteButton } from '@/components/ui/DeleteButton';
import { Tooltip } from '@/components/ui/Tooltip';
import { TRIP_COLOR } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import type { TripDisplay } from '@/types/finance';
import { cn, formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface TripCardProps {
  trip: TripDisplay;
  onDelete: (tripId: number) => void;
  isDeleting: boolean;
  isUpcoming?: boolean;
  isInProgress?: boolean;
}

export function TripCard({ trip, onDelete, isDeleting, isUpcoming, isInProgress }: TripCardProps) {
  const { t } = useTranslate();

  // Category color bar: horizontal stacked bar proportional to totals
  const totalForBar = trip.categorySummary.reduce((sum, cat) => sum + cat.totalCents, 0);

  return (
    <Link
      href={`/trips/${trip.tripId}`}
      className={cn(
        'card hover:shadow-md transition-all duration-200 ease-out-quart group block',
        isUpcoming && 'border-dashed border-guard-primary/40 opacity-80 hover:opacity-100',
        isInProgress && 'border-guard-success/50 ring-1 ring-guard-success/20',
      )}
    >
      {/* Category color bar */}
      {trip.categorySummary.length > 0 && totalForBar > 0 && (
        <div className="flex h-1.5 rounded-full overflow-hidden mb-4">
          {trip.categorySummary.map((cat) => (
            <Tooltip key={cat.categoryId} content={`${cat.categoryName}: ${formatCurrency(cat.totalCents)}`}>
              <div
                className="h-full"
                style={{
                  backgroundColor: cat.categoryColor ?? TRIP_COLOR,
                  width: `${(cat.totalCents / totalForBar) * 100}%`,
                }}
              />
            </Tooltip>
          ))}
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        {/* Trip info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="h-4 w-4 text-guard-primary flex-shrink-0" aria-hidden="true" />
            <h3 className="text-lg font-semibold text-foreground truncate">
              {trip.name} {(trip.startDate ?? trip.createdAt).slice(0, 4)}
            </h3>
            {isInProgress && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-guard-success/10 text-guard-success flex-shrink-0 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-guard-success animate-pulse" />
                {t('trips.in-progress-badge')}
              </span>
            )}
            {isUpcoming && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-guard-primary/10 text-guard-primary flex-shrink-0">
                {t('trips.upcoming-badge')}
              </span>
            )}
          </div>

          {/* Date range */}
          <div className="flex items-center gap-1.5 text-sm text-guard-muted mb-2">
            <Calendar className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            {trip.startDate && trip.endDate ? (
              <span>
                {formatDate(trip.startDate)} — {formatDate(trip.endDate)}
              </span>
            ) : (
              <span>{t('trips.card.no-dates')}</span>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 text-sm">
            <span className="text-guard-muted">
              {trip.expenseCount > 0
                ? t('trips.card.expenses', { count: trip.expenseCount })
                : t('trips.card.no-expenses')}
            </span>
            {trip.totalCents > 0 && (
              <span className="font-semibold text-guard-danger">-{formatCurrency(trip.totalCents)}</span>
            )}
          </div>
        </div>

        <DeleteButton
          onDelete={() => onDelete(trip.tripId)}
          isDeleting={isDeleting}
          confirmLabel={t('trips.delete.confirm', { count: trip.expenseCount })}
          defaultLabel={t('trips.delete.button')}
          className="flex-shrink-0"
        />
      </div>
    </Link>
  );
}
