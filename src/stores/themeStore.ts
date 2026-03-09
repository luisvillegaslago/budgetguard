import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Theme Store - Zustand 5.x with Selectors
 *
 * Manages light/dark theme preference with localStorage persistence.
 * Applies the 'dark' class to <html> element for Tailwind dark mode.
 *
 * Design principles:
 * - Pure store: No side effects in store, components handle DOM updates
 * - Hydration-safe: Returns 'dark' (default) until hydrated
 * - Immediate DOM sync: Prevents FOUC by applying class on change
 */

export type Theme = 'light' | 'dark';

const DEFAULT_THEME: Theme = 'dark';

interface ThemeState {
  theme: Theme;
  _hasHydrated: boolean;
  setTheme: (theme: Theme) => void;
  setHasHydrated: (state: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: DEFAULT_THEME,
      _hasHydrated: false,
      setTheme: (newTheme: Theme) => {
        set({ theme: newTheme });
      },
      setHasHydrated: (state: boolean) => {
        set({ _hasHydrated: state });
      },
    }),
    {
      name: 'budgetguard-theme-storage',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

/**
 * Hydration-safe theme selector
 * Returns DEFAULT_THEME during SSR and initial render,
 * then syncs with persisted value after hydration
 */
export function useTheme(): Theme {
  const storeTheme = useThemeStore((state) => state.theme);
  const hasHydrated = useThemeStore((state) => state._hasHydrated);
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    if (hasHydrated) {
      setTheme(storeTheme);
    }
  }, [hasHydrated, storeTheme]);

  return theme;
}

export const useSetTheme = () => useThemeStore((state) => state.setTheme);

/**
 * Hook that syncs theme class on <html> element
 * Must be used in a component that renders on every page (e.g., layout)
 */
export function useThemeSync() {
  const storeTheme = useThemeStore((state) => state.theme);
  const hasHydrated = useThemeStore((state) => state._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;

    const root = document.documentElement;
    if (storeTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [hasHydrated, storeTheme]);
}
