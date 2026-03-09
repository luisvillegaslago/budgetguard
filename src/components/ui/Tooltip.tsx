'use client';

/**
 * Tooltip component built on @radix-ui/react-tooltip
 * Instant display (no delay), consistent styling across the app.
 * Replaces native `title` attributes for immediate, accessible tooltips.
 */

import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
import { cn } from '@/utils/helpers';

interface TooltipProps {
  content: string;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  className?: string;
}

export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  sideOffset = 6,
  className,
}: TooltipProps) {
  if (!content) return <>{children}</>;

  return (
    <RadixTooltip.Root delayDuration={0}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          className={cn(
            'z-[100] rounded-md bg-guard-dark px-2.5 py-1.5 text-xs font-medium text-white shadow-md',
            'animate-fade-in select-none',
            'dark:bg-guard-light dark:text-guard-dark',
            className,
          )}
        >
          {content}
          <RadixTooltip.Arrow className="fill-guard-dark dark:fill-guard-light" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
