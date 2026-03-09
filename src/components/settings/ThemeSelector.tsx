'use client';

/**
 * Theme Selector
 * Allows switching between light and dark mode with localStorage persistence
 */

import { Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslate } from '@/hooks/useTranslations';
import { type Theme, useSetTheme, useTheme } from '@/stores/themeStore';
import { cn } from '@/utils/helpers';

interface ThemeOption {
  value: Theme;
  icon: ReactNode;
  i18nKey: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'light', icon: <Sun className="h-4 w-4" />, i18nKey: 'settings.theme.light' },
  { value: 'dark', icon: <Moon className="h-4 w-4" />, i18nKey: 'settings.theme.dark' },
];

export function ThemeSelector() {
  const { t } = useTranslate();
  const currentTheme = useTheme();
  const setTheme = useSetTheme();

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        {currentTheme === 'dark' ? (
          <Moon className="h-5 w-5 text-guard-primary" aria-hidden="true" />
        ) : (
          <Sun className="h-5 w-5 text-guard-primary" aria-hidden="true" />
        )}
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t('settings.theme.title')}</h3>
          <p className="text-xs text-guard-muted">{t('settings.theme.description')}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
              currentTheme === option.value
                ? 'bg-guard-primary text-white shadow-sm'
                : 'bg-muted text-guard-muted hover:text-foreground',
            )}
          >
            {option.icon}
            {t(option.i18nKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
