'use client';

/**
 * BudgetGuard Color Picker
 * Predefined color palette for category colors
 */

import { Check } from 'lucide-react';
import { useTranslate } from '@/hooks/useTranslations';
import { cn } from '@/utils/helpers';

interface ColorPickerProps {
  value: string | null;
  onChange: (color: string) => void;
}

const PRESET_COLORS = [
  '#EF4444', // Red
  '#F97316', // Orange
  '#F59E0B', // Amber
  '#EAB308', // Yellow
  '#84CC16', // Lime
  '#22C55E', // Green
  '#10B981', // Emerald
  '#14B8A6', // Teal
  '#06B6D4', // Cyan
  '#0EA5E9', // Sky
  '#3B82F6', // Blue
  '#6366F1', // Indigo
  '#8B5CF6', // Violet
  '#A855F7', // Purple
  '#D946EF', // Fuchsia
  '#EC4899', // Pink
];

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const { t } = useTranslate();

  return (
    <div>
      <span className="block text-sm font-medium text-foreground mb-1.5">
        {t('category-management.form.fields.color')}
      </span>
      <fieldset
        className="grid grid-cols-8 gap-2 border-0 p-0 m-0"
        aria-label={t('category-management.form.fields.color')}
      >
        {PRESET_COLORS.map((color) => {
          const isSelected = value === color;

          return (
            <button
              key={color}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(color)}
              className={cn(
                'h-8 w-8 rounded-full flex items-center justify-center',
                'transition-all duration-200 ease-out-quart',
                'hover:scale-110 active:scale-95',
                isSelected && 'ring-2 ring-offset-2 ring-offset-background',
              )}
              style={{
                backgroundColor: color,
                ...(isSelected ? { boxShadow: '0 0 0 2px var(--guard-primary)' } : {}),
              }}
              aria-label={color}
            >
              {isSelected && <Check className="h-4 w-4 text-white" aria-hidden="true" />}
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
