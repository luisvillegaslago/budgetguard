'use client';

/**
 * Bulk action bar shown while jumps or tunnel sessions are selected: pays all of
 * them from one voucher ("bono") and warns when the selection would overdraw it.
 */

import { AlertTriangle, Ticket, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { API_ERROR, SKYDIVE_ACTIVITY_TYPE, SKYDIVE_CATEGORY } from '@/constants/finance';
import { useAssignSkydiveVoucher } from '@/hooks/useSkydiveVoucherAssignment';
import { useSkydiveVouchers } from '@/hooks/useSkydiveVouchers';
import { useTranslate } from '@/hooks/useTranslations';
import type { SkydiveActivityType } from '@/types/skydive';
import { formatCurrency } from '@/utils/money';
import { formatVoucherOptionLabel, getVoucherShortfall, type VoucherAssignItem } from '@/utils/skydiveVoucher';

// Vouchers are only offered for the subcategory matching the activity.
const SUBCATEGORY_BY_ACTIVITY = {
  [SKYDIVE_ACTIVITY_TYPE.JUMP]: SKYDIVE_CATEGORY.SUBCATEGORY.JUMPS,
  [SKYDIVE_ACTIVITY_TYPE.TUNNEL]: SKYDIVE_CATEGORY.SUBCATEGORY.TUNNEL,
} as const;

interface SkydiveVoucherAssignBarProps {
  activityType: SkydiveActivityType;
  selectedItems: VoucherAssignItem[];
  onClear: () => void;
}

export function SkydiveVoucherAssignBar({ activityType, selectedItems, onClear }: SkydiveVoucherAssignBarProps) {
  const { t, locale } = useTranslate();
  const toast = useToast();
  const selectId = useId();
  const vouchers = useSkydiveVouchers(SUBCATEGORY_BY_ACTIVITY[activityType], null);
  const assign = useAssignSkydiveVoucher(activityType);
  const [voucherId, setVoucherId] = useState<number | null>(null);

  const selectedVoucher = useMemo(() => vouchers.find((v) => v.voucherId === voucherId) ?? null, [vouchers, voucherId]);
  const shortfall = useMemo(
    () => (selectedVoucher ? getVoucherShortfall(selectedVoucher, selectedItems) : null),
    [selectedVoucher, selectedItems],
  );

  if (selectedItems.length === 0) return null;

  const formatUnits = (value: number) => value.toLocaleString(locale, { maximumFractionDigits: 2 });

  const handleAssign = async () => {
    if (voucherId == null) return;
    try {
      const result = await assign.mutateAsync({ ids: selectedItems.map((item) => item.id), voucherId });
      toast.success(t('skydiving.voucher-assign.success', { count: result.assigned }));
      setVoucherId(null);
      onClear();
    } catch {
      // useApiMutation exposes the translated message; surface it as a toast.
      toast.error(assign.errorMessage ?? t(API_ERROR.MUTATION.UPDATE.SKYDIVE_VOUCHER_ASSIGNMENT));
    }
  };

  return (
    <div className="px-4 py-3 border-b border-border bg-guard-primary/5 space-y-2 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-foreground flex items-center gap-2">
          <Ticket className="h-4 w-4 text-guard-primary" aria-hidden="true" />
          {t('skydiving.voucher-assign.selected', { count: selectedItems.length })}
        </span>

        {vouchers.length === 0 ? (
          <span className="text-sm text-guard-muted">{t('skydiving.voucher-assign.no-vouchers')}</span>
        ) : (
          <>
            <div className="w-full sm:w-72">
              <label htmlFor={selectId} className="sr-only">
                {t('skydiving.voucher.select-placeholder')}
              </label>
              <Select
                id={selectId}
                value={voucherId ?? ''}
                onChange={(e) => setVoucherId(e.target.value ? Number(e.target.value) : null)}
                disabled={assign.isPending}
              >
                <option value="">{t('skydiving.voucher.select-placeholder')}</option>
                {vouchers.map((v) => (
                  <option key={v.voucherId} value={v.voucherId}>
                    {formatVoucherOptionLabel(v, t('vouchers.untitled'))}
                  </option>
                ))}
              </Select>
            </div>
            <button
              type="button"
              onClick={handleAssign}
              disabled={voucherId == null || assign.isPending}
              className="btn-primary text-sm py-1.5 px-3"
            >
              {assign.isPending ? t('skydiving.voucher-assign.assigning') : t('skydiving.voucher-assign.assign')}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onClear}
          disabled={assign.isPending}
          className="btn-secondary text-sm py-1.5 px-3 flex items-center gap-1.5 sm:ml-auto"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          {t('skydiving.voucher-assign.clear')}
        </button>
      </div>

      {shortfall && selectedVoucher && (
        <output className="text-xs text-guard-warning flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {shortfall.unitBased
            ? t('skydiving.voucher-assign.over-units', {
                remaining: formatUnits(shortfall.remaining),
                needed: formatUnits(shortfall.needed),
                unit: selectedVoucher.unitLabel || t('skydiving.voucher-assign.units-fallback'),
              })
            : t('skydiving.voucher-assign.over-amount', {
                remaining: formatCurrency(shortfall.remaining),
                needed: formatCurrency(shortfall.needed),
              })}
        </output>
      )}
    </div>
  );
}
