'use client';

/**
 * BudgetGuard Top Vendors Widget
 * Ranking of the month's expenses by vendor. Clicking a vendor opens its
 * transactions popup for the month.
 */

import { ArrowRight, Store } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { MonthTransactionsModal } from '@/components/dashboard/charts/MonthTransactionsModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { TRANSACTION_TYPE } from '@/constants/finance';
import { useTransactions } from '@/hooks/useTransactions';
import { useTranslate } from '@/hooks/useTranslations';
import { useSelectedMonth } from '@/stores/useFinanceStore';
import type { Transaction } from '@/types/finance';
import { formatCurrency } from '@/utils/money';

const TOP_COUNT = 6;
const VENDOR_COLOR = '#8B5CF6'; // guard-accent

export interface VendorTotal {
  vendor: string;
  totalCents: number;
  count: number;
}

/** Aggregate expense transactions by vendor name, sorted by amount desc. */
export function aggregateTopVendors(transactions: Transaction[], limit: number): VendorTotal[] {
  const totals = new Map<string, { totalCents: number; count: number }>();

  transactions.forEach((tx) => {
    if (tx.type !== TRANSACTION_TYPE.EXPENSE) return;
    const vendor = tx.vendorName?.trim();
    if (!vendor) return;
    const acc = totals.get(vendor) ?? { totalCents: 0, count: 0 };
    acc.totalCents += tx.amountCents;
    acc.count += 1;
    totals.set(vendor, acc);
  });

  return Array.from(totals.entries())
    .map(([vendor, v]) => ({ vendor, totalCents: v.totalCents, count: v.count }))
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, limit);
}

export function TopVendorsWidget() {
  const { t } = useTranslate();
  const selectedMonth = useSelectedMonth();
  // Intentional client-side aggregation: reuses the cached month-transactions query
  // shared with the drill-down popups. Move to a SQL view if monthly volume grows large.
  const { data, isPending, isError, refetch } = useTransactions(selectedMonth);
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);

  const vendors = useMemo(() => aggregateTopVendors(data?.data ?? [], TOP_COUNT), [data]);
  const maxCents = vendors[0]?.totalCents ?? 0;

  return (
    <div className="card flex flex-col">
      <h3 className="text-lg font-semibold text-foreground mb-4">{t('dashboard.widgets.top-vendors-title')}</h3>

      {isPending ? (
        <div className="flex flex-1 items-center justify-center py-10">
          <LoadingSpinner size="md" />
        </div>
      ) : isError ? (
        <ErrorState message={t('errors.load-transactions')} onRetry={() => refetch()} />
      ) : vendors.length === 0 ? (
        <EmptyState icon={Store} title={t('dashboard.widgets.no-vendors')} />
      ) : (
        <ol className="space-y-3">
          {vendors.map((vendor, index) => (
            <li key={vendor.vendor}>
              <button
                type="button"
                onClick={() => setSelectedVendor(vendor.vendor)}
                className="flex w-full items-center gap-3 -mx-2 px-2 py-1.5 rounded-lg hover:bg-muted/30 transition-colors text-left cursor-pointer"
              >
                <span className="text-xs font-semibold text-guard-muted w-4 text-center tabular-nums">{index + 1}</span>
                <div className="flex-shrink-0 p-1.5 rounded-lg" style={{ backgroundColor: `${VENDOR_COLOR}15` }}>
                  <Store className="h-4 w-4" style={{ color: VENDOR_COLOR }} aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground truncate">{vendor.vendor}</span>
                    <span className="text-sm font-semibold text-foreground flex-shrink-0 tabular-nums">
                      {formatCurrency(vendor.totalCents)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out-quart"
                      style={{
                        width: `${maxCents > 0 ? Math.round((vendor.totalCents / maxCents) * 100) : 0}%`,
                        backgroundColor: VENDOR_COLOR,
                      }}
                    />
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ol>
      )}

      {!isPending && !isError && vendors.length > 0 && (
        <div className="mt-auto pt-3 border-t border-border">
          <Link
            href="/movements"
            className="inline-flex items-center gap-1.5 text-sm text-guard-primary hover:text-guard-primary/80 transition-colors"
          >
            {t('dashboard.widgets.view-movements')}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      )}

      {selectedVendor && (
        <MonthTransactionsModal
          title={selectedVendor}
          icon={
            <div className="flex-shrink-0 p-2 rounded-lg" style={{ backgroundColor: `${VENDOR_COLOR}15` }}>
              <Store className="h-5 w-5" style={{ color: VENDOR_COLOR }} aria-hidden="true" />
            </div>
          }
          month={selectedMonth}
          filter={(tx) => tx.vendorName === selectedVendor}
          secondary={(tx) =>
            tx.parentCategory ? `${tx.parentCategory.name} › ${tx.category?.name ?? ''}` : (tx.category?.name ?? null)
          }
          footerHref="/movements"
          onClose={() => setSelectedVendor(null)}
        />
      )}
    </div>
  );
}
