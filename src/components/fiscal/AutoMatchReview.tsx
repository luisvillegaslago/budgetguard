'use client';

/**
 * Review step for an invoice the OCR extract auto-linked to an existing movement.
 *
 * The link is already stored when this renders. The matcher only compares amount and date, so the
 * movement can be an unrelated one with the same figure (a gym fee matched an Anthropic invoice),
 * which is why both choices exist: keeping the link, or rejecting it and creating the movement.
 */

import { Link2 } from 'lucide-react';
import { ErrorState } from '@/components/ui/ErrorState';
import { SHARED_EXPENSE, TRANSACTION_TYPE } from '@/constants/finance';
import { useTransaction, useTransactionGroup } from '@/hooks/useFiscalDocuments';
import { useTranslate } from '@/hooks/useTranslations';
import type { ExtractionAutoMatch } from '@/types/finance';
import { cn, formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface AutoMatchReviewProps {
  autoMatch: ExtractionAutoMatch;
  onKeep: () => void;
  onCreateNew: () => void;
}

function MatchedTransaction({ transactionId }: { transactionId: number }) {
  const { t, locale } = useTranslate();
  const { data: transaction, isLoading, isError, refetch } = useTransaction(transactionId);

  if (isLoading) return <p className="text-xs text-guard-muted animate-pulse">{t('common.loading')}</p>;
  if (isError || !transaction) {
    return <ErrorState message={t('fiscal.documents.linked-error')} onRetry={() => refetch()} />;
  }

  const isIncome = transaction.type === TRANSACTION_TYPE.INCOME;
  const isShared = transaction.sharedDivisor > SHARED_EXPENSE.DEFAULT_DIVISOR;
  const title = transaction.description ?? transaction.vendorName ?? transaction.category?.name ?? '—';
  const categoryName = transaction.category?.name;

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground break-words">{title}</p>
        <p className="text-xs text-guard-muted">
          {formatDate(transaction.transactionDate, 'long', locale)}
          {categoryName && categoryName !== title ? ` · ${categoryName}` : ''}
        </p>
      </div>
      <span
        className={cn(
          'shrink-0 text-sm font-semibold tabular-nums',
          isIncome ? 'text-guard-success' : 'text-guard-danger',
        )}
      >
        {isIncome ? '+' : '-'}
        {formatCurrency(transaction.amountCents)}
        {isShared ? ` (÷${transaction.sharedDivisor})` : ''}
      </span>
    </div>
  );
}

function MatchedGroup({ transactionGroupId }: { transactionGroupId: number }) {
  const { t } = useTranslate();
  const { data: transactions, isLoading, isError, refetch } = useTransactionGroup(transactionGroupId);

  if (isLoading) return <p className="text-xs text-guard-muted animate-pulse">{t('common.loading')}</p>;
  if (isError) return <ErrorState message={t('fiscal.documents.linked-error')} onRetry={() => refetch()} />;
  if (!transactions || transactions.length === 0) {
    return <p className="text-xs text-guard-muted">{t('fiscal.documents.linked-empty')}</p>;
  }

  // Whole-invoice figures, the same total the matcher compared against the document
  const totalCents = transactions.reduce((sum, tx) => sum + (tx.originalAmountCents ?? tx.amountCents), 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-guard-muted">
          {transactions.length} {t('fiscal.documents.linked-group-items')}
        </span>
        <span className="text-sm font-semibold tabular-nums text-guard-danger">-{formatCurrency(totalCents)}</span>
      </div>
      <ul className="space-y-1 text-xs">
        {transactions.map((tx) => (
          <li key={tx.transactionId} className="flex justify-between gap-3">
            <span className="min-w-0 truncate text-foreground">{tx.description ?? tx.category?.name ?? '—'}</span>
            <span className="shrink-0 tabular-nums text-guard-muted">
              {formatCurrency(tx.originalAmountCents ?? tx.amountCents)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AutoMatchReview({ autoMatch, onKeep, onCreateNew }: AutoMatchReviewProps) {
  const { t } = useTranslate();

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-guard-primary/5 border border-guard-primary/20">
        <Link2 className="h-4 w-4 text-guard-primary mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground">{t('fiscal.extraction.auto-match.title')}</p>
          <p className="mt-0.5 text-xs text-guard-muted">{t('fiscal.extraction.auto-match.hint')}</p>
        </div>
      </div>

      <div className="rounded-lg border border-input p-3">
        {autoMatch.matchedTransactionId != null ? (
          <MatchedTransaction transactionId={autoMatch.matchedTransactionId} />
        ) : autoMatch.matchedGroupId != null ? (
          <MatchedGroup transactionGroupId={autoMatch.matchedGroupId} />
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
        <button
          type="button"
          onClick={onCreateNew}
          className="flex-1 py-2.5 rounded-lg font-medium text-foreground bg-muted hover:bg-muted/80 transition-colors"
        >
          {t('fiscal.extraction.auto-match.create-new')}
        </button>
        <button
          type="button"
          onClick={onKeep}
          className={cn(
            'flex-1 py-2.5 rounded-lg font-semibold text-white transition-all duration-200 ease-out-quart',
            'bg-guard-primary hover:bg-guard-primary/90 active:scale-[0.98]',
          )}
        >
          {t('fiscal.extraction.auto-match.keep')}
        </button>
      </div>
    </div>
  );
}
