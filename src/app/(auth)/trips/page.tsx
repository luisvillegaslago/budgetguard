'use client';

/**
 * BudgetGuard Trips Page
 * Lists all trips with summary data and create form
 */

import { ArrowLeft, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TripCreateForm } from '@/components/trips/TripCreateForm';
import { TripList } from '@/components/trips/TripList';
import { useTranslate } from '@/hooks/useTranslations';

export default function TripsPage() {
  const { t } = useTranslate();
  const router = useRouter();
  const [showCreateForm, setShowCreateForm] = useState(false);

  const handleCreated = (tripId: number) => {
    setShowCreateForm(false);
    router.push(`/trips/${tripId}`);
  };

  return (
    <div className="min-h-screen bg-guard-light dark:bg-guard-dark">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="p-2 text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              aria-label={t('trips.back')}
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t('trips.title')}</h1>
              <p className="text-sm text-guard-muted mt-0.5">{t('trips.subtitle')}</p>
            </div>
          </div>

          <button type="button" onClick={() => setShowCreateForm(true)} className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('trips.new')}</span>
          </button>
        </div>

        {/* Trip List */}
        <TripList onAdd={() => setShowCreateForm(true)} />
      </div>

      {/* Create Form Modal */}
      {showCreateForm && <TripCreateForm onClose={() => setShowCreateForm(false)} onCreated={handleCreated} />}
    </div>
  );
}
