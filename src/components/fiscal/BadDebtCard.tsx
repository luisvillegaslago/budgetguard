'use client';

/**
 * BudgetGuard Bad Debt Card — el IVA de las facturas impagadas (art. 80.Cuatro LIVA)
 *
 * A CLOCK AND A CHECKLIST, AND NOTHING ELSE. The IVA of an invoice is paid over in the 303 of the
 * quarter it was issued in, collected or not. When the client never pays, the article lets that
 * cuota be recovered — by issuing a factura rectificativa, remitting it, uploading the evidence and
 * filing a modelo 952, all inside hard deadlines whose expiry loses the right permanently. This
 * card shows which invoices are approaching or inside that window and what has to be done by when.
 * It issues nothing, files nothing and never touches an invoice's status, and the disclaimer at the
 * foot says so in the user's own words.
 *
 * IT LIVES ON THE INVOICES PAGE, not on /fiscal. The trigger is always the same thought — "this one
 * never paid me" — and that thought happens in front of the invoice list. The fiscal page is
 * organised by period, and this clock is the one fiscal deadline that belongs to no period: it runs
 * from a devengo and straddles quarters and years by construction.
 *
 * WHY BOTH TERMS ARE ALWAYS SHOWN. Six months or a year is the taxpayer's choice
 * (art. 80.Cuatro.A).1.ª) and nothing in the data model records which was taken, so the card shows
 * two labelled calendars instead of picking one — with the warning that the second is NOT a
 * confirmed safety net for a first window that was allowed to lapse.
 *
 * THE EMPTY STATE IS THE MAIN STATE. For this user's portfolio — services to businesses outside the
 * TAI, no sujetas, casilla 120 — the gate closes on every invoice and `tracked` is legitimately
 * empty. So the excluded invoices are shown with their reason rather than dropped: an empty module
 * that cannot say why reads as broken, and the reasons are precisely what tells the user there is
 * no deadline to miss.
 *
 * Colour never carries the meaning on its own (DESIGN.md): every stage prints its own words, and
 * amber is reserved for the one stage with something to do before a date.
 */

