'use client';

/**
 * Reusable search input with magnifier icon and clear button
 * Consistent styling across all searchable lists and tables
 */

import { Search, X } from 'lucide-react';
import { useTranslate } from '@/hooks/useTranslations';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder, className }: SearchInputProps) {
  const { t } = useTranslate();

  return (
    <div className={className}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-guard-muted" aria-hidden="true" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-9 pr-9 py-2 text-sm rounded-lg border border-input bg-background text-foreground placeholder:text-guard-muted focus:ring-2 focus:ring-guard-primary focus:border-transparent transition-colors"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-guard-muted hover:text-foreground transition-colors"
            aria-label={t('common.buttons.clear')}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
