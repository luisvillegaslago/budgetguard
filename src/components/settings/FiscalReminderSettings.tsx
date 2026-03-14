'use client';

/**
 * Fiscal deadline reminder settings panel for the settings page.
 * Follows the same card layout pattern as ThemeSelector and LanguageSelector.
 */

import { Bell } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useFiscalDeadlineSettings, useUpdateDeadlineSettings } from '@/hooks/useFiscalDeadlines';
import { useTranslate } from '@/hooks/useTranslations';
import { cn } from '@/utils/helpers';

interface ReminderFormData {
  reminderDaysBefore: number;
  postponementReminder: boolean;
  isActive: boolean;
}

const INPUT_CLASSES = cn(
  'px-4 py-2.5 rounded-lg border border-input bg-background text-foreground',
  'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
  'transition-colors duration-200 ease-out-quart',
);

export function FiscalReminderSettings() {
  const { t } = useTranslate();
  const { data: settings, isLoading } = useFiscalDeadlineSettings();
  const updateMutation = useUpdateDeadlineSettings();

  const { register, handleSubmit, reset } = useForm<ReminderFormData>({
    defaultValues: {
      reminderDaysBefore: 7,
      postponementReminder: true,
      isActive: true,
    },
  });

  // Populate form when settings load
  useEffect(() => {
    if (settings) reset(settings);
  }, [settings, reset]);

  const onSubmit = (data: ReminderFormData) => {
    updateMutation.mutate(data);
  };

  if (isLoading) return null;

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <Bell className="h-5 w-5 text-guard-primary" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t('fiscal.settings.title')}</h3>
          <p className="text-xs text-guard-muted">{t('fiscal.settings.description')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Active Toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            {...register('isActive')}
            className="h-4 w-4 rounded border-input text-guard-primary focus:ring-guard-primary"
          />
          <span className="text-sm text-foreground">{t('fiscal.settings.active')}</span>
        </label>

        {/* Days Before */}
        <div>
          <label htmlFor="reminderDays" className="block text-sm font-medium text-foreground mb-1.5">
            {t('fiscal.settings.days-before')}
          </label>
          <input
            id="reminderDays"
            type="number"
            min={1}
            max={90}
            {...register('reminderDaysBefore', { valueAsNumber: true })}
            className={cn(INPUT_CLASSES, 'w-24')}
          />
          <p className="text-xs text-guard-muted mt-1.5">{t('fiscal.settings.days-before-hint')}</p>
        </div>

        {/* Postponement Toggle */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            {...register('postponementReminder')}
            className="h-4 w-4 rounded border-input text-guard-primary focus:ring-guard-primary mt-0.5"
          />
          <div>
            <span className="text-sm text-foreground">{t('fiscal.settings.aplazamiento')}</span>
            <p className="text-xs text-guard-muted">{t('fiscal.settings.aplazamiento-hint')}</p>
          </div>
        </label>

        {/* Save */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
              'bg-guard-primary text-white hover:bg-guard-primary/90',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {updateMutation.isPending ? t('common.loading') : t('common.buttons.save')}
          </button>
          {updateMutation.isSuccess && (
            <p className="text-sm text-guard-success animate-fade-in">{t('fiscal.settings.saved')}</p>
          )}
        </div>
      </form>
    </div>
  );
}
