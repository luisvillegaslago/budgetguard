'use client';

/**
 * BudgetGuard Vouchers ("bonos") Widget
 * Lists active prepaid vouchers with a consumed/remaining progress bar.
 * Depleted (fully spent) vouchers are hidden behind a collapsible toggle.
 * Global widget: not tied to the selected month (a voucher spans many months).
 */

import { ChevronDown, Plus, Ticket } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { VoucherDetailModal } from '@/components/vouchers/VoucherDetailModal';
import { VoucherFormModal } from '@/components/vouchers/VoucherFormModal';
import { useTranslate } from '@/hooks/useTranslations';
import { useVouchers } from '@/hooks/useVouchers';
import type { Voucher } from '@/types/finance';
import { cn } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

const EXPIRY_SOON_DAYS = 30;

/** Days until expiry (negative if already expired), or null when no expiry set. */
function daysUntilExpiry(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const expiry = new Date(`${expiryDate}T00:00:00Z`).getTime();
  const todayStr = new Date().toISOString().split('T')[0];
  const todayMs = new Date(`${todayStr}T00:00:00Z`).getTime();
  return Math.round((expiry - todayMs) / 86_400_000);
}

interface VoucherRowProps {
  voucher: Voucher;
  onSelect: (voucher: Voucher) => void;
}

function VoucherRow({ voucher, onSelect }: VoucherRowProps) {
  const { t } = useTranslate();
  const consumedPct =
    voucher.totalAmountCents > 0
      ? Math.min(100, Math.round((voucher.consumedCents / voucher.totalAmountCents) * 100))
      : 0;
  const isDepleted = voucher.remainingCents <= 0;
  const days = daysUntilExpiry(voucher.expiryDate);
  const expired = days != null && days < 0;
  const expiringSoon = days != null && days >= 0 && days <= EXPIRY_SOON_DAYS;

  return (
    <button
      type="button"
      onClick={() => onSelect(voucher)}
      className="w-full text-left rounded-lg border border-border px-3 py-2.5 hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-foreground">
          {voucher.description || voucher.categoryName || t('vouchers.untitled')}
        </span>
        <span
          className={cn(
            'text-sm font-semibold tabular-nums flex-shrink-0',
            isDepleted ? 'text-guard-muted' : 'text-foreground',
          )}
        >
          {formatCurrency(Math.max(0, voucher.remainingCents))}
        </span>
      </div>

      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', isDepleted ? 'bg-guard-muted' : 'bg-guard-primary')}
          style={{ width: `${consumedPct}%` }}
        />
      </div>

      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-guard-muted tabular-nums">
          {t('vouchers.of-total', { total: formatCurrency(voucher.totalAmountCents) })}
        </span>
        {expired ? (
          <span className="text-xs font-medium text-guard-danger">{t('vouchers.expired')}</span>
        ) : expiringSoon ? (
          <span className="text-xs font-medium text-guard-warning">
            {t('vouchers.expires-in-days', { days: days as number })}
          </span>
        ) : null}
      </div>
    </button>
  );
}

export function VouchersWidget() {
  const { t } = useTranslate();
  const { data, isLoading, isError, refetch } = useVouchers();
  const [showSpent, setShowSpent] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editVoucher, setEditVoucher] = useState<Voucher | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const { active, spent } = useMemo(() => {
    const vouchers = data ?? [];
    return {
      active: vouchers.filter((v) => v.remainingCents > 0),
      spent: vouchers.filter((v) => v.remainingCents <= 0),
    };
  }, [data]);

  const handleEditFromDetail = (voucher: Voucher) => {
    setDetailId(null);
    setEditVoucher(voucher);
  };

  return (
    <div className="card flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Ticket className="h-5 w-5 text-guard-primary" aria-hidden="true" />
          {t('vouchers.widget.title')}
        </h3>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1 text-sm font-medium text-guard-primary hover:bg-guard-primary/10 px-2 py-1 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('vouchers.widget.new')}
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-10">
          <LoadingSpinner size="md" />
        </div>
      ) : isError ? (
        <ErrorState message={t('vouchers.errors.load')} onRetry={() => refetch()} />
      ) : active.length === 0 && spent.length === 0 ? (
        <EmptyState icon={Ticket} title={t('vouchers.widget.empty')} subtitle={t('vouchers.widget.empty-subtitle')} />
      ) : (
        <div className="flex flex-1 flex-col gap-2">
          {/* Active vouchers */}
          {active.length === 0 ? (
            <p className="text-sm text-guard-muted py-2">{t('vouchers.widget.no-active')}</p>
          ) : (
            active.map((voucher) => (
              <VoucherRow key={voucher.voucherId} voucher={voucher} onSelect={(v) => setDetailId(v.voucherId)} />
            ))
          )}

          {/* Spent (depleted) toggle */}
          {spent.length > 0 && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setShowSpent((prev) => !prev)}
                aria-expanded={showSpent}
                className="flex w-full items-center justify-center gap-1.5 py-2 text-sm font-medium text-guard-muted hover:text-foreground transition-colors"
              >
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', showSpent && 'rotate-180')}
                  aria-hidden="true"
                />
                {t('vouchers.widget.show-spent', { count: spent.length })}
              </button>

              {showSpent && (
                <div className="flex flex-col gap-2 animate-fade-in">
                  {spent.map((voucher) => (
                    <VoucherRow key={voucher.voucherId} voucher={voucher} onSelect={(v) => setDetailId(v.voucherId)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {createOpen && <VoucherFormModal onClose={() => setCreateOpen(false)} />}
      {editVoucher && <VoucherFormModal voucher={editVoucher} onClose={() => setEditVoucher(null)} />}
      {detailId !== null && (
        <VoucherDetailModal voucherId={detailId} onClose={() => setDetailId(null)} onEdit={handleEditFromDetail} />
      )}
    </div>
  );
}
