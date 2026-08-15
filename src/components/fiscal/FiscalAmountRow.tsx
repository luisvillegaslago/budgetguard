'use client';

/**
 * BudgetGuard Fiscal Amount Row
 * The label + amount line shared by the fiscal cards (Modelo 130, IRPF provision).
 * `number` renders the AEAT casilla code; `alert` switches the highlight to the warning tone.
 */

import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface FiscalAmountRowProps {
  label: string;
  cents: number;
  /** AEAT casilla code, rendered as a [NN] prefix when present */
  number?: string;
  highlight?: boolean;
  /** Warning tone instead of the primary one — only meaningful with `highlight` */
  alert?: boolean;
  indent?: boolean;
  muted?: boolean;
}

export function FiscalAmountRow({
  label,
  cents,
  number,
  highlight = false,
  alert = false,
  indent = false,
  muted = false,
}: FiscalAmountRowProps) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-2 py-1.5',
        highlight && '-mx-3 px-3 rounded-lg',
        highlight && (alert ? 'bg-guard-warning/5' : 'bg-guard-primary/5'),
        indent && 'pl-6',
      )}
    >
      <div className="flex items-baseline gap-2 min-w-0">
        {number && <span className="text-xs text-guard-muted tabular-nums shrink-0">[{number}]</span>}
        <Tooltip content={label} side="bottom" triggerClassName="min-w-0 overflow-hidden">
          <span
            className={cn(
              'text-sm truncate block',
              highlight ? 'font-semibold text-foreground' : muted ? 'text-guard-muted' : 'text-foreground/80',
            )}
          >
            {label}
          </span>
        </Tooltip>
      </div>
      <span
        className={cn(
          'tabular-nums shrink-0',
          highlight
            ? cn('text-lg font-bold', alert ? 'text-guard-warning' : 'text-guard-primary')
            : muted
              ? 'text-sm text-guard-muted'
              : 'text-sm font-medium',
        )}
      >
        {formatCurrency(cents, false)}
        <span className="ml-1">€</span>
      </span>
    </div>
  );
}
