'use client';

/**
 * BudgetGuard Trip List
 * Displays all trips as card components with 3-way classification:
 * in progress, upcoming, and completed
 */

import { ChevronDown, MapPin, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SearchInput } from '@/components/ui/SearchInput';
import { useTranslate } from '@/hooks/useTranslations';
import { useDeleteTrip, useTrips } from '@/hooks/useTrips';
import type { TripDisplay } from '@/types/finance';
import { cn } from '@/utils/helpers';
import { TripCard } from './TripCard';

const SECTION_HEADING = 'text-sm font-semibold uppercase tracking-wider mb-3';

interface TripListProps {
  onAdd: () => void;
}

export function TripList({ onAdd }: TripListProps) {
  const { t } = useTranslate();
  const { data: trips, isLoading, isError, refetch } = useTrips();
  const deleteTrip = useDeleteTrip();
  const [searchQuery, setSearchQuery] = useState('');
  // Upcoming trips are the least actionable of the three groups, so the section
  // starts collapsed and gets out of the way of what is happening now.
  const [isUpcomingOpen, setIsUpcomingOpen] = useState(false);

  const today = new Date().toISOString().split('T')[0] ?? '';

  const filteredTrips = useMemo(() => {
    if (!trips) return [];
    if (!searchQuery.trim()) return trips;
    const query = searchQuery.toLowerCase();
    return trips.filter((trip) => trip.name.toLowerCase().includes(query));
  }, [trips, searchQuery]);

  const { inProgress, upcoming, past } = useMemo(() => {
    const groups: { inProgress: TripDisplay[]; upcoming: TripDisplay[]; past: TripDisplay[] } = {
      inProgress: [],
      upcoming: [],
      past: [],
    };

    filteredTrips.forEach((trip) => {
      if (!trip.startDate || trip.startDate > today) {
        groups.upcoming.push(trip);
      } else if (!trip.endDate || trip.endDate >= today) {
        groups.inProgress.push(trip);
      } else {
        groups.past.push(trip);
      }
    });

    groups.upcoming.sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));

    return groups;
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

  const hasResults = inProgress.length > 0 || upcoming.length > 0 || past.length > 0;

  // A collapsed section would swallow search hits, so searching forces it open.
  const isSearching = searchQuery.trim().length > 0;
  const showUpcoming = isUpcomingOpen || isSearching;

  const renderGrid = (list: TripDisplay[], flags?: { isInProgress?: boolean; isUpcoming?: boolean }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {list.map((trip) => (
        <TripCard key={trip.tripId} trip={trip} onDelete={handleDelete} isDeleting={deleteTrip.isPending} {...flags} />
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Search filter */}
      <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder={t('trips.search-placeholder')} />

      {/* Empty search result */}
      {searchQuery && !hasResults && (
        <p className="text-center text-sm text-guard-muted py-6">{t('trips.search-empty')}</p>
      )}

      {/* In Progress section — most relevant, shown first */}
      {inProgress.length > 0 && (
        <div>
          <h3 className={cn(SECTION_HEADING, 'text-guard-success')}>{t('trips.in-progress')}</h3>
          {renderGrid(inProgress, { isInProgress: true })}
        </div>
      )}

      {/* Upcoming section — collapsed on load */}
      {upcoming.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setIsUpcomingOpen((open) => !open)}
            aria-expanded={showUpcoming}
            // While searching the section is forced open, so the toggle would
            // flip hidden state and report a change that never happened.
            disabled={isSearching}
            className={cn(
              SECTION_HEADING,
              'tap-target justify-start gap-1.5 text-guard-primary',
              isSearching && 'cursor-default',
            )}
          >
            <ChevronDown
              className={cn('h-4 w-4 transition-transform duration-200', !showUpcoming && '-rotate-90')}
              aria-hidden="true"
            />
            {t('trips.upcoming')}
            <span className="font-normal text-guard-muted">({upcoming.length})</span>
          </button>
          {showUpcoming && renderGrid(upcoming, { isUpcoming: true })}
        </div>
      )}

      {/* Past section */}
      {past.length > 0 && (
        <div>
          {(inProgress.length > 0 || upcoming.length > 0) && (
            <h3 className={cn(SECTION_HEADING, 'text-guard-muted')}>{t('trips.past')}</h3>
          )}
          {renderGrid(past)}
        </div>
      )}
    </div>
  );
}
