'use client';

/**
 * BudgetGuard VAT Deduction Share Field
 *
 * The IVA deduction share of an expense, which is a different figure from the IRPF one on the very
 * same receipt: art. 30.2.5.ª b LIRPF lets the supplies of a partially affected home deduct 30% of
 * the affected proportion, while art. 95 LIVA — AEAT's position in V2554-23 and TEAC 6654/2022 —
 * allows none of that input VAT.
 *
 * Left empty the field inherits the IRPF share (VAT_DEDUCTION_INHERITS_IRPF), which is what the app
 * did before the column existed, so the placeholder says so instead of the input being prefilled
 * with a copy of the IRPF number: a copy would freeze a value that has to keep tracking it.
 */

import { Info } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/utils/helpers';

interface VatDeductionShareFieldProps {
  id: string;
  label: string;
  /** Shown while the field is empty — the state that means "the same share as IRPF". */
  placeholder: string;
  /** One line under the field: what leaving it blank does, and the case that motivates filling it. */
  hint: string;
  /** The full IRPF-vs-IVA rationale, kept off the form and one hover/tap away. */
  splitHint: string;
  registration: UseFormRegisterReturn;
  /** `sm` matches the compact fiscal block of TransactionForm; `base` the category modal's fields. */
  size?: 'sm' | 'base';
  /** Runs before the form's own handler on every edit — used for dirty tracking. */
  onValueChange?: () => void;
}

export function VatDeductionShareField({
  id,
  label,
  placeholder,
  hint,
  splitHint,
  registration,
  size = 'sm',
  onValueChange,
}: VatDeductionShareFieldProps) {
  const isSmall = size === 'sm';

  return (
    <div>
      <div className={cn('flex items-center gap-1.5', isSmall ? 'mb-1' : 'mb-1.5')}>
        <label htmlFor={id} className={cn('font-medium text-foreground', isSmall ? 'text-xs' : 'text-sm')}>
          {label}
        </label>
        <Tooltip content={splitHint} className="max-w-xs font-normal leading-relaxed" side="top">
          <button
            type="button"
            aria-label={splitHint}
            className="text-guard-muted hover:text-foreground transition-colors duration-200 ease-out-quart"
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
      <input
        id={id}
        type="number"
        step="0.01"
        min="0"
        max="100"
        placeholder={placeholder}
        {...registration}
        onChange={(e) => {
          onValueChange?.();
          return registration.onChange(e);
        }}
        onWheel={(e) => e.currentTarget.blur()}
        className={cn('w-full', isSmall ? 'input-sm' : 'input-base')}
      />
      <p className="mt-1 text-xs text-guard-muted">{hint}</p>
    </div>
  );
}
