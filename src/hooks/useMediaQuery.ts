import { useEffect, useState } from 'react';

/**
 * Hook that tracks whether a CSS media query matches.
 * Returns false during SSR to avoid hydration mismatches.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** Returns true when viewport is xl (≥1280px) or larger */
export function useIsLargeScreen(): boolean {
  return useMediaQuery('(min-width: 1280px)');
}
