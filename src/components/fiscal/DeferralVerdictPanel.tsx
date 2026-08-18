'use client';

/**
 * The verdict on a deferral resolution: does the letter agree with itself?
 *
 * It reports, it does not gate. A three-cent disagreement is worth putting in front of the human,
 * and every finding names the fracción and the cents so it can be checked against the printed page
 * — which is the only way to tell a misread digit from a correct one.
 *
 * The checks live in src/utils/deferral.ts and never recompute a split: the sums of ANEXO I are
 * compared with the letter's own totals row. The one exception recomputes a fracción's interest
 * from art. 53 RGR, so it gets its own label — calling that "the sum of the instalments" would be
 * a lie about where the figure came from.
 */

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { DeferralCheck } from '@/constants/finance';
import { DEFERRAL_CHECK } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import type { DeferralVerdict, DeferralVerificationIssue } from '@/types/finance';
import { cn } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface DeferralVerdictPanelProps {
  verdict: DeferralVerdict;
}

/**
 * Findings whose `expected`/`actual` are amounts in cents. The other two carry a fracción number
 * and a day count, which mean nothing formatted as euros — their message says it all, so they are
 * shown without figures rather than with figures that read as money.
 */
const MONETARY_CHECKS: readonly DeferralCheck[] = [
  DEFERRAL_CHECK.PRINCIPAL_TOTAL,
  DEFERRAL_CHECK.SURCHARGE_TOTAL,
  DEFERRAL_CHECK.INTEREST_TOTAL,
  DEFERRAL_CHECK.FRACCION_TOTAL,
  DEFERRAL_CHECK.INTEREST_ACCRUAL,
];

/** Signed on purpose: which way a total leans says which of the two figures was misread. */
function formatSigned(cents: number): string {
  return cents > 0 ? `+${formatCurrency(cents)}` : formatCurrency(cents);
}

function IssueFigures({ issue }: { issue: DeferralVerificationIssue }) {
  const { t } = useTranslate();

  // The accrual check is the only one that derives its figure instead of adding rows up
  const actualLabel =
    issue.check === DEFERRAL_CHECK.INTEREST_ACCRUAL
      ? t('fiscal.deferrals.verification.recomputed')
      : t('fiscal.deferrals.verification.actual');

  return (
    <dl className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
      <div>
        <dt className="text-guard-muted">{t('fiscal.deferrals.verification.expected')}</dt>
        <dd className="tabular-nums font-medium text-foreground">{formatCurrency(issue.expected)}</dd>
      </div>
      <div>
        <dt className="text-guard-muted">{actualLabel}</dt>
        <dd className="tabular-nums font-medium text-foreground">{formatCurrency(issue.actual)}</dd>
      </div>
      <div>
        <dt className="text-guard-muted">{t('fiscal.deferrals.verification.difference')}</dt>
        <dd className="tabular-nums font-semibold text-guard-warning">{formatSigned(issue.difference)}</dd>
      </div>
    </dl>
  );
}

export function DeferralVerdictPanel({ verdict }: DeferralVerdictPanelProps) {
  const { t } = useTranslate();

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t('fiscal.deferrals.verification.title')}</h3>
        <p className="text-xs text-guard-muted mt-1">{t('fiscal.deferrals.verification.description')}</p>
      </div>

      {verdict.isValid ? (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-guard-success/10 border border-guard-success/20">
          <CheckCircle2 className="h-4 w-4 text-guard-success mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm text-guard-success">{t('fiscal.deferrals.verification.valid')}</p>
        </div>
      ) : (
        <div
          role="alert"
          className="rounded-lg bg-guard-warning/10 border border-guard-warning/20 px-3 py-2.5 space-y-3"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-guard-warning mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-sm text-guard-warning">
              {t('fiscal.deferrals.verification.invalid', { count: verdict.issues.length })}
            </p>
          </div>

          <ul className="space-y-2">
            {verdict.issues.map((issue) => (
              <li
                key={`${issue.check}-${issue.fraccionNumber ?? 'header'}`}
                className={cn('rounded-lg bg-card border border-guard-warning/20 px-3 py-2.5')}
              >
                <p className="text-xs font-semibold text-guard-warning">
                  {issue.fraccionNumber === null
                    ? t('fiscal.deferrals.verification.header-label')
                    : t('fiscal.deferrals.verification.fraccion-label', { number: issue.fraccionNumber })}
                </p>
                <p className="text-sm text-foreground mt-0.5">
                  {t(`fiscal.deferrals.verification.checks.${issue.check}`)}
                </p>
                {MONETARY_CHECKS.includes(issue.check) && <IssueFigures issue={issue} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
