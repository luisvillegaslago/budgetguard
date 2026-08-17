'use client';

/**
 * BudgetGuard Cross-Quarter Invoice Notice
 *
 * The sibling of FiscalUncountedIncome, and just as deliberately quiet: nothing here is an error.
 * "vw_FiscalAccrual" books every invoice on its "InvoiceDate", so the models above are already
 * right in all three cases. What this prevents is the human step afterwards — the person filing
 * reasons from bank movements ("I got paid in April, so it goes in 2T") while the law reasons from
 * the invoice date, and when they disagree it is the human who overwrites a correct figure. That
 * is what forced the 2T 2026 rectificativa.
 *
 * Both dates are on every row on purpose: the crossing is something to see, not to be told about.
 *
 * Only "issued, no collection on record" is drawn in warning colours — it is the one case with a
 * cash consequence, since the IVA is due on the deadline whether or not the money ever arrived.
 * The other two disagree about which quarter counts, and nothing is owed for them.
 */

import { AlertTriangle, ArrowRight, CalendarClock, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { CrossQuarterCase } from '@/constants/finance';
import { CROSS_QUARTER_CASE } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import type { CrossQuarterInvoice } from '@/types/finance';
import { cn, formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface FiscalCrossQuarterInvoicesProps {
  invoices: CrossQuarterInvoice[];
}

/**
 * Reading order: what this quarter declares comes first, what merely landed in it comes last.
 */
const CASE_ORDER: CrossQuarterCase[] = [
  CROSS_QUARTER_CASE.COLLECTED_IN_ANOTHER_PERIOD,
  CROSS_QUARTER_CASE.ISSUED_NOT_COLLECTED,
  CROSS_QUARTER_CASE.DECLARED_IN_EARLIER_PERIOD,
];

export function FiscalCrossQuarterInvoices({ invoices }: FiscalCrossQuarterInvoicesProps) {
  const { t, locale } = useTranslate();
  const [isOpen, setIsOpen] = useState(true);

  // Nothing to reconcile: a panel that is always on screen is a panel nobody reads
  if (invoices.length === 0) return null;

  const groups = CASE_ORDER.map((crossQuarterCase) => ({
    crossQuarterCase,
    rows: invoices.filter((invoice) => invoice.crossQuarterCase === crossQuarterCase),
  })).filter((group) => group.rows.length > 0);

  // Literal keys, so ui-translation-keys.test.ts can see them; a `fiscal.cross-quarter.group.${case}`
  // template would resolve at runtime but stay invisible to the static scan.
  const groupLabel = (crossQuarterCase: CrossQuarterCase): string => {
    switch (crossQuarterCase) {
      case CROSS_QUARTER_CASE.COLLECTED_IN_ANOTHER_PERIOD:
        return t('fiscal.cross-quarter.group.collected-in-another-period');
      case CROSS_QUARTER_CASE.ISSUED_NOT_COLLECTED:
        return t('fiscal.cross-quarter.group.issued-not-collected');
      case CROSS_QUARTER_CASE.DECLARED_IN_EARLIER_PERIOD:
        return t('fiscal.cross-quarter.group.declared-in-earlier-period');
    }
  };

  const caseSentence = (invoice: CrossQuarterInvoice): string => {
    const { collectionQuarter, collectionYear, invoiceQuarter, invoiceYear } = invoice;

    switch (invoice.crossQuarterCase) {
      case CROSS_QUARTER_CASE.COLLECTED_IN_ANOTHER_PERIOD:
        // The repository never classifies a row without a collection as this case; if the link
        // were ever lost, "no collection on record" is the one statement still true of it.
        if (collectionQuarter === null || collectionYear === null) {
          return t('fiscal.cross-quarter.case.issued-not-collected');
        }
        // Two quarters of one year move money between filings of the same Renta; two years move
        // it between two different ones, which is worth naming explicitly.
        return invoice.crossesFiscalYear
          ? t('fiscal.cross-quarter.case.collected-in-another-year', { collectionQuarter, collectionYear, invoiceYear })
          : t('fiscal.cross-quarter.case.collected-in-another-period', { collectionQuarter });
      case CROSS_QUARTER_CASE.ISSUED_NOT_COLLECTED:
        return t('fiscal.cross-quarter.case.issued-not-collected');
      case CROSS_QUARTER_CASE.DECLARED_IN_EARLIER_PERIOD:
        return t('fiscal.cross-quarter.case.declared-in-earlier-period', { invoiceQuarter, invoiceYear });
    }
  };

  return (
    <div className="rounded-lg border border-border bg-muted/40">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <CalendarClock className="h-4 w-4 shrink-0 text-guard-muted" aria-hidden="true" />
          <span className="truncate text-sm font-medium text-foreground">{t('fiscal.cross-quarter.title')}</span>
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-guard-muted">
            {invoices.length}
          </span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-guard-muted transition-transform duration-200', !isOpen && '-rotate-90')}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div className="space-y-3 border-t border-border px-4 py-3">
          <p className="text-xs text-guard-muted">{t('fiscal.cross-quarter.description')}</p>

          {groups.map(({ crossQuarterCase, rows }) => {
            const isCashRisk = crossQuarterCase === CROSS_QUARTER_CASE.ISSUED_NOT_COLLECTED;

            return (
              <section
                key={crossQuarterCase}
                className={cn(
                  'rounded-lg border border-border bg-card',
                  isCashRisk && 'border-guard-warning/30 bg-guard-warning/5',
                )}
              >
                <h4 className="flex items-center gap-2 border-b border-border px-3 py-2">
                  {isCashRisk && (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-guard-warning" aria-hidden="true" />
                  )}
                  <span
                    className={cn(
                      'text-xs font-semibold uppercase tracking-wider',
                      isCashRisk ? 'text-guard-warning' : 'text-guard-muted',
                    )}
                  >
                    {groupLabel(crossQuarterCase)}
                  </span>
                  <span className="ml-auto text-xs tabular-nums text-guard-muted">{rows.length}</span>
                </h4>

                <ul className="divide-y divide-border/50">
                  {rows.map((invoice) => (
                    <li key={invoice.invoiceId} className="space-y-1.5 px-3 py-2.5">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate">
                          {invoice.invoiceNumber && (
                            <span className="font-medium text-guard-primary">{invoice.invoiceNumber}</span>
                          )}
                          <span className={cn('text-foreground/80', invoice.invoiceNumber && 'ml-2')}>
                            {invoice.clientName}
                          </span>
                        </span>
                        <span className="shrink-0 font-medium tabular-nums">{formatCurrency(invoice.totalCents)}</span>
                      </div>

                      {/* Both dates, side by side: the crossing is visible before it is explained */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-guard-muted">
                        <span className="inline-flex items-baseline gap-1.5">
                          <span>{t('fiscal.cross-quarter.columns.issue-date')}</span>
                          <span className="tabular-nums text-foreground/80">
                            {formatDate(invoice.invoiceDate, 'short', locale)}
                          </span>
                        </span>
                        <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="inline-flex items-baseline gap-1.5">
                          <span>{t('fiscal.cross-quarter.columns.collection-date')}</span>
                          {invoice.collectionDate === null ? (
                            <span className="italic">{t('fiscal.cross-quarter.no-collection')}</span>
                          ) : (
                            <span className="tabular-nums text-foreground/80">
                              {formatDate(invoice.collectionDate, 'short', locale)}
                            </span>
                          )}
                        </span>
                        <span className="inline-flex items-baseline gap-1.5 sm:ml-auto">
                          <span>{t('fiscal.cross-quarter.columns.declared-quarter')}</span>
                          <span className="rounded bg-muted px-1.5 py-0.5 font-medium tabular-nums text-foreground">
                            {t('fiscal.cross-quarter.quarter-label', {
                              quarter: invoice.invoiceQuarter,
                              year: invoice.invoiceYear,
                            })}
                          </span>
                        </span>
                      </div>

                      <p className="text-xs text-guard-muted">{caseSentence(invoice)}</p>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
