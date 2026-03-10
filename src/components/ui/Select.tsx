/**
 * BudgetGuard Select
 * Styled native select with consistent appearance across browsers
 */

import { type ComponentPropsWithRef, forwardRef } from 'react';
import { cn } from '@/utils/helpers';

const CHEVRON_SVG =
  "url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2364748B%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')";

export const Select = forwardRef<HTMLSelectElement, ComponentPropsWithRef<'select'>>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'w-full appearance-none px-4 py-2.5 pr-9 rounded-lg border border-input bg-background text-foreground text-sm',
      'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      'transition-colors duration-200 ease-out-quart',
      'bg-[length:16px_16px] bg-[position:right_10px_center] bg-no-repeat',
      className,
    )}
    style={{ backgroundImage: CHEVRON_SVG, ...props.style }}
    {...props}
  />
));

Select.displayName = 'Select';
