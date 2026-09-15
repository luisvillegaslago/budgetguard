'use client';

/**
 * BudgetGuard Voucher ("bono") Detail
 * Shows remaining balance (€ + units), a progress bar and the list of linked
 * consumptions. Allows editing or deleting the voucher and each consumption.
 */

import { AlertTriangle, ArrowUpRight, Link2, Pencil, Receipt, Ticket, Trash2, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { SortControl, type SortControlOption } from '@/components/ui/SortControl';
import { useToast } from '@/components/ui/Toast';
import { SHARED_EXPENSE, SORT_DIRECTION, TRANSACTION_STATUS, TRANSACTION_TYPE } from '@/constants/finance';
import { type SortableField, useSortableData } from '@/hooks/useSortableData';
import { useCreateTransaction, useDeleteTransaction, useUpdateTransaction } from '@/hooks/useTransactions';
import { useTranslate } from '@/hooks/useTranslations';
import { useDeleteVoucher, useReconcileVoucherConsumption, useVoucher } from '@/hooks/useVouchers';
import type { Transaction, Voucher } from '@/types/finance';
import { cn, formatDate } from '@/utils/helpers';
import { centsToEuros, eurosToCents, formatCurrency } from '@/utils/money';

const CONSUME_INPUT_CLASS = cn(
  'w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm',
  ' transition-colors',
);

const ROW_ACTION_CLASS = 'p-1.5 rounded-lg text-guard-muted hover:bg-muted transition-colors';

interface VoucherDetailModalProps {
  voucherId: number;
  onClose: () => void;
  onEdit: (voucher: Voucher) => void;
}

/** Format a unit value dropping trailing zeros (15.00 → "15", 12.50 → "12.5"). */
function formatUnits(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

interface VoucherConsumeFormProps {
  voucher: Voucher;
  /** Existing consumption to edit; omit it to log a new one. */
  consumption?: Transaction;
  onDone: () => void;
  onCancel: () => void;
}

/** i18n keys per form mode, so logging and editing a consumption share one form. */
const CONSUME_FORM_COPY = {
  create: {
    title: 'vouchers.use.title',
    submit: 'vouchers.use.submit',
    saving: 'vouchers.use.saving',
    success: 'vouchers.use.success',
    error: 'vouchers.use.error',
  },
  edit: {
    title: 'vouchers.consumption.edit-title',
    submit: 'vouchers.consumption.save',
    saving: 'vouchers.consumption.saving',
    success: 'vouchers.consumption.update-success',
    error: 'vouchers.consumption.update-error',
  },
} as const;

/**
 * Consumption form embedded in the detail modal. Without `consumption` it logs a
 * new expense transaction linked to this voucher (date defaults to today, units
 * to 1); with it, it edits that transaction prefilled with its current values.
 * Unit-based vouchers prorate the amount; unit-less vouchers ask for the amount.
 */
function VoucherConsumeForm({ voucher, consumption, onDone, onCancel }: VoucherConsumeFormProps) {
  const { t } = useTranslate();
  const toast = useToast();
  const createTransaction = useCreateTransaction();
  const updateTransaction = useUpdateTransaction();
  const fieldId = useId();

  const copy = consumption ? CONSUME_FORM_COPY.edit : CONSUME_FORM_COPY.create;
  const mutation = consumption ? updateTransaction : createTransaction;

  const today = new Date().toISOString().split('T')[0];
  const hasUnits = voucher.totalUnits != null && voucher.totalUnits > 0;
  const unitPriceCents = hasUnits ? voucher.totalAmountCents / (voucher.totalUnits as number) : null;

  // Full (pre-split) amount of the consumption being edited.
  const initialAmountCents = consumption ? (consumption.originalAmountCents ?? consumption.amountCents) : null;
  // Consumptions logged without units fall back to the units their amount pays for.
  const initialUnits =
    consumption?.voucherUnits ??
    (initialAmountCents != null && unitPriceCents ? Number((initialAmountCents / unitPriceCents).toFixed(2)) : 1);

  const [date, setDate] = useState(consumption ? consumption.transactionDate.slice(0, 10) : today);
  const [units, setUnits] = useState(String(initialUnits));
  const [amount, setAmount] = useState(initialAmountCents != null ? String(centsToEuros(initialAmountCents)) : '');

  const unitsNum = Number(units);
  // Unit-based vouchers prorate the price; otherwise fall back to the typed amount.
  const computedAmountCents = unitPriceCents != null && unitsNum > 0 ? Math.round(unitPriceCents * unitsNum) : null;
  const amountCents = computedAmountCents ?? eurosToCents(Number(amount) || 0);
  const canSubmit = Boolean(date) && amountCents > 0 && (hasUnits ? unitsNum > 0 : true);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const fields = {
      amount: centsToEuros(amountCents),
      transactionDate: new Date(`${date}T00:00:00Z`),
      voucherUnits: hasUnits ? unitsNum : null,
    };
    try {
      if (consumption) {
        await updateTransaction.mutateAsync({
          id: consumption.transactionId,
          // Resend the split: the API recomputes the shared half from the full amount.
          data: { ...fields, isShared: consumption.sharedDivisor > SHARED_EXPENSE.DEFAULT_DIVISOR },
        });
      } else {
        await createTransaction.mutateAsync({
          ...fields,
          categoryId: voucher.categoryId,
          description: '',
          type: TRANSACTION_TYPE.EXPENSE,
          isShared: false,
          status: TRANSACTION_STATUS.PAID,
          voucherId: voucher.voucherId,
        });
      }
      toast.success(t(copy.success));
      onDone();
    } catch (_error) {
      // Error surfaced via toast + mutation.errorMessage
      toast.error(mutation.errorMessage ?? t(copy.error));
    }
  };

  return (
    <div className="rounded-lg border border-guard-primary/40 bg-guard-primary/5 p-4 space-y-3 animate-fade-in">
      <p className="text-sm font-semibold text-foreground">{t(copy.title)}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 items-end gap-3">
        {/* Consumption date (defaults to today) */}
        <div>
          <label htmlFor={`${fieldId}-date`} className="block text-xs font-medium text-guard-muted mb-1">
            {t('vouchers.use.date')}
          </label>
          <input
            id={`${fieldId}-date`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={CONSUME_INPUT_CLASS}
          />
        </div>

        {/* Units (prorated) or raw amount for unit-less vouchers */}
        {hasUnits ? (
          <div>
            <label htmlFor={`${fieldId}-units`} className="block text-xs font-medium text-guard-muted mb-1">
              {t('vouchers.use.units')}
              {voucher.unitLabel ? ` (${voucher.unitLabel})` : ''}
            </label>
            <input
              id={`${fieldId}-units`}
              type="number"
              min="0"
              step="any"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              className={CONSUME_INPUT_CLASS}
            />
          </div>
        ) : (
          <div>
            <label htmlFor={`${fieldId}-amount`} className="block text-xs font-medium text-guard-muted mb-1">
              {t('vouchers.use.amount')}
            </label>
            <input
              id={`${fieldId}-amount`}
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t('vouchers.use.amount-placeholder')}
              className={CONSUME_INPUT_CLASS}
            />
          </div>
        )}
      </div>

      {hasUnits && amountCents > 0 && (
        <p className="text-xs text-guard-muted tabular-nums">
          {t('vouchers.use.amount-preview', { amount: formatCurrency(amountCents) })}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || mutation.isPending}
          className={cn(
            'w-full sm:flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-colors',
            'bg-guard-primary text-white hover:bg-guard-primary/90',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <Ticket className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {mutation.isPending ? t(copy.saving) : t(copy.submit)}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={mutation.isPending}
          className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg bg-muted px-4 py-2.5 font-medium text-foreground transition-colors hover:bg-muted/70 disabled:opacity-50"
        >
          {t('common.buttons.cancel')}
        </button>
      </div>
    </div>
  );
}

export function VoucherDetailModal({ voucherId, onClose, onEdit }: VoucherDetailModalProps) {
  const { t } = useTranslate();
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useVoucher(voucherId);
  const deleteVoucher = useDeleteVoucher();
  const reconcileConsumption = useReconcileVoucherConsumption();
  const deleteTransaction = useDeleteTransaction();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [consumeOpen, setConsumeOpen] = useState(false);
  // Tx being reconciled right now, to scope the pending state to its own row.
  const [reconcilingId, setReconcilingId] = useState<number | null>(null);
  // Consumption row being edited inline, and the one awaiting delete confirmation.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);

  // Consumptions with no linked skydiving activity, for quick lookup per row.
  const unlinkedSet = useMemo(() => new Set(data?.unlinkedConsumptions ?? []), [data?.unlinkedConsumptions]);

  const handleReconcile = async (transactionId: number) => {
    setReconcilingId(transactionId);
    try {
      await reconcileConsumption.mutateAsync({ transactionId });
      toast.success(t('vouchers.reconcile.success'));
    } catch (_error) {
      // Error surfaced via toast + reconcileConsumption.errorMessage
      toast.error(reconcileConsumption.errorMessage ?? t('vouchers.reconcile.error'));
    } finally {
      setReconcilingId(null);
    }
  };

  const handleConfirmDeleteConsumption = async () => {
    if (!pendingDelete) return;
    try {
      await deleteTransaction.mutateAsync(pendingDelete.transactionId);
      toast.success(t('vouchers.consumption.delete-success'));
      setPendingDelete(null);
    } catch (_error) {
      // Error surfaced via toast + deleteTransaction.errorMessage (kept dialog open)
      toast.error(deleteTransaction.errorMessage ?? t('vouchers.consumption.delete-error'));
    }
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteVoucher.mutateAsync(voucherId);
      toast.success(t('vouchers.delete.success'));
      setConfirmOpen(false);
      onClose();
    } catch (_error) {
      // Error surfaced via toast + deleteVoucher.errorMessage (kept dialog open)
      toast.error(deleteVoucher.errorMessage ?? t('vouchers.delete.error'));
    }
  };

  const voucher = data?.voucher;
  const consumptions = data?.consumptions ?? [];

  // Sortable fields for the consumptions list (title matches the row's primary label).
  const sortFields = useMemo<SortableField<Transaction>[]>(
    () => [
      { key: 'date', accessor: (tx) => tx.transactionDate },
      { key: 'amount', accessor: (tx) => tx.amountCents },
      { key: 'title', accessor: (tx) => tx.description || tx.category?.name || '' },
    ],
    [],
  );
  const {
    sorted: sortedConsumptions,
    sort,
    toggleSort,
  } = useSortableData<Transaction>(consumptions, sortFields, {
    initial: { key: 'date', direction: SORT_DIRECTION.DESC },
  });
  const sortOptions = useMemo<SortControlOption[]>(
    () => [
      { key: 'date', label: t('sort.fields.date') },
      { key: 'amount', label: t('sort.fields.amount') },
      { key: 'title', label: t('sort.fields.title') },
    ],
    [t],
  );

  const consumedPct =
    voucher && voucher.totalAmountCents > 0
      ? Math.min(100, Math.round((voucher.consumedCents / voucher.totalAmountCents) * 100))
      : 0;
  const isDepleted = voucher ? voucher.remainingCents <= 0 : false;
  // Overconsumed: linked expenses exceeded the prepaid balance (negative remaining).
  const isExceeded = voucher ? voucher.remainingCents < 0 : false;

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
                  {t('vouchers.consumed-of-total', {
                    consumed: formatCurrency(voucher.consumedCents),
                    total: formatCurrency(voucher.totalAmountCents),
                    pct: consumedPct,
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <p
                  className={cn(
                    'text-2xl font-bold tabular-nums',
                    isExceeded ? 'text-guard-danger' : isDepleted ? 'text-guard-muted' : 'text-foreground',
                  )}
                >
                  {formatCurrency(voucher.remainingCents)}
                </p>
                {isExceeded && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-guard-danger/10 px-2 py-0.5 text-xs font-medium text-guard-danger">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    {t('vouchers.exceeded')}
                  </span>
                )}
              </div>

              {/* Progress bar */}
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full',
                    isExceeded ? 'bg-guard-danger' : isDepleted ? 'bg-guard-muted' : 'bg-guard-primary',
                  )}
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
              {unlinkedSet.size > 0 && (
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-guard-warning/40 bg-guard-warning/10 px-3 py-2 text-xs text-guard-warning">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  <span>{t('vouchers.reconcile.banner', { count: unlinkedSet.size })}</span>
                </div>
              )}
              {consumptions.length > 1 && (
                <div className="mb-2">
                  <SortControl options={sortOptions} sort={sort} onToggle={toggleSort} />
                </div>
              )}
              {consumptions.length === 0 ? (
                <EmptyState icon={Receipt} title={t('vouchers.no-consumptions')} />
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {sortedConsumptions.map((tx) => {
                    const isUnlinked = unlinkedSet.has(tx.transactionId);
                    const isReconciling = reconcilingId === tx.transactionId && reconcileConsumption.isPending;
                    // A skydive consumption tied to a jump/session belongs to that activity: editing it
                    // here would desync the activity's PriceCents, so it is managed from /skydiving.
                    const isActivityLinked = data?.reconcileActivityType != null && !isUnlinked;

                    if (editingId === tx.transactionId) {
                      return (
                        <li key={tx.transactionId} className="p-3">
                          <VoucherConsumeForm
                            voucher={voucher}
                            consumption={tx}
                            onDone={() => setEditingId(null)}
                            onCancel={() => setEditingId(null)}
                          />
                        </li>
                      );
                    }

                    return (
                      <li key={tx.transactionId} className="px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm text-foreground">
                              {tx.description || tx.category?.name || t('transactions.no-category')}
                            </p>
                            <p className="text-xs text-guard-muted tabular-nums">
                              {formatDate(tx.transactionDate, 'short')}
                              {tx.voucherUnits != null
                                ? ` · ${formatUnits(tx.voucherUnits)} ${voucher.unitLabel || t('vouchers.consumption.units-fallback')}`
                                : ''}
                            </p>
                          </div>
                          <div className="flex flex-shrink-0 items-center gap-1">
                            <span className="flex items-center gap-1 text-sm font-semibold text-guard-danger tabular-nums">
                              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />-{formatCurrency(tx.amountCents)}
                            </span>
                            {isActivityLinked ? (
                              <span className="p-1.5 text-guard-muted" title={t('vouchers.consumption.linked-hint')}>
                                <Link2 className="h-4 w-4" aria-hidden="true" />
                                <span className="sr-only">{t('vouchers.consumption.linked-hint')}</span>
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(tx.transactionId)}
                                  className={cn(ROW_ACTION_CLASS, 'hover:text-foreground')}
                                  aria-label={t('vouchers.consumption.edit')}
                                >
                                  <Pencil className="h-4 w-4" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPendingDelete(tx)}
                                  className={cn(ROW_ACTION_CLASS, 'hover:text-guard-danger')}
                                  aria-label={t('vouchers.consumption.delete')}
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        {isUnlinked && (
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-guard-warning/10 px-2 py-0.5 text-xs font-medium text-guard-warning">
                              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                              {t('vouchers.reconcile.unlinked-badge')}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleReconcile(tx.transactionId)}
                              disabled={isReconciling}
                              className={cn(
                                'inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                                'bg-guard-primary/10 text-guard-primary hover:bg-guard-primary/20',
                                'disabled:opacity-50 disabled:cursor-not-allowed',
                              )}
                            >
                              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                              {t('vouchers.reconcile.create-button')}
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Quick-consume: log a new consumption against this voucher */}
            {consumeOpen ? (
              <VoucherConsumeForm
                voucher={voucher}
                onDone={() => setConsumeOpen(false)}
                onCancel={() => setConsumeOpen(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setConsumeOpen(true)}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-guard-primary text-white hover:bg-guard-primary/90 transition-colors font-medium"
              >
                <Ticket className="h-4 w-4" aria-hidden="true" />
                {t('vouchers.use.button')}
              </button>
            )}

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
                onClick={() => setConfirmOpen(true)}
                disabled={deleteVoucher.isPending}
                className={cn(
                  'flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'bg-guard-danger/10 text-guard-danger hover:bg-guard-danger/20',
                )}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {t('common.buttons.delete')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Destructive confirmation */}
      <ConfirmDialog
        open={confirmOpen}
        title={t('vouchers.delete.title')}
        message={t('vouchers.delete.message')}
        confirmLabel={t('common.buttons.delete')}
        variant="danger"
        isLoading={deleteVoucher.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={pendingDelete != null}
        title={t('vouchers.consumption.delete-title')}
        message={t('vouchers.consumption.delete-message', {
          amount: formatCurrency(pendingDelete?.amountCents ?? 0),
        })}
        confirmLabel={t('common.buttons.delete')}
        variant="danger"
        isLoading={deleteTransaction.isPending}
        onConfirm={handleConfirmDeleteConsumption}
        onCancel={() => setPendingDelete(null)}
      />
    </ModalBackdrop>
  );
}
