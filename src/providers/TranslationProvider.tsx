'use client';

import type React from 'react';
import { useEffect } from 'react';
import { TranslationContext, useTranslationContext } from '@/hooks/useTranslations';
import { useLocale } from '@/stores/localeStore';

interface TranslationProviderProps {
  children: React.ReactNode;
  locale?: string;
}

/**
 * Translation Provider Component
 *
 * Integrates the i18n translation system with the localeStore.
 * Uses hydration-safe useLocale hook to prevent SSR/client mismatch.
 *
 * For Server Components: Use getDictionary() directly instead of this provider.
 * For Client Components: Wrap with this provider and use useTranslate() hook.
 */
export function TranslationProvider({ children, locale: initialLocale }: TranslationProviderProps) {
  // useLocale is hydration-safe - returns DEFAULT_LOCALE until store hydrates
  const storeLocale = useLocale();
  const effectiveLocale = storeLocale || initialLocale;

  const translationContext = useTranslationContext(effectiveLocale);

  // Sync translation context when store locale changes
  useEffect(() => {
    if (translationContext.locale !== storeLocale && storeLocale) {
      translationContext.setLocale(storeLocale);
    }
  }, [storeLocale, translationContext]);

  return <TranslationContext.Provider value={translationContext}>{children}</TranslationContext.Provider>;
}
