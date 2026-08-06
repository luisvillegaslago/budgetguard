/**
 * Component Tests: ActiveTripBanner shared flag
 *
 * The dashboard shortcut ("Añadir gasto") must forward the trip's shared flag so
 * the expense modal opens with the shared (÷2) option pre-checked, exactly like
 * the trip detail page does.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TripDisplay } from '@/types/finance';

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({ t: (key: string) => key, locale: 'es', setLocale: jest.fn() }),
}));

const mockTrips: { activeTrips: TripDisplay[] } = { activeTrips: [] };

jest.mock('@/hooks/useActiveTrips', () => ({
  useActiveTrips: () => ({ activeTrips: mockTrips.activeTrips, isLoading: false }),
}));

import { ActiveTripBanner } from '@/components/trips/ActiveTripBanner';

const buildTrip = (isShared: boolean): TripDisplay => ({
  tripId: 7,
  name: 'Sonorama 2026',
  startDate: '2026-08-05',
  endDate: '2026-08-09',
  isShared,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  expenseCount: 4,
  totalCents: 25200,
  categorySummary: [],
});

describe('ActiveTripBanner shared flag', () => {
  it('forwards isShared true for a shared trip', () => {
    mockTrips.activeTrips = [buildTrip(true)];
    const onAddExpense = jest.fn();

    render(<ActiveTripBanner onAddExpense={onAddExpense} />);
    fireEvent.click(screen.getByText('dashboard.active-trip.add-expense'));

    expect(onAddExpense).toHaveBeenCalledWith({ tripId: 7, startDate: '2026-08-05', isShared: true });
  });

  it('forwards isShared false for a non-shared trip', () => {
    mockTrips.activeTrips = [buildTrip(false)];
    const onAddExpense = jest.fn();

    render(<ActiveTripBanner onAddExpense={onAddExpense} />);
    fireEvent.click(screen.getByText('dashboard.active-trip.add-expense'));

    expect(onAddExpense).toHaveBeenCalledWith({ tripId: 7, startDate: '2026-08-05', isShared: false });
  });
});
