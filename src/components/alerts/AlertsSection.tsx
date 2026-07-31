'use client';

/**
 * BudgetGuard Alerts Section
 * Single source of truth for the stack of alert banners shown at the top of both
 * the dashboard and the movements page. Each banner hides itself when it has
 * nothing to report, so this renders nothing when there are no alerts.
 */

import { FiscalDeadlineBanner } from '@/components/fiscal/FiscalDeadlineBanner';
import { RecurringPendingPanel } from '@/components/recurring/RecurringPendingPanel';
import { PendingTransactionsBanner } from '@/components/transactions/PendingTransactionsBanner';
import { cn } from '@/utils/helpers';

export function AlertsSection({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-3 empty:hidden', className)}>
      <PendingTransactionsBanner />
      <FiscalDeadlineBanner />
      <RecurringPendingPanel />
    </div>
  );
}
