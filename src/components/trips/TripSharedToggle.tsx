'use client';

/**
 * BudgetGuard Trip Shared Toggle
 * Checkbox shared by the trip create/edit forms.
 * When enabled, new expenses added to the trip default to the shared (÷2) option.
 */

import { Users } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { useTranslate } from '@/hooks/useTranslations';

interface TripSharedToggleProps {
  id: string;
  registration: UseFormRegisterReturn;
}

export function TripSharedToggle({ id, registration }: TripSharedToggleProps) {
  const { t } = useTranslate();

  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center h-6 mt-0.5">
        <input
          id={id}
          type="checkbox"
          {...registration}
          className="h-4 w-4 rounded border-input text-guard-primary focus:ring-guard-primary"
        />
      </div>
      <div className="flex-1">
        <label htmlFor={id} className="text-sm font-medium text-foreground flex items-center gap-2">
          <Users className="h-4 w-4 text-guard-primary" aria-hidden="true" />
          {t('trips.create-form.fields.shared')}
        </label>
        <p className="text-xs text-guard-muted mt-1">{t('trips.create-form.fields.shared-hint')}</p>
      </div>
    </div>
  );
}
