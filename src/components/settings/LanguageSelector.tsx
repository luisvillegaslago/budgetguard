'use client';

/**
 * Language Selector
 * Allows switching between English and Spanish with cookie persistence
 */

import { Globe } from 'lucide-react';
import { useTranslate } from '@/hooks/useTranslations';
import { type Locale, SUPPORTED_LOCALES } from '@/libs/i18n';
import { useLocale, useSetLocaleWithCookie } from '@/stores/localeStore';
import { cn } from '@/utils/helpers';

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
};

export function LanguageSelector() {
  const { t } = useTranslate();
  const currentLocale = useLocale();
  const setLocaleWithCookie = useSetLocaleWithCookie();

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <Globe className="h-5 w-5 text-guard-primary" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t('settings.language.title')}</h3>
          <p className="text-xs text-guard-muted">{t('settings.language.description')}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {SUPPORTED_LOCALES.map((locale) => (
          <button
            key={locale}
            type="button"
            onClick={() => setLocaleWithCookie(locale)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
              currentLocale === locale
                ? 'bg-guard-primary text-white shadow-sm'
                : 'bg-muted text-guard-muted hover:text-foreground',
            )}
          >
            {LOCALE_LABELS[locale]}
          </button>
        ))}
      </div>
    </div>
  );
}
