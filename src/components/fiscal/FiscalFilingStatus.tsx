'use client';

/**
 * Filing status badge for Modelo cards.
 * Shows filed (green) or pending (gray) with download link.
 */

import { CheckCircle, Clock, FileDown } from 'lucide-react';
import { FISCAL_STATUS } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import type { FiscalDocument, FiscalStatus } from '@/types/finance';
import { cn } from '@/utils/helpers';

interface FiscalFilingStatusProps {
  status: FiscalStatus;
  document?: FiscalDocument | null;
}

const STATUS_CONFIG = {
  [FISCAL_STATUS.FILED]: {
    icon: CheckCircle,
    className: 'bg-guard-success/10 text-guard-success border-guard-success/20',
    i18nKey: 'fiscal.documents.status.filed',
  },
  [FISCAL_STATUS.PENDING]: {
    icon: Clock,
    className: 'bg-muted text-guard-muted border-border',
    i18nKey: 'fiscal.documents.status.pending',
  },
} as const;

export function FiscalFilingStatus({ status, document }: FiscalFilingStatusProps) {
  const { t } = useTranslate();
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
        config.className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{t(config.i18nKey)}</span>
      {document?.downloadUrl && (
        <a
          href={document.downloadUrl}
          download
          className="ml-1 hover:opacity-70 transition-opacity"
          title={t('fiscal.documents.download')}
        >
          <FileDown className="h-3 w-3" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
