'use client';

/**
 * BudgetGuard Unlinked Purchase Notice
 * The warning an asset with no linked purchase deserves, and the fix for it.
 *
 * `FixedAssets."TransactionID"` is what makes the IRPF models drop the purchase from the period
 * expenses (docs/FISCAL_DOMAIN.md § Amortización del inmovilizado). Without it the purchase keeps
 * being deducted whole in its own year **and** the dotación is deducted on top of it, year after
 * year, and nothing else in the app notices — both figures are individually correct.
 *
 * The fix is one field: `{ transactionId }` through the ordinary asset update. So this component
 * never links anything on its own. It shows the movements the repository considers plausible, with
 * enough of each to be recognised — date, description, vendor, what it cost — and lets the user
 * point at one. **None is preselected and confirming takes two clicks**: a wrong link stops a real
 * purchase from being deducted while the impostor stays deducted, silently in both directions,
 * which is strictly worse than the warning it was meant to clear.
 *
 * An asset whose purchase is linked never reaches this component: the card only renders it for a
 * null `transactionId`, so a correctly linked inmovilizado shows nothing at all.
 */

import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { API_ERROR } from '@/constants/finance';
import { useConfirmTimeout } from '@/hooks/useConfirmTimeout';
import { useAssetPurchaseCandidates, useUpdateFixedAsset } from '@/hooks/useFixedAssets';
import { useTranslate } from '@/hooks/useTranslations';
import type { AssetPurchaseCandidate, FixedAsset } from '@/types/finance';
import { cn, formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface CandidateRowProps {
  candidate: AssetPurchaseCandidate;
  onLink: (transactionId: number) => void;
  isLinking: boolean;
  /** True while any candidate of this asset is being linked: one asset has one purchase */
  isDisabled: boolean;
}

/**
 * One suggested movement. Two clicks to link it, with the confirm state auto-dismissing — the same
 * deliberate gesture the delete button asks for, and for the same reason: it cannot be undone from
 * this screen once the panel disappears.
 */
function CandidateRow({ candidate, onLink, isLinking, isDisabled }: CandidateRowProps) {
  const { t, locale } = useTranslate();
  const { showConfirm, handleConfirm, buttonRef } = useConfirmTimeout(() => onLink(candidate.transactionId));

  // Whatever names the movement to a human. The category is the last resort: every expense has one,
  // a description or a vendor may be missing
  const title = candidate.description ?? candidate.vendorName ?? candidate.categoryName;
  const meta = [
    formatDate(candidate.transactionDate, 'numeric', locale),
    candidate.categoryName,
    candidate.vendorName === title ? null : candidate.vendorName,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

  const buttonLabel = (): string => {
    if (isLinking) return t('fiscal.fixed-assets.unlinked-purchase.linking');
    if (showConfirm) return t('common.buttons.confirm');
    return t('fiscal.fixed-assets.unlinked-purchase.link');
  };

  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{title}</p>
        <p className="text-xs text-guard-muted tabular-nums">{meta}</p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="text-right">
          {/* What left the account — the figure the movement is recognised by */}
          <p className="text-sm font-semibold text-foreground tabular-nums">
            {formatCurrency(candidate.fullAmountCents)}
          </p>
          {/* And the only figure comparable with the asset's base, which is what made it a match */}
          <p className="text-xs text-guard-muted tabular-nums">
            {t('fiscal.fixed-assets.columns.base')}: {formatCurrency(candidate.amortizableCostCents)}
          </p>
        </div>

        <button
          ref={buttonRef}
          type="button"
          onClick={handleConfirm}
          disabled={isDisabled}
          className={cn(
            'tap-target lg:min-h-8 shrink-0 px-3 py-2 rounded-lg text-xs font-semibold',
            'transition-all duration-200 ease-out-quart active:scale-[0.98]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            showConfirm
              ? 'bg-guard-warning text-white'
              : 'text-guard-primary bg-guard-primary/10 hover:bg-guard-primary/20',
          )}
        >
          {isLinking ? (
            <span className="inline-flex items-center gap-1.5">
              <LoadingSpinner size="sm" />
              {buttonLabel()}
            </span>
          ) : (
            buttonLabel()
          )}
        </button>
      </div>
    </li>
  );
}

interface UnlinkedPurchaseNoticeProps {
  asset: FixedAsset;
  /** Fires once the purchase is written, so the card can confirm it after this panel is gone */
  onLinked: () => void;
}

export function UnlinkedPurchaseNotice({ asset, onLinked }: UnlinkedPurchaseNoticeProps) {
  const { t } = useTranslate();
  const [areCandidatesOpen, setAreCandidatesOpen] = useState(false);
  const [linkingTransactionId, setLinkingTransactionId] = useState<number | null>(null);

  // Nothing is searched until the user asks for it. The warning is the part that must always be
  // visible; scanning the ledger is what happens when somebody decides to act on it
  const { data: candidates, isLoading, isError } = useAssetPurchaseCandidates(areCandidatesOpen ? asset.assetId : null);

  // Linking is an ordinary field update, not a mutation of its own — see useFixedAssets.ts
  const linkPurchase = useUpdateFixedAsset();

  const candidatesId = `asset-purchase-candidates-${asset.assetId}`;

  const handleLink = (transactionId: number) => {
    setLinkingTransactionId(transactionId);
    linkPurchase.mutate(
      { id: asset.assetId, data: { transactionId } },
      { onSuccess: onLinked, onSettled: () => setLinkingTransactionId(null) },
    );
  };

  return (
    <div className="rounded-lg border border-guard-warning/30 bg-guard-warning/5 p-3 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-guard-warning mt-0.5 shrink-0" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-guard-warning">{t('fiscal.fixed-assets.unlinked-purchase.label')}</p>
          <p className="text-sm text-foreground/80">{t('fiscal.fixed-assets.unlinked-purchase.warning')}</p>
          <p className="text-xs text-guard-muted">{t('fiscal.fixed-assets.unlinked-purchase.context')}</p>
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setAreCandidatesOpen(!areCandidatesOpen)}
          aria-expanded={areCandidatesOpen}
          aria-controls={candidatesId}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium',
            'text-guard-primary hover:bg-guard-primary/10',
            'transition-colors duration-200 ease-out-quart',
          )}
        >
          {areCandidatesOpen ? (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
          {t('fiscal.fixed-assets.unlinked-purchase.candidates-title')}
        </button>

        {areCandidatesOpen && (
          <div id={candidatesId} className="mt-2 space-y-2">
            <p className="text-xs text-guard-muted">{t('fiscal.fixed-assets.unlinked-purchase.candidates-hint')}</p>

            {isLoading && (
              <div className="flex items-center justify-center py-4">
                <LoadingSpinner size="sm" label={t('common.loading')} />
              </div>
            )}

            {isError && (
              <p role="alert" className="text-sm text-guard-danger">
                {t(API_ERROR.LOAD.ASSET_PURCHASE_CANDIDATES)}
              </p>
            )}

            {candidates && candidates.length === 0 && (
              <p className="text-sm text-foreground/80">
                {t('fiscal.fixed-assets.unlinked-purchase.candidates-empty')}
              </p>
            )}

            {candidates && candidates.length > 0 && (
              <ul className="space-y-2">
                {candidates.map((candidate) => (
                  <CandidateRow
                    key={candidate.transactionId}
                    candidate={candidate}
                    onLink={handleLink}
                    isLinking={linkingTransactionId === candidate.transactionId}
                    isDisabled={linkingTransactionId !== null}
                  />
                ))}
              </ul>
            )}

            {linkPurchase.errorMessage && (
              <p role="alert" className="text-sm text-guard-danger">
                {linkPurchase.errorMessage}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
