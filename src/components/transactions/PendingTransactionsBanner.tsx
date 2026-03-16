'use client';

/**
 * Pending Transactions Banner
 * Shows a notification when pending transactions have reached their due date,
 * prompting the user to mark them as paid.
 */

import { CheckCircle, Clock, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { TRANSACTION_STATUS } from '@/constants/finance';
import { useTransactions, useUpdateTransactionStatus } from '@/hooks/useTransactions';
import { useTranslate } from '@/hooks/useTranslations';
import { useSelectedMonth } from '@/stores/useFinanceStore';
import type { Transaction } from '@/types/finance';
import { formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

export function PendingTransactionsBanner() {
  const { t } = useTranslate();
  const selectedMonth = useSelectedMonth();
  const { data } = useTransactions(selectedMonth);
  const updateStatus = useUpdateTransactionStatus();
  const [isDismissed, setIsDismissed] = useState(false);

  const duePending = useMemo((): Transaction[] => {
    if (!data?.data) return [];
    const today = new Date().toISOString().split('T')[0] ?? '';
    return data.data.filter((tx) => tx.status === TRANSACTION_STATUS.PENDING && tx.transactionDate <= today);
  }, [data]);

  if (isDismissed || duePending.length === 0) return null;

  const totalCents = duePending.reduce((sum, tx) => sum + tx.amountCents, 0);

  const handleMarkAsPaid = (id: number) => {
    updateStatus.mutate({ id, status: TRANSACTION_STATUS.PAID });
  };

  const handleMarkAllAsPaid = () => {
    duePending.forEach((tx) => {
      updateStatus.mutate({ id: tx.transactionId, status: TRANSACTION_STATUS.PAID });
    });
  };

  return (
    <div className="rounded-lg border bg-guard-warning/5 border-guard-warning/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <Clock className="h-5 w-5 mt-0.5 shrink-0 text-guard-warning" aria-hidden="true" />
          <div className="space-y-3 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground">
                {t('transactions.pending-banner.title', { count: duePending.length })}
              </p>
              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-guard-warning/10 text-guard-warning">
                {formatCurrency(totalCents)}
              </span>
            </div>

            {/* Individual pending items */}
            <div className="space-y-1.5">
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
                    onClick={() => handleMarkAsPaid(tx.transactionId)}
                    disabled={updateStatus.isPending}
                    className="shrink-0 flex items-center gap-1 text-xs font-medium text-guard-success hover:text-guard-success/80 transition-colors disabled:opacity-50"
                  >
                    <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('transactions.mark-as-paid')}
                  </button>
                </div>
              ))}
            </div>

            {/* Mark all as paid (only when 2+) */}
            {duePending.length > 1 && (
              <button
                type="button"
                onClick={handleMarkAllAsPaid}
                disabled={updateStatus.isPending}
                className="flex items-center gap-1.5 text-xs font-semibold text-guard-success hover:text-guard-success/80 transition-colors disabled:opacity-50"
              >
                <CheckCircle className="h-4 w-4" aria-hidden="true" />
                {t('transactions.pending-banner.mark-all')}
              </button>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          className="p-1 text-guard-muted hover:text-foreground transition-colors shrink-0"
          aria-label={t('common.buttons.close')}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
