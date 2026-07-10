'use client';

/**
 * Route Progress Bar
 * Slim top-of-viewport progress bar for in-app App Router navigations.
 */

import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

const TICK_INTERVAL_MS = 400;
const COMPLETE_FADE_MS = 280;
const INITIAL_PROGRESS = 8;
// Floor for how long the bar must remain visible before completing.
// Without this, a sub-100ms RSC navigation flashes the bar so briefly the
// user reads it as flicker rather than feedback. 450ms is the lower bound
// for "I saw something happen and it finished" in UX research.
const MIN_VISIBLE_MS = 450;
// Watchdog: force-completes the bar when a click starts it but no navigation
// ever commits. The start signal (a captured click) is necessarily finer than
// the stop signal (a location change), so the set of clicks that start the bar
// without ever completing it is open-ended — an internal `<a>` whose nested
// onClick calls preventDefault() to open a modal is the obvious example. Rather
// than enumerate those, we let any stuck bar self-heal. A bar frozen near 90%
// reads to the user as "the app hung", which is worse than showing no bar.
const STUCK_NAVIGATION_TIMEOUT_MS = 8000;

/**
 * Asymptotic curve used while a navigation is in flight. Pushes progress
 * toward 90 in increasingly small steps so the bar always feels "almost
 * done" but never stalls at the same value. Each tick adds 8% of the
 * remaining gap with a minimum step of 0.6 so it never freezes; progress
 * only reaches 100 via finalize().
 */
function nextTickProgress(current: number): number {
  if (current >= 90) return 90;
  const delta = (90 - current) * 0.08;
  return Math.min(90, current + Math.max(0.6, delta));
}

/**
 * Detects whether a clicked link triggers an in-app SPA navigation that
 * the App Router will actually run (so the bar should animate). Filters
 * out external links, new-tab clicks, modifier-key clicks, downloads, and
 * same-URL clicks that resolve as a no-op.
 */
export function isInternalLinkClick(event: MouseEvent): boolean {
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  const anchor = target.closest('a');
  if (!anchor) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.hasAttribute('download')) return false;
  const href = anchor.getAttribute('href');
  if (!href) return false;
  if (href.startsWith('#')) return false;
  if (/^(mailto|tel|sms|javascript):/i.test(href)) return false;
  // External hosts: the browser owns the navigation, App Router doesn't run.
  if (anchor.origin && anchor.origin !== window.location.origin) return false;
  // Same path AND search -> click is a no-op, would leave the bar stuck.
  const samePath = anchor.pathname === window.location.pathname;
  const sameSearch = anchor.search === window.location.search;
  if (samePath && sameSearch) return false;
  return true;
}

/**
 * Canonical `path?query` key for a location. Both the start and the completion
 * side must build this key the same way: `window.location.search` encodes a
 * space as `%20` while `URLSearchParams.toString()` emits `+`, so reading the
 * raw search string at one end and `useSearchParams()` at the other yields two
 * different keys for the same URL. Routing both through `URLSearchParams`
 * normalizes the encoding.
 */
export function locationKey(pathname: string, search: string): string {
  const normalized = new URLSearchParams(search).toString();
  return normalized ? `${pathname}?${normalized}` : pathname;
}

/**
 * Slim top-of-viewport progress bar for in-app route changes. Animates as
 * soon as the user clicks any internal `<a>` (including `<Link>`) and
 * completes when the pathname settles on the new route. Renders nothing
 * during idle so the layout cost is zero between navigations.
 *
 * Click-driven rather than router-event-driven because the App Router does
 * not expose start-of-navigation events; the click handler is the earliest
 * signal we can latch onto before the RSC round-trip starts.
 */
export function RouteProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(false);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minVisibleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtPathRef = useRef<string | null>(null);
  const startedAtTimeRef = useRef<number>(0);

  const stopTicks = useCallback(() => {
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }, []);

  const finalize = useCallback(() => {
    stopTicks();
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    // Clearing the in-flight marker makes `finalize` idempotent per navigation:
    // the completion effect skips while it is null, so a bar closed by the
    // watchdog cannot be closed a second time by a route that commits late.
    // Without this, the late commit schedules a second fade timer and orphans
    // the first, which then hides a bar the user has since restarted.
    startedAtPathRef.current = null;
    setProgress(100);
    fadeTimerRef.current = setTimeout(() => {
      setActive(false);
      setProgress(0);
    }, COMPLETE_FADE_MS);
  }, [stopTicks]);

  const start = useCallback(() => {
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    if (minVisibleTimerRef.current) {
      clearTimeout(minVisibleTimerRef.current);
      minVisibleTimerRef.current = null;
    }
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
    }
    startedAtPathRef.current = locationKey(window.location.pathname, window.location.search);
    startedAtTimeRef.current = Date.now();
    setActive(true);
    setProgress(INITIAL_PROGRESS);
    stopTicks();
    tickTimerRef.current = setInterval(() => {
      setProgress((prev) => nextTickProgress(prev));
    }, TICK_INTERVAL_MS);
    watchdogTimerRef.current = setTimeout(finalize, STUCK_NAVIGATION_TIMEOUT_MS);
  }, [stopTicks, finalize]);

  // Honour `MIN_VISIBLE_MS` so very fast navigations still register as a
  // perceptible "started -> finished" sweep rather than a flicker.
  const complete = useCallback(() => {
    const elapsed = Date.now() - startedAtTimeRef.current;
    const remaining = MIN_VISIBLE_MS - elapsed;
    if (remaining <= 0) {
      finalize();
      return;
    }
    if (minVisibleTimerRef.current) {
      clearTimeout(minVisibleTimerRef.current);
    }
    minVisibleTimerRef.current = setTimeout(finalize, remaining);
  }, [finalize]);

  // Listen for link clicks that will trigger an SPA navigation. Capture
  // phase so we register the click before any nested handler can call
  // `preventDefault`.
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!isInternalLinkClick(event)) return;
      start();
    }
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [start]);

  // Complete the bar when the full location actually changes. Comparing the
  // whole path+search (not just the pathname) is what lets a query-only
  // navigation — e.g. `/movements` -> `/movements?category=N` — complete;
  // `usePathname()` alone never changes there, so the bar would stick at 90%.
  // The startedAt guard ignores the initial mount tick (where the location is
  // the current page and no navigation is in flight) and the window between
  // `finalize` and the fade-out.
  useEffect(() => {
    if (!active) return;
    const startedAt = startedAtPathRef.current;
    if (startedAt === null) return;
    if (startedAt === locationKey(pathname, searchParams.toString())) return;
    complete();
  }, [pathname, searchParams, active, complete]);

  // Tear down timers if the component unmounts mid-navigation.
  useEffect(() => {
    return () => {
      stopTicks();
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      if (minVisibleTimerRef.current) clearTimeout(minVisibleTimerRef.current);
      if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
    };
  }, [stopTicks]);

  if (!active && progress === 0) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5">
      <div
        className="h-full bg-guard-primary transition-[width,opacity] ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress >= 100 ? 0 : 1,
          transitionDuration: progress >= 100 ? `${COMPLETE_FADE_MS}ms` : `${TICK_INTERVAL_MS}ms`,
          boxShadow: '0 0 8px hsl(var(--primary) / 0.6)',
        }}
      />
    </div>
  );
}
