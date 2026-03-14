'use client';

/**
 * Fiscal document list table.
 * Receives documents as prop (parent handles fetching/filtering).
 * Shows documents with color-coded type badges, status toggle, and actions.
 */

import { Download, FileText, Trash2 } from 'lucide-react';
import type { FiscalDocumentType } from '@/constants/finance';
import { FISCAL_DOCUMENT_TYPE, FISCAL_STATUS } from '@/constants/finance';
import { useDeleteFiscalDocument, useUpdateDocumentStatus } from '@/hooks/useFiscalDocuments';
import { useTranslate } from '@/hooks/useTranslations';
import type { FiscalDocument } from '@/types/finance';
import { cn } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface FiscalDocumentListProps {
  documents: FiscalDocument[];
  year: number;
}

const STATUS_STYLES: Record<string, string> = {
  [FISCAL_STATUS.FILED]: 'bg-guard-success/10 text-guard-success',
  [FISCAL_STATUS.PENDING]: 'bg-muted text-guard-muted',
};

export const DOC_TYPE_STYLES: Record<FiscalDocumentType, { badge: string; label: string }> = {
  [FISCAL_DOCUMENT_TYPE.MODELO]: {
    badge: 'bg-violet-500/10 text-violet-400',
    label: 'border-l-violet-500',
  },
  [FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA]: {
    badge: 'bg-amber-500/10 text-amber-400',
    label: 'border-l-amber-500',
  },
  [FISCAL_DOCUMENT_TYPE.FACTURA_EMITIDA]: {
    badge: 'bg-guard-success/10 text-guard-success',
    label: 'border-l-guard-success',
  },
};

function formatFiscalPeriod(year: number, quarter: number | null): string {
  return quarter != null ? `Q${quarter} ${year}` : String(year);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentRow({ document, year }: { document: FiscalDocument; year: number }) {
  const { t } = useTranslate();
  const deleteMutation = useDeleteFiscalDocument(year);
  const updateStatus = useUpdateDocumentStatus(year);

  const typeLabel =
    document.documentType === FISCAL_DOCUMENT_TYPE.MODELO
      ? `Modelo ${document.modeloType}${document.fiscalQuarter ? ` Q${document.fiscalQuarter}` : ''}`
      : document.documentType === FISCAL_DOCUMENT_TYPE.FACTURA_EMITIDA
        ? t('fiscal.documents.types.factura-emitida')
        : t('fiscal.documents.types.factura');

  const typeStyle = DOC_TYPE_STYLES[document.documentType];

  const handleStatusToggle = () => {
    const next = document.status === FISCAL_STATUS.PENDING ? FISCAL_STATUS.FILED : FISCAL_STATUS.PENDING;
    updateStatus.mutate({ id: document.documentId, status: next });
  };

  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-guard-muted shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{document.fileName}</p>
            {document.description && <p className="text-xs text-guard-muted truncate">{document.description}</p>}
          </div>
        </div>
      </td>
      <td className="py-2.5 px-3">
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', typeStyle.badge)}>{typeLabel}</span>
      </td>
      <td className="py-2.5 px-3">
        <button
          type="button"
          onClick={handleStatusToggle}
          disabled={updateStatus.isPending}
          className={cn(
            'text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer transition-opacity hover:opacity-80',
            STATUS_STYLES[document.status],
          )}
        >
          {t(`fiscal.documents.status.${document.status}`)}
        </button>
      </td>
      <td className="py-2.5 px-3 text-sm text-guard-muted tabular-nums">
        {formatFiscalPeriod(document.fiscalYear, document.fiscalQuarter)}
      </td>
      <td className="py-2.5 px-3 text-right">
        {document.taxAmountCents != null && (
          <span className="text-sm tabular-nums">{formatCurrency(document.taxAmountCents)}</span>
        )}
      </td>
      <td className="py-2.5 px-3 text-right text-xs text-guard-muted">{formatFileSize(document.fileSizeBytes)}</td>
      <td className="py-2.5 px-3">
        <div className="flex items-center justify-end gap-1">
          <a
            href={document.downloadUrl}
            download
            className="p-1.5 text-guard-muted hover:text-guard-primary transition-colors"
            title={t('fiscal.documents.download')}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
          </a>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t('fiscal.documents.delete-confirm'))) {
                deleteMutation.mutate(document.documentId);
              }
            }}
            disabled={deleteMutation.isPending}
            className="p-1.5 text-guard-muted hover:text-guard-danger transition-colors"
            title={t('common.buttons.delete')}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export function FiscalDocumentList({ documents, year }: FiscalDocumentListProps) {
  const { t } = useTranslate();

  if (documents.length === 0) {
    return (
      <div className="card text-center py-8">
        <FileText className="h-8 w-8 mx-auto text-guard-muted mb-2" aria-hidden="true" />
        <p className="text-sm text-guard-muted">{t('fiscal.documents.empty')}</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h3 className="text-base font-semibold text-foreground">{t('fiscal.documents.title')}</h3>
        <span className="text-sm text-guard-muted">{t('common.records', { count: documents.length })}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 px-3 text-xs font-semibold text-guard-muted uppercase">
                {t('fiscal.documents.columns.name')}
              </th>
              <th className="py-2 px-3 text-xs font-semibold text-guard-muted uppercase">
                {t('fiscal.documents.columns.type')}
              </th>
              <th className="py-2 px-3 text-xs font-semibold text-guard-muted uppercase">
                {t('fiscal.documents.columns.status')}
              </th>
              <th className="py-2 px-3 text-xs font-semibold text-guard-muted uppercase">
                {t('fiscal.documents.columns.period')}
              </th>
              <th className="py-2 px-3 text-xs font-semibold text-guard-muted uppercase text-right">
                {t('fiscal.documents.columns.amount')}
              </th>
              <th className="py-2 px-3 text-xs font-semibold text-guard-muted uppercase text-right">
                {t('fiscal.documents.columns.size')}
              </th>
              <th className="py-2 px-3 text-xs font-semibold text-guard-muted uppercase text-right">
                {t('fiscal.documents.columns.actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <DocumentRow key={doc.documentId} document={doc} year={year} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
