'use client';

/**
 * The cross-quarter qualifier, as it appears wherever a deadline is shown.
 *
 * Shared by the dashboard banner and the fiscal page's deadline list so the wording of a finding
 * cannot drift between the two surfaces that carry it.
 *
 * Deliberately quiet — no warning colour, no icon of alarm. Nothing here is an error: the models
 * are already computed on the devengo, so the figures about to be filed are right. The note exists
 * because the human step afterwards is where the damage happens, when someone reasons from the
 * bank statement and overwrites a correct figure. It says what is crossing, why the figure stands
 * anyway, and where to look.
 *
 * It renders only when the API attached a note, which only happens for a 303/130 whose quarter
 * actually has findings. A qualifier that is always on screen is a qualifier nobody reads.
 */

import { ArrowRight, CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { CROSS_QUARTER_PANEL_ANCHOR } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import type { CrossQuarterDeadlineNote } from '@/types/finance';
import { cn } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface DeadlineCrossQuarterNoteProps {
  note: CrossQuarterDeadlineNote;
  className?: string;
}

export function DeadlineCrossQuarterNote({ note, className }: DeadlineCrossQuarterNoteProps) {
  const { t } = useTranslate();

  // Literal keys throughout, so ui-translation-keys.test.ts can see them. The dictionary has no
  // plural support, and "1 facturas" inside a note about being accurate would undo the note.
  const summary =
    note.invoiceCount === 1
      ? t('fiscal.deadlines.cross-quarter.summary-one', { total: formatCurrency(note.totalCents) })
      : t('fiscal.deadlines.cross-quarter.summary', {
          count: note.invoiceCount,
          total: formatCurrency(note.totalCents),
        });

  const dataIntegrity =
    note.dataIntegrityCount === 1
      ? t('fiscal.deadlines.cross-quarter.data-integrity-one')
      : t('fiscal.deadlines.cross-quarter.data-integrity', { count: note.dataIntegrityCount });

  return (
    <div className={cn('space-y-1 text-xs text-guard-muted', className)}>
      <p className="flex items-start gap-1.5 font-medium text-foreground/80">
        <CalendarClock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{summary}</span>
      </p>

      {/* The reason the figure above it stands. Without this the count reads as an error report */}
      <p className="pl-5">{t('fiscal.deadlines.cross-quarter.hint')}</p>

      {/* A lost link is a different kind of finding — a broken record, not a timing disagreement —
          so it gets its own sentence instead of disappearing into the count */}
      {note.dataIntegrityCount > 0 && <p className="pl-5">{dataIntegrity}</p>}

      <Link
        href={`/fiscal?year=${note.fiscalYear}&quarter=${note.fiscalQuarter}#${CROSS_QUARTER_PANEL_ANCHOR}`}
        className={cn(
          'group ml-5 inline-flex items-center gap-1 underline underline-offset-2',
          'hover:text-foreground transition-colors duration-200',
        )}
      >
        {t('fiscal.deadlines.cross-quarter.link', { quarter: note.fiscalQuarter, year: note.fiscalYear })}
        <ArrowRight
          className="h-3 w-3 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </Link>
    </div>
  );
}
