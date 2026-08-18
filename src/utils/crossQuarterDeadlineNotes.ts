/**
 * Cross-quarter findings as a qualifier on a deadline that already exists.
 *
 * The findings themselves (see getCrossQuarterInvoices) are only ever shown on the quarter being
 * *looked at*, which is not where the harm happens: the person about to file the 303 or the 130
 * is reading the deadline surface, not browsing a past quarter. This carries the finding there.
 *
 * It is a qualifier and never an obligation of its own. Nothing new falls due because an invoice
 * was collected in another quarter, so no deadline entry is created — computeDeadlines() stays the
 * only source of what is owed and when, and the filing-status machine keeps reading a calendar
 * nobody has added invented rows to.
 *
 * Pure on purpose, like fiscalDeadlines.ts: the caller does the reading and passes the invoices in.
 * That is what keeps both files testable without a database and free of a query per deadline.
 */

import type { CrossQuarterCase, FilingStatus, ModeloType } from '@/constants/finance';
import {
  CROSS_QUARTER_DATA_INTEGRITY_CASES,
  CROSS_QUARTER_DEADLINE_FILING_STATUSES,
  CROSS_QUARTER_DEADLINE_MODELOS,
} from '@/constants/finance';
import type { CrossQuarterDeadlineNote, CrossQuarterInvoice, FiscalDeadline } from '@/types/finance';

// Widened once, here, so every membership check below reads as a plain `.includes()`
const NOTE_MODELOS: readonly ModeloType[] = CROSS_QUARTER_DEADLINE_MODELOS;
const NOTE_STATUSES: readonly FilingStatus[] = CROSS_QUARTER_DEADLINE_FILING_STATUSES;
const DATA_INTEGRITY_CASES: readonly CrossQuarterCase[] = CROSS_QUARTER_DATA_INTEGRITY_CASES;

/**
 * Whether this deadline is one a cross-quarter finding may qualify.
 *
 * Three conditions, all of them narrowing: the modelo must be quarterly-scoped (the annual 390 and
 * 100 span every quarter, so a quarter boundary moves nothing for them), the filing must be one the
 * user is about to make, and the entry must actually name a quarter.
 */
export function acceptsCrossQuarterNote(deadline: FiscalDeadline): boolean {
  return (
    deadline.fiscalQuarter !== null &&
    NOTE_MODELOS.includes(deadline.modeloType) &&
    NOTE_STATUSES.includes(deadline.status)
  );
}

/**
 * The quarters worth querying for a set of deadlines: distinct, ascending, and empty whenever
 * nothing is about to be filed — a year with no imminent filing costs no round trip at all.
 */
export function getCrossQuarterNoteQuarters(deadlines: FiscalDeadline[]): number[] {
  const quarters = deadlines.flatMap((deadline) =>
    acceptsCrossQuarterNote(deadline) && deadline.fiscalQuarter !== null ? [deadline.fiscalQuarter] : [],
  );
  return [...new Set(quarters)].sort((a, b) => a - b);
}

/**
 * The note for one quarter, or null when that quarter has nothing to say.
 *
 * Returning null rather than a zeroed note is the whole point: a qualifier that is always on screen
 * is a qualifier the user stops seeing, and the usual quarter is the one where devengo and cobro
 * agree.
 */
export function buildCrossQuarterNote(
  fiscalYear: number,
  fiscalQuarter: number,
  invoices: CrossQuarterInvoice[],
): CrossQuarterDeadlineNote | null {
  if (invoices.length === 0) return null;

  return {
    fiscalYear,
    fiscalQuarter,
    invoiceCount: invoices.length,
    totalCents: invoices.reduce((sum, invoice) => sum + invoice.totalCents, 0),
    dataIntegrityCount: invoices.filter((invoice) => DATA_INTEGRITY_CASES.includes(invoice.crossQuarterCase)).length,
  };
}

/**
 * Attach each note to the deadlines it qualifies. A deadline with no note keeps its own identity —
 * `crossQuarter` is left absent rather than set to null, so nothing downstream has to distinguish
 * "no findings" from "not looked up".
 */
export function withCrossQuarterNotes(
  deadlines: FiscalDeadline[],
  notes: CrossQuarterDeadlineNote[],
): FiscalDeadline[] {
  if (notes.length === 0) return deadlines;

  return deadlines.map((deadline) => {
    if (!acceptsCrossQuarterNote(deadline)) return deadline;
    const note = notes.find(
      (candidate) => candidate.fiscalYear === deadline.fiscalYear && candidate.fiscalQuarter === deadline.fiscalQuarter,
    );
    return note ? { ...deadline, crossQuarter: note } : deadline;
  });
}
