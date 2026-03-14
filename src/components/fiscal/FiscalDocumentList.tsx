'use client';

/**
 * Fiscal document list table.
 * Receives documents as prop (parent handles fetching/filtering).
 * Shows documents with color-coded type badges, status toggle, and actions.
 * Linked transactions are expandable inline.
 */

import { ChevronDown, Download, FileText, Link2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { FiscalDocumentType } from '@/constants/finance';
import { FISCAL_DOCUMENT_TYPE, FISCAL_STATUS, SHARED_EXPENSE, TRANSACTION_TYPE } from '@/constants/finance';
import { useDeleteFiscalDocument, useUpdateDocumentStatus } from '@/hooks/useFiscalDocuments';
import { useTranslate } from '@/hooks/useTranslations';
import type { ApiResponse, FiscalDocument, Transaction } from '@/types/finance';
import { fetchApi } from '@/utils/fetchApi';
import { cn, formatDate } from '@/utils/helpers';
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

const TABLE_COL_COUNT = 7;

function formatFiscalPeriod(year: number, quarter: number | null): string {
  return quarter != null ? `Q${quarter} ${year}` : String(year);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function LinkedGroupDetail({ transactionGroupId }: { transactionGroupId: number }) {
  const { t } = useTranslate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useState(() => {
    fetchApi(`/api/transaction-groups/${transactionGroupId}`)
      .then((res) => res.json())
      .then((data: ApiResponse<Transaction[]>) => {
        if (data.success && data.data) setTransactions(data.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  });

  if (loading) {
    return <div className="px-4 py-3 text-xs text-guard-muted animate-pulse">{t('common.loading')}</div>;
  }

  if (transactions.length === 0) {
    return <div className="px-4 py-3 text-xs text-guard-muted">{t('common.error')}</div>;
  }

  const totalCents = transactions.reduce((sum, tx) => sum + (tx.originalAmountCents ?? tx.amountCents), 0);

  return (
    <div className="px-6 py-3.5">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-sm font-semibold tabular-nums text-guard-danger">-{formatCurrency(totalCents)}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-guard-primary/10 text-guard-primary font-medium">
          {transactions.length} {t('fiscal.documents.linked-group-items')}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-xs">
        {transactions.map((tx) => (
          <div key={tx.transactionId}>
            <p className="text-guard-muted mb-0.5">{tx.description ?? tx.category?.name ?? '—'}</p>
            <p className="text-foreground tabular-nums">
              {formatCurrency(tx.originalAmountCents ?? tx.amountCents)}
              {tx.sharedDivisor > 1 && <span className="text-guard-muted ml-1">(÷2)</span>}
            </p>
          </div>
        ))}
        <div>
          <p className="text-guard-muted mb-0.5">{t('transactions.form.fields.date')}</p>
          <p className="text-foreground">{formatDate(transactions[0]?.transactionDate ?? '', 'long')}</p>
        </div>
      </div>
    </div>
  );
}

function LinkedTransactionDetail({ transactionId }: { transactionId: number }) {
  const { t } = useTranslate();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Fetch on mount
  useState(() => {
    fetchApi(`/api/transactions/${transactionId}`)
      .then((res) => res.json())
      .then((data: ApiResponse<Transaction>) => {
        if (data.success && data.data) setTransaction(data.data);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  });

  if (loading) {
    return <div className="px-4 py-3 text-xs text-guard-muted animate-pulse">{t('common.loading')}</div>;
  }

  if (error || !transaction) {
    return <div className="px-4 py-3 text-xs text-guard-danger">{t('common.error')}</div>;
  }

  const isShared = transaction.sharedDivisor > SHARED_EXPENSE.DEFAULT_DIVISOR;
  const isIncome = transaction.type === TRANSACTION_TYPE.INCOME;

  return (
    <div className="px-6 py-3.5">
      {/* Header: amount + category + shared badge */}
      <div className="flex items-center gap-3 mb-2">
        <span
          className={cn('text-sm font-semibold tabular-nums', isIncome ? 'text-guard-success' : 'text-guard-danger')}
        >
          {isIncome ? '+' : '-'}
          {formatCurrency(transaction.amountCents)}
        </span>
        {isShared && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-guard-primary/10 text-guard-primary font-medium">
            ÷2
          </span>
        )}
        {transaction.category && (
          <span className="text-xs text-guard-muted">
            {transaction.parentCategory ? `${transaction.parentCategory.name} › ` : ''}
            {transaction.category.name}
          </span>
        )}
      </div>
      {/* Details grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-xs">
        <div>
          <p className="text-guard-muted mb-0.5">{t('transactions.form.fields.date')}</p>
          <p className="text-foreground">{formatDate(transaction.transactionDate, 'long')}</p>
        </div>
        {transaction.description && (
          <div>
            <p className="text-guard-muted mb-0.5">{t('transactions.form.fields.description')}</p>
            <p className="text-foreground">{transaction.description}</p>
          </div>
        )}
        {transaction.vendorName && (
          <div>
            <p className="text-guard-muted mb-0.5">{t('fiscal.form.vendor-name')}</p>
            <p className="text-foreground">{transaction.vendorName}</p>
          </div>
        )}
        {transaction.vatPercent != null && (
          <div>
            <p className="text-guard-muted mb-0.5">{t('fiscal.form.vat-percent')}</p>
            <p className="text-foreground">{transaction.vatPercent}%</p>
          </div>
        )}
        {isShared && transaction.originalAmountCents && (
          <div>
            <p className="text-guard-muted mb-0.5">{t('fiscal.documents.linked-original')}</p>
            <p className="text-foreground tabular-nums">{formatCurrency(transaction.originalAmountCents)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function DocumentRow({ document, year }: { document: FiscalDocument; year: number }) {
  const { t } = useTranslate();
  const deleteMutation = useDeleteFiscalDocument(year);
  const updateStatus = useUpdateDocumentStatus(year);
  const [expanded, setExpanded] = useState(false);

  const hasLinkedTransaction = document.transactionId != null || document.transactionGroupId != null;

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

  const ext = document.extractedData;
  // Show extracted amount, fall back to manually entered taxAmountCents
  const displayAmountCents = ext?.totalAmountCents ?? document.taxAmountCents;
  // Show extracted vendor or description as subtitle
  const subtitle = ext?.vendor ?? document.description;

  return (
    <>
      <tr className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-guard-muted shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-foreground truncate">{document.fileName}</p>
                {hasLinkedTransaction && (
                  <button
                    type="button"
                    onClick={() => setExpanded(!expanded)}
                    className="flex items-center gap-0.5 text-guard-success hover:text-guard-success/80 transition-colors"
                    title={t('fiscal.documents.linked-transaction')}
                  >
                    <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <ChevronDown
                      className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')}
                      aria-hidden="true"
                    />
                  </button>
                )}
              </div>
              {subtitle && <p className="text-xs text-guard-muted truncate">{subtitle}</p>}
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
          {displayAmountCents != null && (
            <span className="text-sm tabular-nums">{formatCurrency(displayAmountCents)}</span>
          )}
          {ext?.vatPercent != null && (
            <span className="block text-[10px] text-guard-muted tabular-nums">IVA {ext.vatPercent}%</span>
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
      {expanded && hasLinkedTransaction && (
        <tr className="bg-guard-primary/5 border-b border-border">
          <td colSpan={TABLE_COL_COUNT}>
            {document.transactionId != null ? (
              <LinkedTransactionDetail transactionId={document.transactionId} />
            ) : document.transactionGroupId != null ? (
              <LinkedGroupDetail transactionGroupId={document.transactionGroupId} />
            ) : null}
          </td>
        </tr>
      )}
    </>
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
