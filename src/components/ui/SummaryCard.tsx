'use client';

/**
 * Reusable summary card with color accent, optional click-to-filter, and active glow effect.
 * Used by BalanceCards (dashboard) and DocumentsPage (fiscal documents).
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/helpers';

export interface SummaryCardColorScheme {
  border: string;
  iconBg: string;
  value: string;
  activeGlow: string;
}

interface SummaryCardProps {
  title: string;
  value: string;
  icon: ReactNode;
  colors: SummaryCardColorScheme;
  isActive?: boolean;
  onClick?: () => void;
  staggerClass?: string;
  className?: string;
}

export function SummaryCard({
  title,
  value,
  icon,
  colors,
  isActive,
  onClick,
  staggerClass,
  className,
}: SummaryCardProps) {
  const content = (
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-guard-muted">{title}</p>
        <p className={cn('text-2xl font-bold mt-1', colors.value)}>{value}</p>
      </div>
      <div className={cn('p-2.5 rounded-xl', colors.iconBg)}>{icon}</div>
    </div>
  );

  const baseClass = cn('balance-card border-l-4 animate-slide-up', colors.border, staggerClass, className);

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={isActive}
        className={cn(
          baseClass,
          'text-left w-full cursor-pointer transition-all duration-200 ease-out-quart',
          isActive && colors.activeGlow,
        )}
      >
        {content}
      </button>
    );
  }

  return <div className={baseClass}>{content}</div>;
}

export function SummaryCardSkeleton() {
  return (
    <div className="balance-card animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-[20px] w-24 bg-muted rounded" />
          <div className="h-[32px] w-16 bg-muted rounded" />
        </div>
        <div className="h-10 w-10 bg-muted rounded-xl" />
      </div>
    </div>
  );
}

/**
 * Pre-built color schemes for common use cases.
 */
const GLOW = 'shadow-[0_0_20px_-4px] scale-[1.02]';

export const SUMMARY_COLORS = {
  success: {
    border: 'border-l-guard-success',
    iconBg: 'bg-guard-success/10 text-guard-success',
    value: 'text-guard-success',
    activeGlow: `${GLOW} shadow-guard-success/40 border-guard-success/50`,
  },
  danger: {
    border: 'border-l-guard-danger',
    iconBg: 'bg-guard-danger/10 text-guard-danger',
    value: 'text-guard-danger',
    activeGlow: `${GLOW} shadow-guard-danger/40 border-guard-danger/50`,
  },
  primary: {
    border: 'border-l-guard-primary',
    iconBg: 'bg-guard-primary/10 text-guard-primary',
    value: 'text-guard-primary',
    activeGlow: `${GLOW} shadow-guard-primary/40 border-guard-primary/50`,
  },
  violet: {
    border: 'border-l-guard-accent',
    iconBg: 'bg-guard-accent/10 text-guard-accent',
    value: 'text-guard-accent',
    activeGlow: `${GLOW} shadow-guard-accent/40 border-guard-accent/50`,
  },
  amber: {
    border: 'border-l-guard-warning',
    iconBg: 'bg-guard-warning/10 text-guard-warning',
    value: 'text-guard-warning',
    activeGlow: `${GLOW} shadow-guard-warning/40 border-guard-warning/50`,
  },
} as const satisfies Record<string, SummaryCardColorScheme>;
