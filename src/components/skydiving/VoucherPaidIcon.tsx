'use client';

/**
 * Marker for a jump or tunnel session already paid from a voucher ("bono").
 * The tooltip names the voucher, read from the cached vouchers list.
 */

import { Ticket } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { useTranslate } from '@/hooks/useTranslations';
import { useVouchers } from '@/hooks/useVouchers';
import { getVoucherName } from '@/utils/skydiveVoucher';

interface VoucherPaidIconProps {
  voucherId: number;
}

export function VoucherPaidIcon({ voucherId }: VoucherPaidIconProps) {
  const { t } = useTranslate();
  const { data: vouchers } = useVouchers();
  const voucher = vouchers?.find((v) => v.voucherId === voucherId);

  // Generic label until the vouchers list loads (or if the voucher is gone)
  const label = voucher
    ? t('skydiving.voucher-assign.paid-with-named-voucher', { name: getVoucherName(voucher, t('vouchers.untitled')) })
    : t('skydiving.voucher-assign.paid-with-voucher');

  return (
    <Tooltip content={label}>
      <Ticket className="h-3.5 w-3.5 text-guard-primary" role="img" aria-label={label} />
    </Tooltip>
  );
}
