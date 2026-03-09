'use client';

/**
 * Tooltip that only appears when its child text is truncated (overflowing).
 * Checks scrollWidth vs clientWidth on the first child element on hover.
 * For always-visible tooltips (icons, badges), use <Tooltip> instead.
 */

import * as RadixTooltip from '@radix-ui/react-tooltip';
import { type ReactNode, useCallback, useRef, useState } from 'react';
import { cn } from '@/utils/helpers';

interface OverflowTooltipProps {
  content: string;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  className?: string;
}

export function OverflowTooltip({
  content,
  children,
  side = 'bottom',
  align = 'start',
  sideOffset = 6,
  className,
}: OverflowTooltipProps) {
  const [isOverflowing, setIsOverflowing] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  const checkOverflow = useCallback(() => {
    const wrapper = triggerRef.current;
    if (!wrapper) return;
    // Measure the first child (the actual truncated element) or the wrapper itself
    const el = (wrapper.firstElementChild as HTMLElement) ?? wrapper;
    setIsOverflowing(el.scrollWidth > el.clientWidth);
  }, []);

  if (!content) return <>{children}</>;

  return (
    <RadixTooltip.Root delayDuration={0} open={isOverflowing ? undefined : false}>
      <RadixTooltip.Trigger asChild onMouseEnter={checkOverflow} onFocus={checkOverflow}>
        <div ref={triggerRef} className="min-w-0">
          {children}
        </div>
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
