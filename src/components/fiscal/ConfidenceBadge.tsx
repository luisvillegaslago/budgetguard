'use client';

/**
 * OCR confidence badge, colour-coded by reliability.
 * Shared by the invoice extraction confirmation and the modelo upload modals.
 */

import { HIGH_CONFIDENCE_THRESHOLD, LOW_CONFIDENCE_THRESHOLD } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import { cn } from '@/utils/helpers';

interface ConfidenceBadgeProps {
  confidence: number;
  className?: string;
}

export function ConfidenceBadge({ confidence, className }: ConfidenceBadgeProps) {
  const { t } = useTranslate();

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-xs text-guard-muted">{t('fiscal.extraction.confidence')}</span>
      <span
        className={cn(
          'text-xs font-medium px-2 py-0.5 rounded-full',
          confidence >= HIGH_CONFIDENCE_THRESHOLD
            ? 'bg-guard-success/10 text-guard-success'
            : confidence >= LOW_CONFIDENCE_THRESHOLD
              ? 'bg-guard-primary/10 text-guard-primary'
              : 'bg-guard-warning/10 text-guard-warning',
        )}
      >
        {Math.round(confidence * 100)}%
      </span>
    </div>
  );
}
