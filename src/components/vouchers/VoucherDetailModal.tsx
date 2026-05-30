'use client';

/**
 * BudgetGuard Voucher ("bono") Detail
 * Shows remaining balance (€ + units), a progress bar and the list of linked
 * consumptions. Allows editing or deleting the voucher.
 */

import { Pencil, Receipt, Ticket, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { useTranslate } from '@/hooks/useTranslations';
import { useDeleteVoucher, useVoucher } from '@/hooks/useVouchers';
import type { Voucher } from '@/types/finance';
import { cn, formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface VoucherDetailModalProps {
  voucherId: number;
  onClose: () => void;
  onEdit: (voucher: Voucher) => void;
}

/** Format a unit value dropping trailing zeros (15.00 → "15", 12.50 → "12.5"). */
function formatUnits(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

export function VoucherDetailModal({ voucherId, onClose, onEdit }: VoucherDetailModalProps) {
  const { t } = useTranslate();
  const { data, isLoading, isError, refetch } = useVoucher(voucherId);
  const deleteVoucher = useDeleteVoucher();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await deleteVoucher.mutateAsync(voucherId);
      onClose();
    } catch (_error) {
      // Error surfaced via mutation state
    }
  };

  const voucher = data?.voucher;
  const consumptions = data?.consumptions ?? [];

  const consumedPct =
    voucher && voucher.totalAmountCents > 0
      ? Math.min(100, Math.round((voucher.consumedCents / voucher.totalAmountCents) * 100))
      : 0;
  const isDepleted = voucher ? voucher.remainingCents <= 0 : false;

  return (
    <ModalBackdrop onClose={onClose} labelledBy="voucher-detail-title">
      <div className="card w-full max-w-md lg:max-w-lg animate-modal-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="voucher-detail-title" className="text-xl font-bold text-foreground flex items-center gap-2">
            <Ticket className="h-5 w-5 text-guard-primary" aria-hidden="true" />
            {t('vouchers.detail.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            aria-label={t('common.buttons.close')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <LoadingSpinner size="md" />
          </div>
        ) : isError || !voucher ? (
          <ErrorState message={t('vouchers.errors.load')} onRetry={() => refetch()} />
        ) : (
          <div className="space-y-5">
            {/* Title + category */}
            <div>
              <p className="text-lg font-semibold text-foreground">
                {voucher.description || voucher.categoryName || t('vouchers.untitled')}
              </p>
              {voucher.categoryName && <p className="text-sm text-guard-muted">{voucher.categoryName}</p>}
            </div>

            {/* Remaining balance */}
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-guard-muted">{t('vouchers.remaining')}</span>
                <span className="text-xs text-guard-muted tabular-nums">
                  {formatCurrency(voucher.consumedCents)} / {formatCurrency(voucher.totalAmountCents)}
                </span>
              </div>
              <p className={cn('text-2xl font-bold tabular-nums', isDepleted ? 'text-guard-muted' : 'text-foreground')}>
                {formatCurrency(Math.max(0, voucher.remainingCents))}
              </p>

              {/* Progress bar */}
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full', isDepleted ? 'bg-guard-muted' : 'bg-guard-primary')}
                  style={{ width: `${consumedPct}%` }}
                />
              </div>

              {/* Units remaining */}
              {voucher.totalUnits != null && (
                <p className="mt-2 text-sm text-guard-muted tabular-nums">
                  {t('vouchers.units-remaining', {
                    remaining: formatUnits(Math.max(0, voucher.totalUnits - voucher.consumedUnits)),
                    total: formatUnits(voucher.totalUnits),
                    label: voucher.unitLabel ?? '',
                  })}
                </p>
              )}
            </div>

            {/* Dates */}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span className="text-guard-muted">
                {t('vouchers.purchased')}:{' '}
                <span className="text-foreground">{formatDate(voucher.purchaseDate, 'long')}</span>
              </span>
              {voucher.expiryDate && (
                <span className="text-guard-muted">
                  {t('vouchers.expires')}:{' '}
                  <span className="text-foreground">{formatDate(voucher.expiryDate, 'long')}</span>
                </span>
              )}
            </div>

            {/* Consumptions */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                {t('vouchers.consumptions')} ({voucher.consumptionCount})
              </h3>
              {consumptions.length === 0 ? (
                <EmptyState icon={Receipt} title={t('vouchers.no-consumptions')} />
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {consumptions.map((tx) => (
                    <li key={tx.transactionId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">
                          {tx.description || tx.category?.name || t('transactions.no-category')}
                        </p>
                        <p className="text-xs text-guard-muted tabular-nums">
                          {formatDate(tx.transactionDate, 'short')}
                          {tx.voucherUnits != null && voucher.unitLabel
                            ? ` · ${formatUnits(tx.voucherUnits)} ${voucher.unitLabel}`
                            : ''}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-foreground tabular-nums">
                        {formatCurrency(tx.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => onEdit(voucher)}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/70 transition-colors font-medium"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                {t('common.buttons.edit')}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteVoucher.isPending}
                className={cn(
                  'flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  confirmDelete
                    ? 'bg-guard-danger text-white hover:bg-guard-danger/90'
                    : 'bg-guard-danger/10 text-guard-danger hover:bg-guard-danger/20',
                )}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {confirmDelete ? t('vouchers.delete.confirm') : t('common.buttons.delete')}
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalBackdrop>
  );
}
