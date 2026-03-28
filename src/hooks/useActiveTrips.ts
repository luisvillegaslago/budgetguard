/**
 * Hook to detect trips that are currently active (today falls within their date range)
 * Derives from useTrips() — no additional API call
 */

import { useTrips } from '@/hooks/useTrips';
import type { TripDisplay } from '@/types/finance';

function getTodayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function useActiveTrips(): { activeTrips: TripDisplay[]; isLoading: boolean } {
  const { data: trips, isLoading } = useTrips();

  const today = getTodayISO();
  const activeTrips = (trips ?? []).filter(
    (trip) => trip.startDate && trip.endDate && trip.startDate <= today && today <= trip.endDate,
  );

  return { activeTrips, isLoading };
}
