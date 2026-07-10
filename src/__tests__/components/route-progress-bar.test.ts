/**
 * Unit Tests: route progress bar navigation detection
 *
 * The bar latches on a click and releases on a location change. These two
 * signals are produced by different browser APIs, so the pure functions that
 * bridge them are what keep the bar from freezing at 90% forever. Both
 * regressions pinned here shipped in the original implementation.
 */

import { isInternalLinkClick, locationKey } from '@/components/ui/RouteProgressBar';

const CURRENT_LOCATION = '/movements';

/** Dispatches a real click on an anchor and returns what the filter decided. */
function clickDecision(attributes: Record<string, string>, init: MouseEventInit = {}): boolean {
  const anchor = document.createElement('a');
  Object.entries(attributes).forEach(([name, value]) => {
    anchor.setAttribute(name, value);
  });
  document.body.appendChild(anchor);

  let decision = false;
  anchor.addEventListener('click', (event: MouseEvent) => {
    // jsdom would otherwise warn about unimplemented navigation.
    event.preventDefault();
    decision = isInternalLinkClick(event);
  });
  anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, ...init }));

  anchor.remove();
  return decision;
}

beforeEach(() => {
  window.history.replaceState({}, '', CURRENT_LOCATION);
});

describe('isInternalLinkClick', () => {
  it('accepts a plain left-click on an in-app link', () => {
    expect(clickDecision({ href: '/invoices' })).toBe(true);
  });

  it('accepts a click that keeps the pathname and only changes the query', () => {
    // The /movements page renders category links back into /movements?category=N.
    expect(clickDecision({ href: '/movements?category=7' })).toBe(true);
  });

  it('rejects a click on the current url, which would navigate nowhere', () => {
    window.history.replaceState({}, '', '/movements?category=7');

    expect(clickDecision({ href: '/movements?category=7' })).toBe(false);
  });

  it('rejects links the browser owns instead of the app router', () => {
    expect(clickDecision({ href: 'https://example.com/report' })).toBe(false);
    expect(clickDecision({ href: 'mailto:someone@example.com' })).toBe(false);
    expect(clickDecision({ href: '#section' })).toBe(false);
    expect(clickDecision({ href: '/invoice.pdf', download: '' })).toBe(false);
    expect(clickDecision({ href: '/invoices', target: '_blank' })).toBe(false);
  });

  it('rejects clicks that open the link somewhere other than this tab', () => {
    expect(clickDecision({ href: '/invoices' }, { ctrlKey: true })).toBe(false);
    expect(clickDecision({ href: '/invoices' }, { metaKey: true })).toBe(false);
    expect(clickDecision({ href: '/invoices' }, { shiftKey: true })).toBe(false);
    expect(clickDecision({ href: '/invoices' }, { button: 1 })).toBe(false);
  });
});

describe('locationKey', () => {
  it('omits the separator when there is no query', () => {
    expect(locationKey('/movements', '')).toBe('/movements');
    expect(locationKey('/movements', '?')).toBe('/movements');
  });

  it('tolerates the leading question mark that window.location.search carries', () => {
    expect(locationKey('/movements', '?category=7')).toBe(locationKey('/movements', 'category=7'));
  });

  it('encodes a space identically whichever api produced the query', () => {
    // window.location.search yields %20; URLSearchParams.toString() yields +.
    // If these disagreed, the bar would complete on mount instead of tracking
    // the navigation.
    expect(locationKey('/movements', '?q=coffee%20shop')).toBe(locationKey('/movements', 'q=coffee+shop'));
  });

  it('distinguishes a query-only navigation from its origin', () => {
    // The completion check compares these two keys. usePathname() alone reports
    // '/movements' for both, so the bar would never complete.
    expect(locationKey('/movements', '')).not.toBe(locationKey('/movements', '?category=7'));
    expect(locationKey('/movements', '?category=7')).not.toBe(locationKey('/movements', '?category=8'));
  });
});
