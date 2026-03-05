'use client';

/**
 * BudgetGuard Trip Detail Page
 * Shows full trip details with expense list and category breakdown
 */

import { AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { TripDetail } from '@/components/trips/TripDetail';
import { TripExpenseForm } from '@/components/trips/TripExpenseForm';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useTranslate } from '@/hooks/useTranslations';
import { useTrip } from '@/hooks/useTrips';
import type { Transaction } from '@/types/finance';

export default function TripDetailPage() {
  const { t } = useTranslate();
  const params = useParams();
  const searchParams = useSearchParams();
  const tripId = Number.parseInt(params.id as string, 10);
  const fromDashboard = searchParams.get('from') === 'dashboard';
  const { data: trip, isLoading, isError, refetch } = useTrip(tripId);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Transaction | null>(null);

  if (Number.isNaN(tripId)) {
    return (
      <div className="min-h-screen bg-guard-light dark:bg-guard-dark flex items-center justify-center">
        <p className="text-guard-danger">{t('trips.errors.not-found')}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-guard-light dark:bg-guard-dark flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError || !trip) {
    return (
      <div className="min-h-screen bg-guard-light dark:bg-guard-dark">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12" role="alert">
            <AlertCircle className="h-12 w-12 mx-auto mb-3 text-guard-danger opacity-50" aria-hidden="true" />
            <p className="text-guard-danger">{t('trips.errors.load-detail')}</p>
            <button type="button" onClick={() => refetch()} className="btn-ghost mt-4 inline-flex items-center gap-2">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {t('common.buttons.retry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-guard-light dark:bg-guard-dark">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back link */}
        <div className="mb-6">
          <Link
            href={fromDashboard ? '/dashboard' : '/trips'}
            className="inline-flex items-center gap-2 text-sm text-guard-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {fromDashboard ? t('trips.back') : t('trips.title')}
          </Link>
        </div>

        {/* Trip Detail */}
        <TripDetail trip={trip} onAddExpense={() => setShowExpenseForm(true)} onEditExpense={setEditingExpense} />
      </div>

      {/* Expense Form Modals */}
      {editingExpense && (
        <TripExpenseForm tripId={tripId} transaction={editingExpense} onClose={() => setEditingExpense(null)} />
      )}
      {showExpenseForm && !editingExpense && (
        <TripExpenseForm tripId={tripId} onClose={() => setShowExpenseForm(false)} />
      )}
    </div>
  );
}
