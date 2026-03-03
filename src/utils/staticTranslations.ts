/**
 * Static Translations Helper
 *
 * Used for error boundaries that render outside of React providers.
 * Imports translation files directly and detects locale from cookies/localStorage.
 */

import Cookies from 'js-cookie';
import en from '@/messages/en.json';
import es from '@/messages/es.json';

type Locale = 'en' | 'es';

const translations: Record<Locale, typeof en> = {
  en,
  es,
};

/**
 * Detects the user's preferred locale from browser APIs.
 * Falls back to 'es' (Spanish) as the default.
 */
export function detectLocale(): Locale {
  if (typeof window === 'undefined') {
    return 'es';
  }

  // Try to get from localStorage (where the app stores user preference)
  try {
    const stored = localStorage.getItem('budgetguard-locale');
    if (stored === 'en' || stored === 'es') {
      return stored;
    }
  } catch {
    // localStorage not available
  }

  // Try to get from cookie using js-cookie
  try {
    const cookieLocale = Cookies.get('NEXT_LOCALE');
    if (cookieLocale === 'en' || cookieLocale === 'es') {
      return cookieLocale;
    }
  } catch {
    // Cookies not available
  }

  // Try browser language
  try {
    const browserLang = navigator.language.split('-')[0];
    if (browserLang === 'en') {
      return 'en';
    }
  } catch {
    // Navigator not available
  }

  return 'es';
}

/**
 * Gets a translation value using dot notation path.
 * For use in components that don't have access to React context.
 */
export function getStaticTranslation(path: string, locale?: Locale): string {
  const currentLocale = locale || detectLocale();
  const messages = translations[currentLocale];

  const keys = path.split('.');
  const value = keys.reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, messages);

  return typeof value === 'string' ? value : path;
}

/**
 * Gets all error page translations for a given locale.
 * Useful for global-error.tsx which needs multiple translations.
 */
export function getErrorTranslations(locale?: Locale) {
  const currentLocale = locale || detectLocale();
  const messages = translations[currentLocale];

  return {
    appName: messages.common['app-name'],
    global: messages.errors.global,
  };
}
