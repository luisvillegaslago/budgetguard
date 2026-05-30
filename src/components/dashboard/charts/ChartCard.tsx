'use client';

/**
 * BudgetGuard Chart Card
 * Shared presentational wrapper for dashboard charts: header + loading/error/empty states.
 */

import { BarChart3 } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  isLoading?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  emptyMessage: string;
  errorMessage: string;
  onRetry?: () => void;
  children: ReactNode;
}

export function ChartCard({
  title,
  subtitle,
  action,
  isLoading,
  isError,
  isEmpty,
  emptyMessage,
  errorMessage,
  onRetry,
  children,
}: ChartCardProps) {
  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-guard-muted mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center min-h-[16rem]">
          <LoadingSpinner size="md" />
        </div>
      ) : isError ? (
        <ErrorState message={errorMessage} onRetry={onRetry} />
      ) : isEmpty ? (
        <EmptyState icon={BarChart3} title={emptyMessage} />
      ) : (
        children
      )}
    </div>
  );
}