import { AlertTriangle, CalendarClock, ChevronDown, ExternalLink, Info, ListChecks, Receipt } from 'lucide-react';
import { useState } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { BadDebtChecklistStep, BadDebtExclusion, BadDebtStage, BadDebtWaitingTerm } from '@/constants/finance';
import {
  BAD_DEBT_AEAT_FORM,
  BAD_DEBT_APPROACHING_DAYS,
  BAD_DEBT_CHECKLIST_LEGAL_BASIS,
  BAD_DEBT_CHECKLIST_STEP,
  BAD_DEBT_CHECKLIST_STEPS,
  BAD_DEBT_EXCLUSION,
  BAD_DEBT_STAGE,
  BAD_DEBT_WAITING_TERM,
} from '@/constants/finance';
import { useBadDebtInvoices } from '@/hooks/useBadDebtInvoices';
import { useTranslate } from '@/hooks/useTranslations';
import type { BadDebtInvoice, BadDebtWindow } from '@/types/finance';
import { cn, formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

/**
 * Stage chrome. `in-window` is the only amber one: it is the only stage with an action that expires.
 * `window-expired` stays neutral and dashed — the right is already gone, so shouting about it would
 * ask for something that cannot be done any more.
 */
const STAGE_BADGE: Record<BadDebtStage, string> = {
  [BAD_DEBT_STAGE.WAITING]: 'bg-muted text-guard-muted border-border',
  [BAD_DEBT_STAGE.IN_WINDOW]: 'bg-guard-warning/10 text-guard-warning border-guard-warning/30',
  [BAD_DEBT_STAGE.WINDOW_EXPIRED]: 'bg-muted text-guard-muted border-dashed border-guard-muted/50',
  [BAD_DEBT_STAGE.OUT_OF_SCOPE]: 'bg-muted text-guard-muted border-border',
};

const SECTION_TITLE = 'text-sm font-semibold text-foreground';
const NOTE = 'text-xs text-guard-muted';

/** Literal keys, so ui-translation-keys.test.ts can see them; a template would resolve at runtime. */
function StageBadge({ stage }: { stage: BadDebtStage }) {
  const { t } = useTranslate();

  const label = (): string => {
    switch (stage) {
      case BAD_DEBT_STAGE.WAITING:
        return t('fiscal.bad-debt.stage.waiting');
      case BAD_DEBT_STAGE.IN_WINDOW:
        return t('fiscal.bad-debt.stage.in-window');
      case BAD_DEBT_STAGE.WINDOW_EXPIRED:
        return t('fiscal.bad-debt.stage.window-expired');
      case BAD_DEBT_STAGE.OUT_OF_SCOPE:
        return t('fiscal.bad-debt.stage.out-of-scope');
    }
  };

  return (
    <span
      className={cn('shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', STAGE_BADGE[stage])}
    >
      {label()}
    </span>
  );
}

function StageHint({ stage }: { stage: BadDebtStage }) {
  const { t } = useTranslate();

  switch (stage) {
    case BAD_DEBT_STAGE.WAITING:
      return <p className={NOTE}>{t('fiscal.bad-debt.stage-hint.waiting')}</p>;
    case BAD_DEBT_STAGE.IN_WINDOW:
      return <p className={NOTE}>{t('fiscal.bad-debt.stage-hint.in-window')}</p>;
    case BAD_DEBT_STAGE.WINDOW_EXPIRED:
      return <p className={NOTE}>{t('fiscal.bad-debt.stage-hint.window-expired')}</p>;
    case BAD_DEBT_STAGE.OUT_OF_SCOPE:
      return <p className={NOTE}>{t('fiscal.bad-debt.stage-hint.out-of-scope')}</p>;
  }
}

function TermLabel({ term }: { term: BadDebtWaitingTerm }) {
  const { t } = useTranslate();

  switch (term) {
    case BAD_DEBT_WAITING_TERM.PYME_SIX_MONTHS:
      return <>{t('fiscal.bad-debt.term.pyme-six-months')}</>;
    case BAD_DEBT_WAITING_TERM.GENERAL_ONE_YEAR:
      return <>{t('fiscal.bad-debt.term.general-one-year')}</>;
  }
}

/**
 * The countdown of one window, in the phrasing its own stage calls for.
 *
 * Everything comes from the payload — the day it was computed against is the server's, so a tab
 * left open overnight never shows a stage measured against one day and a countdown against another.
 */
function WindowCountdown({ entry }: { entry: BadDebtWindow }) {
  const { t, locale } = useTranslate();

  if (entry.stage === BAD_DEBT_STAGE.WINDOW_EXPIRED) {
    return (
      <span>{t('fiscal.bad-debt.window.expired', { date: formatDate(entry.windowEndDate, 'short', locale) })}</span>
    );
  }

  if (entry.stage === BAD_DEBT_STAGE.WAITING) {
    const days = entry.daysUntilWindowStart ?? 0;
    return (
      <span>
        {days === 1 ? t('fiscal.bad-debt.window.days-until-one') : t('fiscal.bad-debt.window.days-until', { days })}
      </span>
    );
  }

  const remaining = entry.daysRemainingInWindow ?? 0;
  // Zero is the last day, not an expired one: the closing day is inclusive (art. 80.Cuatro.B)
  if (remaining === 0)
    return <span className="font-medium text-guard-warning">{t('fiscal.bad-debt.window.last-day')}</span>;

  return (
    <span className="font-medium text-guard-warning">
      {remaining === 1
        ? t('fiscal.bad-debt.window.days-remaining-one')
        : t('fiscal.bad-debt.window.days-remaining', { days: remaining })}
    </span>
  );
}

/** One term's calendar: when it opens, when it closes, and where today sits between the two. */
function WindowRow({ entry }: { entry: BadDebtWindow }) {
  const { t, locale } = useTranslate();

  return (
    <li className="space-y-1 rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-guard-muted">
          <TermLabel term={entry.term} />
        </span>
        <StageBadge stage={entry.stage} />
      </div>

      <p className="text-sm tabular-nums text-foreground/80">
        {t('fiscal.bad-debt.window.range', {
          start: formatDate(entry.windowStartDate, 'short', locale),
          end: formatDate(entry.windowEndDate, 'short', locale),
        })}
      </p>

      <p className={NOTE}>
        <WindowCountdown entry={entry} />
      </p>
    </li>
  );
}

/** Invoice identity and figures — shared by the tracked list and the excluded one. */
function InvoiceHeadline({ invoice }: { invoice: BadDebtInvoice }) {
  const { t, locale } = useTranslate();

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">
          {invoice.invoiceNumber && <span className="font-medium text-guard-primary">{invoice.invoiceNumber}</span>}
          <span className={cn('text-foreground/80', invoice.invoiceNumber && 'ml-2')}>{invoice.clientName}</span>
        </span>
        <span className="shrink-0 font-medium tabular-nums">{formatCurrency(invoice.totalCents)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-guard-muted">
        <span className="inline-flex items-baseline gap-1.5">
          <span>{t('fiscal.bad-debt.columns.accrual-date')}</span>
          <span className="tabular-nums text-foreground/80">{formatDate(invoice.accrualDate, 'short', locale)}</span>
        </span>
        <span className="inline-flex items-baseline gap-1.5">
          <span>{t('fiscal.bad-debt.columns.base')}</span>
          <span className="tabular-nums text-foreground/80">{formatCurrency(invoice.baseCents)}</span>
        </span>
        <span className="inline-flex items-baseline gap-1.5">
          <span>{t('fiscal.bad-debt.columns.vat')}</span>
          <span className="tabular-nums text-foreground/80">{formatCurrency(invoice.vatCents)}</span>
        </span>
        {invoice.clientCountry && <span className="tabular-nums text-foreground/60">{invoice.clientCountry}</span>}
      </div>
    </div>
  );
}

/** An invoice the article reaches: its two calendars, and whether anything is running out. */
function TrackedInvoice({ invoice }: { invoice: BadDebtInvoice }) {
  const { t } = useTranslate();

  return (
    <li
      className={cn(
        'space-y-3 rounded-lg border px-3 py-3',
        invoice.needsAttention ? 'border-guard-warning/30 bg-guard-warning/5' : 'border-border bg-muted/20',
      )}
    >
      <div className="space-y-1.5">
        <InvoiceHeadline invoice={invoice} />

        {invoice.needsAttention && (
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-guard-warning">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t('fiscal.bad-debt.attention.badge')}
          </p>
        )}

        <p className="text-sm">
          <span className="text-guard-muted">{t('fiscal.bad-debt.columns.recoverable')}: </span>
          <span className="font-semibold tabular-nums text-foreground">{formatCurrency(invoice.vatCents)}</span>
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {invoice.windows.map((entry) => (
          <WindowRow key={entry.term} entry={entry} />
        ))}
      </ul>

      {/* The hint of the window closest to acting on: the shortest term is emitted first */}
      {invoice.windows[0] && <StageHint stage={invoice.windows[0].stage} />}
    </li>
  );
}

function ExclusionReason({ exclusion }: { exclusion: BadDebtExclusion }) {
  const { t } = useTranslate();

  const copy = (): { label: string; description: string } => {
    switch (exclusion) {
      case BAD_DEBT_EXCLUSION.NO_OUTPUT_VAT:
        return {
          label: t('fiscal.bad-debt.exclusion.no-output-vat.label'),
          description: t('fiscal.bad-debt.exclusion.no-output-vat.description'),
        };
      case BAD_DEBT_EXCLUSION.RECIPIENT_NOT_ESTABLISHED:
        return {
          label: t('fiscal.bad-debt.exclusion.recipient-not-established.label'),
          description: t('fiscal.bad-debt.exclusion.recipient-not-established.description'),
        };
      case BAD_DEBT_EXCLUSION.RECIPIENT_ESTABLISHMENT_UNKNOWN:
        return {
          label: t('fiscal.bad-debt.exclusion.recipient-establishment-unknown.label'),
          description: t('fiscal.bad-debt.exclusion.recipient-establishment-unknown.description'),
        };
      case BAD_DEBT_EXCLUSION.NOT_ISSUED:
        return {
          label: t('fiscal.bad-debt.exclusion.not-issued.label'),
          description: t('fiscal.bad-debt.exclusion.not-issued.description'),
        };
      case BAD_DEBT_EXCLUSION.COLLECTED:
        return {
          label: t('fiscal.bad-debt.exclusion.collected.label'),
          description: t('fiscal.bad-debt.exclusion.collected.description'),
        };
    }
  };

  const { label, description } = copy();

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wider text-guard-muted">
        {t('fiscal.bad-debt.excluded.reason-label')}: {label}
      </p>
      <p className={NOTE}>{description}</p>
    </div>
  );
}

