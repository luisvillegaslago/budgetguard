'use client';

/**
 * BudgetGuard Icon Picker
 * Grid of available category icons from CATEGORY_ICON_MAP
 */

import type { LucideIcon } from 'lucide-react';
import { CATEGORY_ICON_MAP } from '@/components/ui/CategoryIcon';
import { useTranslate } from '@/hooks/useTranslations';
import { cn } from '@/utils/helpers';

interface IconPickerProps {
  value: string | null;
  onChange: (icon: string) => void;
}

const iconKeys = Object.keys(CATEGORY_ICON_MAP);

export function IconPicker({ value, onChange }: IconPickerProps) {
  const { t } = useTranslate();

  return (
    <div>
      <span className="block text-sm font-medium text-foreground mb-1.5">
        {t('category-management.form.fields.icon')}
      </span>
      <fieldset
        className="grid grid-cols-5 gap-2 border-0 p-0 m-0"
        aria-label={t('category-management.form.fields.icon')}
      >
        {iconKeys.map((key) => {
          const IconComponent = CATEGORY_ICON_MAP[key] as LucideIcon;
          if (!IconComponent) return null;
          const isSelected = value === key;

          return (
            <button
              key={key}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(key)}
              className={cn(
                'p-2.5 rounded-lg border flex items-center justify-center',
                'transition-all duration-200 ease-out-quart',
                'hover:bg-muted/50 active:scale-95',
                isSelected
                  ? 'border-guard-primary ring-2 ring-guard-primary/30 bg-guard-primary/10'
                  : 'border-input bg-background',
              )}
            >
              <IconComponent className="h-5 w-5 text-foreground" aria-hidden="true" />
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
