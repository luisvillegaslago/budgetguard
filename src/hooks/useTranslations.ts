'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  DEFAULT_LOCALE,
  getNestedValue,
  interpolateMessage,
  isValidLocale,
  type Locale,
  SUPPORTED_LOCALES,
} from '@/libs/i18n';
import enMessages from '@/messages/en.json';
import esMessages from '@/messages/es.json';

type Dictionary = Record<string, unknown>;

interface TranslationContextType {
  t: (key: string, values?: Record<string, string | number | boolean>) => string;
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const TranslationContext = createContext<TranslationContextType | null>(null);

/**
 * Pre-loaded dictionaries for instant access (no loading state)
 */
const dictionaries: Record<Locale, Dictionary> = {
  en: enMessages as Dictionary,
  es: esMessages as Dictionary,
};

/**
 * Translation hook for Client Components
 *
 * Usage:
 * ```tsx
 * const { t, locale, setLocale } = useTranslate();
 * return <h1>{t('pages.home.title')}</h1>;
 * ```
 */
export function useTranslate() {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslate must be used within a TranslationProvider');
  }
  return context;
}

/**
 * Internal hook for creating translation context
 */
export function useTranslationContext(initialLocale?: string) {
  const validInitialLocale = initialLocale && isValidLocale(initialLocale) ? initialLocale : DEFAULT_LOCALE;

  const [locale, setLocaleState] = useState<Locale>(validInitialLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    if (isValidLocale(newLocale)) {
      setLocaleState(newLocale);
    }
  }, []);

  const t = useCallback(
    (key: string, values?: Record<string, string | number | boolean>) => {
      const dictionary = dictionaries[locale];
      const message = getNestedValue(dictionary, key);
      return interpolateMessage(message, values);
    },
    [locale],
  );

  return useMemo(
    () => ({
      t,
      locale,
      setLocale,
    }),
    [t, locale, setLocale],
  );
}

export { TranslationContext, SUPPORTED_LOCALES };
