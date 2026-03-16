'use client';

/**
 * Tooltip component built on @radix-ui/react-tooltip
 * Instant display (no delay), consistent styling across the app.
 * Replaces native `title` attributes for immediate, accessible tooltips.
 */

import * as RadixTooltip from '@radix-ui/react-tooltip';
import { type ReactNode, useCallback, useRef, useState } from 'react';
import { cn } from '@/utils/helpers';

interface TooltipProps {
  content: string;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  className?: string;
}

const TAP_DISMISS_MS = 1500;

export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  sideOffset = 6,
  className,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Open on tap (mobile) and auto-dismiss after delay
  const handleTap = useCallback((e: React.PointerEvent) => {
    // Only handle touch events — let hover work naturally on desktop
    if (e.pointerType !== 'touch') return;
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(timerRef.current);
    setOpen(true);
    timerRef.current = setTimeout(() => setOpen(false), TAP_DISMISS_MS);
  }, []);

  if (!content) return <>{children}</>;

  return (
    <RadixTooltip.Root delayDuration={0} open={open} onOpenChange={setOpen}>
      <RadixTooltip.Trigger asChild>
        {/* Wrapper intercepts touch taps to open tooltip */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: tooltip tap handler for mobile */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: tooltip trigger, not interactive control */}
        <span
          className="inline-flex"
          onPointerDown={handleTap}
          onClick={handleTap as unknown as React.MouseEventHandler}
        >
          {children}
        </span>
      </RadixTooltip.Trigger>
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
