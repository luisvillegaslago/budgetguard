'use client';

/**
 * Voucher ("bono") selector for skydiving forms. Lets a jump/tunnel session be
 * paid from a prepaid voucher. Unit vouchers prorate the amount automatically
 * (1 unit per jump, minutes for tunnel); the preview shows what will be deducted.
 */

import { Ticket } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Select } from '@/components/ui/Select';
import { useTranslate } from '@/hooks/useTranslations';
import type { Voucher } from '@/types/finance';
import { formatCurrency } from '@/utils/money';

interface SkydiveVoucherSelectProps {
  vouchers: Voucher[];
  value: number | null;
  onChange: (voucherId: number | null) => void;
  /** Units consumed: 1 per jump, session minutes for tunnel. Drives the preview. */
  units: number;
  disabled?: boolean;
}

export function SkydiveVoucherSelect({ vouchers, value, onChange, units, disabled }: SkydiveVoucherSelectProps) {
  const { t } = useTranslate();
  const toggleId = useId();
  const selectId = useId();
  const [enabled, setEnabled] = useState(value != null);

  const selectedVoucher = useMemo(() => vouchers.find((v) => v.voucherId === value) ?? null, [vouchers, value]);

  // Prorated amount preview for unit-based vouchers
  const unitPriceCents =
    selectedVoucher?.totalUnits != null && selectedVoucher.totalUnits > 0
      ? selectedVoucher.totalAmountCents / selectedVoucher.totalUnits
      : null;
  const autoAmountCents = unitPriceCents != null && units > 0 ? Math.round(unitPriceCents * units) : null;

  if (vouchers.length === 0) return null;

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    if (!checked) onChange(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center h-6">
          <input
            id={toggleId}
            type="checkbox"
            checked={enabled}
            disabled={disabled}
            onChange={(e) => handleToggle(e.target.checked)}
            className="h-4 w-4 rounded border-input text-guard-primary focus:ring-guard-primary"
          />
        </div>
        <label htmlFor={toggleId} className="text-sm font-medium text-foreground flex items-center gap-2">
          <Ticket className="h-4 w-4 text-guard-primary" aria-hidden="true" />
          {t('skydiving.voucher.question')}
        </label>
      </div>

      {enabled && (
        <div className="space-y-2 pl-7 animate-fade-in">
          <Select
            id={selectId}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
            disabled={disabled}
          >
            <option value="">{t('skydiving.voucher.select-placeholder')}</option>
            {vouchers.map((v) => (
              <option key={v.voucherId} value={v.voucherId}>
                {(v.description || v.categoryName || t('vouchers.untitled')) +
                  ` · ${formatCurrency(Math.max(0, v.remainingCents))}`}
              </option>
            ))}
          </Select>
          {autoAmountCents != null && (
            <p className="text-xs text-guard-muted animate-fade-in">
              {t('skydiving.voucher.amount-auto', { amount: formatCurrency(autoAmountCents) })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
