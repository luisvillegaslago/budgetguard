'use client';

/**
 * Row/page selection checkbox for tables. Supports the indeterminate state,
 * which has no HTML attribute and must be set on the DOM node.
 */

import { useEffect, useRef } from 'react';
import { cn } from '@/utils/helpers';

interface SelectionCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
  className?: string;
}

export function SelectionCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  className,
}: SelectionCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className={cn('h-4 w-4 rounded border-input accent-guard-primary cursor-pointer', className)}
    />
  );
}
