'use client';

/**
 * BudgetGuard Inline Prefix Form
 * Compact create-a-prefix form shared by the invoice form and the company settings section
 */

import { Loader2, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslate } from '@/hooks/useTranslations';

const PREFIX_MAX_LENGTH = 10;

interface InlinePrefixFormProps {
  inputId: string;
  isPending: boolean;
  onSubmit: (prefix: string) => Promise<void>;
  onCancel: () => void;
}

export function InlinePrefixForm({ inputId, isPending, onSubmit, onCancel }: InlinePrefixFormProps) {
  const { t } = useTranslate();
  const [prefixCode, setPrefixCode] = useState('');

  const trimmed = prefixCode.trim();

  const handleSubmit = async () => {
    if (!trimmed) return;
    await onSubmit(trimmed);
  };

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1 min-w-0">
        <label htmlFor={inputId} className="block text-xs font-medium text-guard-muted mb-1">
          {t('settings.billing.fields.prefix')}
        </label>
        <input
          id={inputId}
          type="text"
          value={prefixCode}
          onChange={(e) => setPrefixCode(e.target.value.toUpperCase())}
          placeholder={t('settings.billing.fields.prefix-placeholder')}
          maxLength={PREFIX_MAX_LENGTH}
          className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-guard-primary font-mono"
        />
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending || !trimmed}
        className="btn-primary flex items-center justify-center shrink-0 p-2.5"
        aria-label={t('common.buttons.create')}
        title={t('common.buttons.create')}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Plus className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="p-2.5 text-guard-muted hover:text-guard-danger rounded-lg transition-colors shrink-0"
        aria-label={t('common.buttons.cancel')}
        title={t('common.buttons.cancel')}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
