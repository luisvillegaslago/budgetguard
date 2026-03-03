/**
 * BudgetGuard Loading Spinner
 */

import { cn } from '@/utils/helpers';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

export function LoadingSpinner({ size = 'md', className, label }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-[3px]',
    lg: 'h-12 w-12 border-4',
  };

  return (
    <output
      className={cn(
        'animate-spin rounded-full border-guard-primary/30 border-t-guard-primary block',
        sizeClasses[size],
        className,
      )}
      aria-label={label}
    >
      <span className="sr-only">{label}</span>
    </output>
  );
}

export function LoadingCard() {
  return (
    <div className="card flex items-center justify-center py-12">
      <LoadingSpinner size="lg" />
    </div>
  );
}
