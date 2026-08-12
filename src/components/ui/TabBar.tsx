'use client';

/**
 * Shared tab bar
 *
 * Horizontally scrollable so trailing tabs stay reachable on narrow viewports
 * (the previous per-page markup let them overflow off-screen with no way to
 * reach them), and keeps the active tab scrolled into view.
 *
 * Exposes one of two ARIA semantics. Pass `idPrefix` and render matching
 * `role="tabpanel"` regions to get the full Tabs pattern (roving tabindex,
 * arrow/Home/End navigation). Without it the bar is a group of toggle buttons,
 * which is the honest shape for a filter bar that controls no single panel.
 */

import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { type ButtonHTMLAttributes, type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { TAB_BAR_VARIANT, type TabBarVariant } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import { cn } from '@/utils/helpers';

export interface TabBarItem<TId extends string> {
  id: TId;
  label: string;
  icon?: LucideIcon;
}

type ButtonSemantics = Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'role' | 'id' | 'aria-selected' | 'aria-controls' | 'aria-pressed' | 'tabIndex' | 'onKeyDown'
>;

interface TabBarProps<TId extends string> {
  tabs: TabBarItem<TId>[];
  activeTab: TId;
  onChange: (id: TId) => void;
  /** Accessible name for the tab list */
  ariaLabel: string;
  variant?: TabBarVariant;
  /** Wires `id`/`aria-controls` as `{idPrefix}-tab-{id}` / `{idPrefix}-panel-{id}` */
  idPrefix?: string;
  className?: string;
}

// The scroll container never carries the bottom rule itself: a negative margin
// inside an overflow container would leak a 1px vertical scroll. The underline
// variant paints the rule as a sibling underneath instead, so the active tab's
// 2px border covers it exactly as before.
// Width of the edge fade / chevron overlay, in px. Doubles as the peek margin so a
// tab scrolled into view never lands underneath it.
const EDGE_PEEK = 48;

const LIST_CLASSES: Record<TabBarVariant, string> = {
  [TAB_BAR_VARIANT.UNDERLINE]: 'relative flex gap-1 overflow-x-auto scrollbar-none',
  [TAB_BAR_VARIANT.PILLS]: 'flex gap-1 rounded-lg bg-muted p-1 overflow-x-auto scrollbar-none',
  [TAB_BAR_VARIANT.PILLS_PRIMARY]: 'flex gap-1 rounded-lg bg-muted/50 p-1 overflow-x-auto scrollbar-none',
};

const TAB_CLASSES: Record<TabBarVariant, string> = {
  [TAB_BAR_VARIANT.UNDERLINE]: 'px-4 py-2.5 border-b-2 transition-colors',
  [TAB_BAR_VARIANT.PILLS]: 'px-3 py-1.5 rounded-md transition-all duration-200 ease-out-quart',
  [TAB_BAR_VARIANT.PILLS_PRIMARY]: 'px-3 py-1.5 rounded-md transition-all duration-200',
};

const ACTIVE_TAB_CLASSES: Record<TabBarVariant, string> = {
  [TAB_BAR_VARIANT.UNDERLINE]: 'border-guard-primary text-guard-primary',
  [TAB_BAR_VARIANT.PILLS]: 'bg-background text-foreground shadow-sm',
  [TAB_BAR_VARIANT.PILLS_PRIMARY]: 'bg-guard-primary text-white shadow-sm',
};

const INACTIVE_TAB_CLASSES: Record<TabBarVariant, string> = {
  [TAB_BAR_VARIANT.UNDERLINE]: 'border-transparent text-guard-muted hover:text-foreground',
  [TAB_BAR_VARIANT.PILLS]: 'text-guard-muted hover:text-foreground',
  [TAB_BAR_VARIANT.PILLS_PRIMARY]: 'text-guard-muted hover:text-foreground hover:bg-muted',
};

export function TabBar<TId extends string>({
  tabs,
  activeTab,
  onChange,
  ariaLabel,
  variant = TAB_BAR_VARIANT.UNDERLINE,
  idPrefix,
  className,
}: TabBarProps<TId>) {
  const { t } = useTranslate();
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [overflow, setOverflow] = useState({ start: false, end: false });
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);

  // Tab semantics are only honest when the caller wired real panels. Without an
  // idPrefix the bar is a group of toggle buttons: no roving tabindex, no
  // "tab N of M" announced for a tab that controls nothing.
  const isTabList = idPrefix !== undefined;
  const listSemantics = isTabList
    ? { role: 'tablist' as const, 'aria-label': ariaLabel }
    : { role: 'group' as const, 'aria-label': ariaLabel };

  // activeTab may match no tab (a URL pointing at a filtered-out section), which
  // would leave every button at tabIndex -1 and strand keyboard users.
  const focusIndex = activeIndex === -1 ? 0 : activeIndex;

  // Deep links (e.g. /settings?tab=crypto) can land on a tab that starts out
  // scrolled off-screen. Scroll the strip itself rather than calling
  // scrollIntoView, which would also scroll every ancestor including the page.
  // Move the minimum distance that reveals the tab, keeping EDGE_PEEK clear so it
  // does not end up underneath the edge fade and its chevron.
  useEffect(() => {
    const list = listRef.current;
    const button = tabRefs.current[activeIndex];
    if (!list || !button) return;

    const start = button.offsetLeft - EDGE_PEEK;
    const end = button.offsetLeft + button.offsetWidth + EDGE_PEEK - list.clientWidth;
    const target = list.scrollLeft < end ? end : list.scrollLeft > start ? start : list.scrollLeft;
    if (target === list.scrollLeft) return;

    list.scrollLeft = Math.max(0, Math.min(target, list.scrollWidth - list.clientWidth));
  }, [activeIndex]);

  // The strip scrolls, but its scrollbar is hidden — without an edge fade there is
  // nothing telling the user more tabs exist, which reads as "the tabs are cut off".
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () => {
      const maxScroll = list.scrollWidth - list.clientWidth;
      const start = list.scrollLeft > 1;
      const end = list.scrollLeft < maxScroll - 1;
      // Keep the previous object when nothing changed: a swipe fires this ~60
      // times a second, and every new object would re-render the whole strip.
      setOverflow((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    update();
    list.addEventListener('scroll', update, { passive: true });

    // Watch the strip for container resizes and every tab for content-driven ones.
    // The strip's border box is fixed by its parent, so widening the labels — the
    // web font swapping in, or switching locale — never notifies an observer that
    // only watches the container, leaving the indicators stale exactly when the
    // tabs start overflowing.
    const observer = new ResizeObserver(update);
    observer.observe(list);
    tabRefs.current.slice(0, tabs.length).forEach((tab) => {
      if (tab) observer.observe(tab);
    });

    return () => {
      list.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [tabs.length]);

  const scrollByStep = (direction: number) => {
    const list = listRef.current;
    if (!list) return;
    list.scrollBy({ left: direction * list.clientWidth * 0.8, behavior: 'smooth' });
  };

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      const lastIndex = tabs.length - 1;
      let nextIndex: number | null = null;
      if (event.key === 'ArrowRight') nextIndex = index === lastIndex ? 0 : index + 1;
      else if (event.key === 'ArrowLeft') nextIndex = index === 0 ? lastIndex : index - 1;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = lastIndex;

      if (nextIndex === null) return;
      event.preventDefault();
      const nextTab = tabs[nextIndex];
      if (!nextTab) return;
      onChange(nextTab.id);
      tabRefs.current[nextIndex]?.focus();
    },
    [tabs, onChange],
  );

  // Bundled per branch so each button carries a complete, valid ARIA set rather
  // than a mix of attributes from both patterns.
  const semanticsFor = (tab: TabBarItem<TId>, index: number, isActive: boolean): ButtonSemantics =>
    isTabList
      ? {
          role: 'tab',
          id: `${idPrefix}-tab-${tab.id}`,
          'aria-selected': isActive,
          'aria-controls': `${idPrefix}-panel-${tab.id}`,
          tabIndex: index === focusIndex ? 0 : -1,
          onKeyDown: (event) => handleKeyDown(event, index),
        }
      : { 'aria-pressed': isActive };

  const list = (
    <div {...listSemantics} ref={listRef} className={LIST_CLASSES[variant]}>
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTab;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            {...semanticsFor(tab, index, isActive)}
            onClick={() => onChange(tab.id)}
            className={cn(
              'shrink-0 whitespace-nowrap flex items-center gap-2 text-sm font-medium',
              TAB_CLASSES[variant],
              isActive ? ACTIVE_TAB_CLASSES[variant] : INACTIVE_TAB_CLASSES[variant],
            )}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
            {tab.label}
          </button>
        );
      })}
    </div>
  );

  const isUnderline = variant === TAB_BAR_VARIANT.UNDERLINE;

  // Rendered after the list so they paint over the scrolling tabs. The pill
  // variants sit on their own rounded surface, so the fade matches that instead
  // of the page background.
  const fadeFrom = isUnderline ? 'from-background' : 'from-muted';

  // Fade tells touch users there is more; the chevron gives pointer users a way to
  // get there, since a mouse has no horizontal pan gesture. Keyboard users already
  // reach every tab with Tab, which scrolls focus into view on its own.
  const edge = (isStart: boolean) => (
    <>
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 w-12 to-transparent',
          isStart ? 'left-0 rounded-l-lg bg-gradient-to-r' : 'right-0 rounded-r-lg bg-gradient-to-l',
          fadeFrom,
        )}
      />
      <button
        type="button"
        onClick={() => scrollByStep(isStart ? -1 : 1)}
        aria-label={isStart ? t('common.buttons.scroll-left') : t('common.buttons.scroll-right')}
        className={cn(
          'pointer-only absolute top-1/2 -translate-y-1/2 h-7 w-7 items-center justify-center rounded-full',
          'border border-border bg-card text-guard-muted shadow-sm transition-colors hover:text-foreground',
          isStart ? 'left-0' : 'right-0',
        )}
      >
        {isStart ? (
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </>
  );

  return (
    <div className={cn('relative min-w-0', className)}>
      {isUnderline && <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px bg-border" />}
      {list}
      {overflow.start && edge(true)}
      {overflow.end && edge(false)}
    </div>
  );
}
