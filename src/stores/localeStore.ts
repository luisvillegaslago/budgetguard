import Cookies from 'js-cookie';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_LOCALE, isValidLocale, type Locale } from '@/libs/i18n';

/**
 * Locale Store - Zustand 5.x with Selectors
 *
 * Simple locale store for client-side language switching.
 * Uses cookie synchronization to prevent FOUC (Flash of Unstyled Content).
 *
 * Design principles:
 * - Pure store: No side effects, components handle UI
 * - Zustand selectors: Prevent unnecessary re-renders
 * - Cookie sync: Server can read locale before hydration
 * - Hydration-safe: Returns default value until hydrated
 */

const LOCALE_COOKIE_NAME = 'locale';
const LOCALE_COOKIE_MAX_AGE = 365; // days

interface LocaleState {
  locale: Locale;
  _hasHydrated: boolean;
  setLocale: (locale: Locale) => void;
  setHasHydrated: (state: boolean) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: DEFAULT_LOCALE,
      _hasHydrated: false,
      setLocale: (newLocale: Locale) => {
        if (!isValidLocale(newLocale)) return;
        set({ locale: newLocale });
      },
      setHasHydrated: (state: boolean) => {
        set({ _hasHydrated: state });
      },
    }),
    {
      name: 'budgetguard-locale-storage',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

/**
 * Hydration-safe locale selector
 * Returns DEFAULT_LOCALE during SSR and initial render,
 * then syncs with persisted value after hydration
 */
export function useLocale(): Locale {
  const storeLocale = useLocaleStore((state) => state.locale);
  const hasHydrated = useLocaleStore((state) => state._hasHydrated);
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    if (hasHydrated) {
      setLocale(storeLocale);
    }
  }, [hasHydrated, storeLocale]);

  return locale;
}

/**
 * Raw locale selector (may cause hydration mismatch)
 * Use only when you need immediate access to persisted value
 */
export const useLocaleUnsafe = () => useLocaleStore((state) => state.locale);

export const useSetLocale = () => useLocaleStore((state) => state.setLocale);
export const useHasHydrated = () => useLocaleStore((state) => state._hasHydrated);

/**
 * Hook that syncs Zustand + Cookie for FOUC prevention
 * Use this when changing locale to ensure server-side consistency
 */
export function useSetLocaleWithCookie() {
  const setLocale = useSetLocale();

  return (locale: Locale) => {
    setLocale(locale);
    // Sync cookie for server-side consistency on refresh
    Cookies.set(LOCALE_COOKIE_NAME, locale, {
      expires: LOCALE_COOKIE_MAX_AGE,
      path: '/',
      sameSite: 'lax',
    });
  };
}

/**
 * Get locale from cookie (useful for server-side)
 */
export function getLocaleFromCookie(): Locale | undefined {
  const cookieLocale = Cookies.get(LOCALE_COOKIE_NAME);
  return cookieLocale && isValidLocale(cookieLocale) ? cookieLocale : undefined;
}