/**
 * The invoices the gate closed on. Collapsed by default and open when there is nothing else to
 * show: with `tracked` empty they are the whole answer, and the answer is "no deadline to miss".
 */
function ExcludedInvoices({ invoices, startOpen }: { invoices: BadDebtInvoice[]; startOpen: boolean }) {
  const { t } = useTranslate();
  const [isOpen, setIsOpen] = useState(startOpen);

  if (invoices.length === 0) return null;

  return (
    <section className="space-y-2 border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className={SECTION_TITLE}>
          {isOpen ? t('fiscal.bad-debt.excluded.hide') : t('fiscal.bad-debt.excluded.show', { count: invoices.length })}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-guard-muted transition-transform duration-200', !isOpen && '-rotate-90')}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div className="space-y-2">
          <p className={NOTE}>{t('fiscal.bad-debt.excluded.description')}</p>
          <ul className="space-y-2">
            {invoices.map((invoice) => (
              <li key={invoice.invoiceId} className="space-y-2 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                <InvoiceHeadline invoice={invoice} />
                {/* Non-null by construction: `outOfScope` is exactly the invoices with an exclusion */}
                {invoice.exclusion && <ExclusionReason exclusion={invoice.exclusion} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ChecklistStep({ step }: { step: BadDebtChecklistStep }) {
  const { t } = useTranslate();

  const copy = (): { title: string; description: string } => {
    switch (step) {
      case BAD_DEBT_CHECKLIST_STEP.CLAIM_PAYMENT:
        return {
          title: t('fiscal.bad-debt.checklist.step.claim-payment.title'),
          description: t('fiscal.bad-debt.checklist.step.claim-payment.description'),
        };
      case BAD_DEBT_CHECKLIST_STEP.BOOK_IN_REGISTERS:
        return {
          title: t('fiscal.bad-debt.checklist.step.book-in-registers.title'),
          description: t('fiscal.bad-debt.checklist.step.book-in-registers.description'),
        };
      case BAD_DEBT_CHECKLIST_STEP.ISSUE_RECTIFICATIVA:
        return {
          title: t('fiscal.bad-debt.checklist.step.issue-rectificativa.title'),
          description: t('fiscal.bad-debt.checklist.step.issue-rectificativa.description'),
        };
      case BAD_DEBT_CHECKLIST_STEP.SEND_RECTIFICATIVA:
        return {
          title: t('fiscal.bad-debt.checklist.step.send-rectificativa.title'),
          description: t('fiscal.bad-debt.checklist.step.send-rectificativa.description'),
        };
      case BAD_DEBT_CHECKLIST_STEP.UPLOAD_EVIDENCE:
        return {
          title: t('fiscal.bad-debt.checklist.step.upload-evidence.title'),
          description: t('fiscal.bad-debt.checklist.step.upload-evidence.description'),
        };
      case BAD_DEBT_CHECKLIST_STEP.FILE_MODELO_952:
        return {
          title: t('fiscal.bad-debt.checklist.step.file-modelo-952.title'),
          description: t('fiscal.bad-debt.checklist.step.file-modelo-952.description'),
        };
      case BAD_DEBT_CHECKLIST_STEP.ADJUST_303:
        return {
          title: t('fiscal.bad-debt.checklist.step.adjust-303.title'),
          description: t('fiscal.bad-debt.checklist.step.adjust-303.description'),
        };
    }
  };

  const { title, description } = copy();

  return (
    <li className="rounded-lg border border-border bg-card px-3 py-2.5">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className={cn(NOTE, 'mt-1')}>{description}</p>
      {/* Normative citations, identical in both locales on purpose — see BAD_DEBT_CHECKLIST_LEGAL_BASIS */}
      <p className="mt-1 text-xs text-guard-muted/80">
        {t('fiscal.bad-debt.checklist.legal-basis', { basis: BAD_DEBT_CHECKLIST_LEGAL_BASIS[step] })}
      </p>
    </li>
  );
}

/** What has to be done, in order. Collapsible: seven steps are a lot to carry when nothing is due. */
function Checklist({ startOpen }: { startOpen: boolean }) {
  const { t } = useTranslate();
  const [isOpen, setIsOpen] = useState(startOpen);

  return (
    <section className="space-y-2 border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className={cn(SECTION_TITLE, 'inline-flex items-center gap-2')}>
          <ListChecks className="h-4 w-4 text-guard-muted" aria-hidden="true" />
          {t('fiscal.bad-debt.checklist.title')}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-guard-muted transition-transform duration-200', !isOpen && '-rotate-90')}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div className="space-y-2">
          <p className={NOTE}>{t('fiscal.bad-debt.checklist.description')}</p>
          <ol className="space-y-2">
            {BAD_DEBT_CHECKLIST_STEPS.map((step) => (
              <ChecklistStep key={step} step={step} />
            ))}
          </ol>

          <div className="space-y-1 rounded-lg bg-muted p-3">
            <p className="text-sm font-medium text-foreground">{t('fiscal.bad-debt.aeat.form')}</p>
            <p className={NOTE}>{t('fiscal.bad-debt.aeat.deadline')}</p>
            <p className={NOTE}>{t('fiscal.bad-debt.aeat.deadline-note')}</p>
            <a
              href={BAD_DEBT_AEAT_FORM.PROCEDURE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-guard-primary hover:underline"
            >
              {t('fiscal.bad-debt.aeat.procedure-link')}
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>

          <div className="space-y-1 rounded-lg border border-border px-3 py-2.5">
            <p className="text-sm font-medium text-foreground">{t('fiscal.bad-debt.upward-revision.title')}</p>
            <p className={NOTE}>{t('fiscal.bad-debt.upward-revision.description')}</p>
          </div>
        </div>
      )}
    </section>
  );
}

/** The three steps and their terms, so the calendars below are readable before any invoice is. */
function HowItWorks() {
  const { t } = useTranslate();

  return (
    <section className="space-y-2">
      <h4 className={SECTION_TITLE}>{t('fiscal.bad-debt.how.title')}</h4>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <li className="rounded-lg bg-muted p-3">
          <p className="text-sm font-medium text-foreground">{t('fiscal.bad-debt.how.wait-title')}</p>
          <p className={cn(NOTE, 'mt-1')}>{t('fiscal.bad-debt.how.wait-description')}</p>
        </li>
        <li className="rounded-lg bg-muted p-3">
          <p className="text-sm font-medium text-foreground">{t('fiscal.bad-debt.how.rectify-title')}</p>
          <p className={cn(NOTE, 'mt-1')}>{t('fiscal.bad-debt.how.rectify-description')}</p>
        </li>
        <li className="rounded-lg bg-muted p-3">
          <p className="text-sm font-medium text-foreground">{t('fiscal.bad-debt.how.notify-title')}</p>
          <p className={cn(NOTE, 'mt-1')}>{t('fiscal.bad-debt.how.notify-description')}</p>
        </li>
      </ol>
    </section>
  );
}

export function BadDebtCard() {
  const { t, locale } = useTranslate();
  /** null = follow the data; a boolean once the user has decided for themselves */
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const { data, isLoading, isError } = useBadDebtInvoices();

  const tracked = data?.tracked ?? [];
  const outOfScope = data?.outOfScope ?? [];
  const attentionCount = tracked.filter((invoice) => invoice.needsAttention).length;
  const recoverableCents = tracked.reduce((total, invoice) => total + invoice.vatCents, 0);

  // Opens itself when a window is running out and stays shut otherwise. A card that has to be
  // opened to reveal a deadline about to lapse would be a display, and this is meant to chase;
  // one that is open on a page where the article reaches nothing is just noise on every visit.
  const isOpen = manualOpen ?? attentionCount > 0;

  // Nothing issued and uncollected at all: a different statement from "nothing the article reaches"
  const hasNoUncollected = tracked.length === 0 && outOfScope.length === 0;

  return (
    <div className={cn('card border-l-4', attentionCount > 0 ? 'border-l-guard-warning' : 'border-l-guard-primary')}>
      <button
        type="button"
        onClick={() => setManualOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-baseline justify-between gap-2 text-left"
      >
        <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
          {attentionCount > 0 ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-guard-warning" aria-hidden="true" />
          ) : (
            <Receipt className="h-4 w-4 shrink-0 text-guard-primary" aria-hidden="true" />
          )}
          {t('fiscal.bad-debt.title')}
        </h3>
        <span className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-guard-muted">{t('fiscal.bad-debt.subtitle')}</span>
          <ChevronDown
            className={cn('h-4 w-4 text-guard-muted transition-transform duration-200', !isOpen && '-rotate-90')}
            aria-hidden="true"
          />
        </span>
      </button>

      {/* The count that matters stays visible while the card is closed */}
      {attentionCount > 0 && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-guard-warning">
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t('fiscal.bad-debt.attention.hint', { days: BAD_DEBT_APPROACHING_DAYS })}
        </p>
      )}

      {isOpen && (
        <div className="mt-4 space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-10">
              <LoadingSpinner size="md" label={t('common.loading')} />
            </div>
          )}

          {isError && <p className="py-4 text-sm text-guard-danger">{t('fiscal.errors.load')}</p>}

          {data && (
            <>
              <p className={NOTE}>{t('fiscal.bad-debt.as-of', { date: formatDate(data.asOfDate, 'short', locale) })}</p>
              <p className="text-sm text-guard-muted">{t('fiscal.bad-debt.what-it-is')}</p>

              <HowItWorks />

              {/* An empty list is the expected answer here, so it is stated rather than left blank */}
              {tracked.length === 0 && (
                <section className="space-y-1 rounded-lg border border-border bg-muted/20 px-3 py-3">
                  <p className={cn(SECTION_TITLE, 'inline-flex items-center gap-2')}>
                    <Info className="h-4 w-4 shrink-0 text-guard-muted" aria-hidden="true" />
                    {hasNoUncollected ? t('fiscal.bad-debt.no-invoices.title') : t('fiscal.bad-debt.empty.title')}
                  </p>
                  <p className={NOTE}>
                    {hasNoUncollected
                      ? t('fiscal.bad-debt.no-invoices.description')
                      : t('fiscal.bad-debt.empty.description')}
                  </p>
                </section>
              )}

              {tracked.length > 0 && (
                <section className="space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h4 className={SECTION_TITLE}>{t('fiscal.bad-debt.summary.tracked', { count: tracked.length })}</h4>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {t('fiscal.bad-debt.summary.recoverable', { total: formatCurrency(recoverableCents) })}
                    </span>
                  </div>

                  <p className={NOTE}>{t('fiscal.bad-debt.term-choice')}</p>
                  <p className={NOTE}>{t('fiscal.bad-debt.term-unconfirmed')}</p>
                  <p className={NOTE}>{t('fiscal.bad-debt.pyme-threshold')}</p>

                  <ul className="space-y-3">
                    {tracked.map((invoice) => (
                      <TrackedInvoice key={invoice.invoiceId} invoice={invoice} />
                    ))}
                  </ul>

                  {/* The dates above are counted from the invoice date, which is a proxy for the
                      devengo. Said next to them, not buried in the disclaimer. */}
                  <p className={NOTE}>{t('fiscal.bad-debt.accrual-note')}</p>
                </section>
              )}

              {/* Open when the excluded invoices are the whole answer: they explain the empty list */}
              <ExcludedInvoices invoices={outOfScope} startOpen={tracked.length === 0} />

              <Checklist startOpen={attentionCount > 0} />

              <p className="border-t border-border pt-3 text-xs text-guard-muted">{t('fiscal.bad-debt.disclaimer')}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
