'use client';

/**
 * DataState — declarative wrapper for the four states of an async/query view:
 * loading, error, empty and ready. Centralizes the pattern so views never paint
 * an empty state when a request actually failed (the "deceptive empty" bug).
 *
 * Precedence: loading > error > empty > children.
 *
 * Usage:
 *   <DataState
 *     isLoading={query.isLoading}
 *     isError={query.isError}
 *     isEmpty={items.length === 0}
 *     onRetry={query.refetch}
 *     errorMessage={t('crypto.errors.load')}
 *     emptyState={<EmptyState icon={Inbox} title={t('crypto.events.empty')} />}
 *   >
 *     <EventsTable items={items} />
 *   </DataState>
 */

import { Inbox } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingCard } from '@/components/ui/LoadingSpinner';
import { useTranslate } from '@/hooks/useTranslations';

interface DataStateProps {
  isLoading: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  onRetry?: () => void;
  errorMessage?: string;
  loadingFallback?: React.ReactNode;
  emptyState?: React.ReactNode;
  children: React.ReactNode;
}

export function DataState({
  isLoading,
  isError = false,
  isEmpty = false,
  onRetry,
  errorMessage,
  loadingFallback,
  emptyState,
  children,
}: DataStateProps) {
  const { t } = useTranslate();

  if (isLoading) {
    return <>{loadingFallback ?? <LoadingCard />}</>;
  }

  if (isError) {
    return <ErrorState message={errorMessage ?? t('common.error')} onRetry={onRetry} />;
  }

  if (isEmpty) {
    return <>{emptyState ?? <EmptyState icon={Inbox} title={t('common.data-state.empty-title')} />}</>;
  }

  return <>{children}</>;
}
