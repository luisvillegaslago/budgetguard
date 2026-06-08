'use client';

/**
 * AnimatedHeight
 * Smoothly animates its height as the inner content resizes, and fades the content
 * in whenever `trigger` changes. Keeps dashboard widgets from "jumping" when their
 * size changes (e.g. paging between months or switching the trend period).
 *
 * Overflow is only clipped WHILE the height transitions, so chart tooltips, shadows
 * and other overflowing content are never clipped at rest.
 */

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/utils/helpers';

// Avoids the SSR warning from useLayoutEffect while keeping pre-paint measurement on the client.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface AnimatedHeightProps {
  /** When this value changes, the content fades in and the height animates smoothly. */
  trigger: string | number;
  children: ReactNode;
  /** Classes for the outer height-animating container. */
  className?: string;
  /** Classes for the inner content wrapper (e.g. grid/spacing utilities). */
  contentClassName?: string;
}

export function AnimatedHeight({ trigger, children, className, contentClassName }: AnimatedHeightProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const prevHeightRef = useRef<number | null>(null);
  const [height, setHeight] = useState<number | 'auto'>('auto');
  const [isAnimating, setIsAnimating] = useState(false);

  // Re-runs on every `trigger` change because the inner node is keyed and remounts,
  // so the ResizeObserver always tracks the current content.
  useIsomorphicLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    const measure = () => {
      const next = el.offsetHeight;
      // Only clip (and animate) when transitioning between two known heights.
      if (prevHeightRef.current !== null && prevHeightRef.current !== next) {
        setIsAnimating(true);
      }
      prevHeightRef.current = next;
      setHeight(next);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [trigger]);

  return (
    <div
      className={cn(
        'transition-[height] duration-300 ease-out-quart',
        isAnimating ? 'overflow-hidden' : 'overflow-visible',
        className,
      )}
      style={{ height }}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && e.propertyName === 'height') {
          setIsAnimating(false);
        }
      }}
    >
      <div key={trigger} ref={innerRef} className={cn('animate-fade-in', contentClassName)}>
        {children}
      </div>
    </div>
  );
}
