'use client';

/**
 * BudgetGuard Trip List
 * Displays all trips as card components with loading/error/empty states
 */

import { MapPin, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SearchInput } from '@/components/ui/SearchInput';
import { useTranslate } from '@/hooks/useTranslations';
import { useDeleteTrip, useTrips } from '@/hooks/useTrips';
import type { TripDisplay } from '@/types/finance';
import { TripCard } from './TripCard';

interface TripListProps {
  onAdd: () => void;
}

export function TripList({ onAdd }: TripListProps) {
  const { t } = useTranslate();
  const { data: trips, isLoading, isError, refetch } = useTrips();
  const deleteTrip = useDeleteTrip();
  const [searchQuery, setSearchQuery] = useState('');

  const today = new Date().toISOString().split('T')[0] ?? '';

  const filteredTrips = useMemo(() => {
    if (!trips) return [];
    if (!searchQuery.trim()) return trips;
    const query = searchQuery.toLowerCase();
    return trips.filter((trip) => trip.name.toLowerCase().includes(query));
  }, [trips, searchQuery]);

  const { upcoming, past } = useMemo(() => {
    const upcomingTrips: TripDisplay[] = [];
    const pastTrips: TripDisplay[] = [];

    filteredTrips.forEach((trip) => {
      const isUpcoming = !trip.startDate || trip.startDate > today;
      if (isUpcoming) {
        upcomingTrips.push(trip);
      } else {
        pastTrips.push(trip);
      }
    });

    return { upcoming: upcomingTrips, past: pastTrips };
  }, [filteredTrips, today]);

  const handleDelete = (tripId: number) => {
    deleteTrip.mutate(tripId);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card animate-pulse">
            <div className="h-1.5 w-full bg-muted rounded-full mb-4" />
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 bg-muted rounded" />
                <div className="h-5 w-32 bg-muted rounded" />
              </div>
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-4 w-20 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return <ErrorState message={t('trips.errors.load')} onRetry={() => refetch()} />;
  }

  if (!trips || trips.length === 0) {
    return (
      <EmptyState
        icon={MapPin}
        title={t('trips.empty.title')}
        subtitle={t('trips.empty.subtitle')}
        action={
          <button type="button" onClick={onAdd} className="btn-primary inline-flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('trips.empty.cta')}
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Search filter */}
      <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder={t('trips.search-placeholder')} />

      {/* Empty search result */}
      {searchQuery && upcoming.length === 0 && past.length === 0 && (
        <p className="text-center text-sm text-guard-muted py-6">{t('trips.search-empty')}</p>
      )}

      {upcoming.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-guard-primary uppercase tracking-wider mb-3">
            {t('trips.upcoming')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcoming.map((trip) => (
              <TripCard
                key={trip.tripId}
                trip={trip}
                onDelete={handleDelete}
                isDeleting={deleteTrip.isPending}
                isUpcoming
              />
            ))}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          {upcoming.length > 0 && (
            <h3 className="text-sm font-semibold text-guard-muted uppercase tracking-wider mb-3">{t('trips.past')}</h3>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {past.map((trip) => (
              <TripCard key={trip.tripId} trip={trip} onDelete={handleDelete} isDeleting={deleteTrip.isPending} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
