'use client';

/**
 * Pending Transactions Banner
 * Shows a collapsible panel when pending transactions have reached their due date,
 * prompting the user to mark them as paid.
 */

import { CheckCircle, Clock } from 'lucide-react';
import { useMemo } from 'react';
import { AlertPanel } from '@/components/ui/AlertPanel';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ALERT_PANEL, TRANSACTION_STATUS } from '@/constants/finance';
import { useMarkTransactionsPaid, useTransactions, useUpdateTransactionStatus } from '@/hooks/useTransactions';
import { useTranslate } from '@/hooks/useTranslations';
import { useIsPendingPanelCollapsed, useSelectedMonth, useTogglePendingPanel } from '@/stores/useFinanceStore';
import type { Transaction } from '@/types/finance';
import { formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

export function PendingTransactionsBanner() {
  const { t } = useTranslate();
  const selectedMonth = useSelectedMonth();
  const { data } = useTransactions(selectedMonth);
  const updateStatus = useUpdateTransactionStatus();
  const markAllPaid = useMarkTransactionsPaid();
  const isCollapsed = useIsPendingPanelCollapsed();
  const togglePanel = useTogglePendingPanel();

  const duePending = useMemo((): Transaction[] => {
    if (!data?.data) return [];
    const today = new Date().toISOString().split('T')[0] ?? '';
    return data.data.filter((tx) => tx.status === TRANSACTION_STATUS.PENDING && tx.transactionDate <= today);
  }, [data]);

  if (duePending.length === 0) return null;

  const totalCents = duePending.reduce((sum, tx) => sum + tx.amountCents, 0);

  const handleMarkAsPaid = (id: number) => {
    updateStatus.mutate({ id, status: TRANSACTION_STATUS.PAID });
  };

  const handleMarkAllAsPaid = () => {
    markAllPaid.mutate(duePending.map((tx) => tx.transactionId));
  };

  const isBusy = updateStatus.isPending || markAllPaid.isPending;

  return (
    <AlertPanel
      id={ALERT_PANEL.PENDING_TRANSACTIONS}
      icon={Clock}
      title={t('transactions.pending-banner.title', { count: duePending.length })}
      badge={
        <span className="text-xs text-nowrap px-1.5 py-0.5 rounded-full font-medium bg-guard-warning/10 text-guard-warning">
          {formatCurrency(totalCents)}
        </span>
      }
      isCollapsed={isCollapsed}
      onToggle={togglePanel}
    >
      <div className="space-y-2">
        {duePending.map((tx) => (
          <div key={tx.transactionId} className="flex items-center gap-2 text-sm">
            <span className="text-guard-muted truncate flex-1 min-w-0">
              {tx.category?.name ?? tx.description ?? `#${tx.transactionId}`}
              {' · '}
              {formatDate(tx.transactionDate)}
              {' · '}
              {formatCurrency(tx.amountCents)}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleMarkAsPaid(tx.transactionId);
              }}
              disabled={isBusy}
              aria-busy={updateStatus.isPending && updateStatus.variables?.id === tx.transactionId}
              className="shrink-0 flex items-center gap-1 text-xs font-medium text-guard-success hover:text-guard-success/80 transition-colors disabled:opacity-50"
            >
              {updateStatus.isPending && updateStatus.variables?.id === tx.transactionId ? (
                <LoadingSpinner size="sm" />
              ) : (
                <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {t('transactions.mark-as-paid')}
            </button>
          </div>
        ))}

        {/* Mark all as paid (only when 2+) */}
        {duePending.length > 1 && (
          <button
            type="button"
            onClick={handleMarkAllAsPaid}
            disabled={isBusy}
            aria-busy={markAllPaid.isPending}
            className="flex items-center gap-1.5 text-xs font-semibold text-guard-success hover:text-guard-success/80 transition-colors disabled:opacity-50 mt-1"
          >
            {markAllPaid.isPending ? (
              <LoadingSpinner size="sm" />
            ) : (
              <CheckCircle className="h-4 w-4" aria-hidden="true" />
            )}
            {t('transactions.pending-banner.mark-all')}
          </button>
        )}

        {/* Without this the rows would just stay pending with no explanation */}
        {(updateStatus.errorMessage || markAllPaid.errorMessage) && (
          <p className="text-xs text-guard-danger" role="alert">
            {updateStatus.errorMessage ?? markAllPaid.errorMessage}
          </p>
        )}
      </div>
    </AlertPanel>
  );
}
