/**
 * GET /api/fiscal/deadlines — Server-computed AEAT deadlines for a year
 * All deadline logic runs on the server. The frontend only consumes pre-computed data.
 */

import { AnnualFiscalFiltersSchema } from '@/schemas/fiscal';
import { validateRequest } from '@/schemas/transaction';
import { getDeadlineSettings, getFiledModelos } from '@/services/database/FiscalDocumentRepository';
import { getCrossQuarterInvoices } from '@/services/database/InvoiceRepository';
import type { FiscalDeadline } from '@/types/finance';
import { validationError, withApiHandler } from '@/utils/apiHandler';
import {
  buildCrossQuarterNote,
  getCrossQuarterNoteQuarters,
  withCrossQuarterNotes,
} from '@/utils/crossQuarterDeadlineNotes';
import { computeDeadlines, getActiveDeadlines, getCarryOverDeadlines } from '@/utils/fiscalDeadlines';

/** Nothing filed. Used to probe a year cheaply before deciding whether it is worth a query. */
const NOTHING_FILED = new Set<string>();

/**
 * Attach the cross-quarter findings of `fiscalYear` to the deadlines it is about to have filed.
 *
 * One query per quarter that actually has an imminent 303 or 130 — usually one, often none, and
 * never one per deadline: both modelos of a quarter share a single lookup.
 */
async function annotateWithCrossQuarter(deadlines: FiscalDeadline[], fiscalYear: number): Promise<FiscalDeadline[]> {
  const quarters = getCrossQuarterNoteQuarters(deadlines);
  const notes = await Promise.all(
    quarters.map(async (quarter) =>
      buildCrossQuarterNote(fiscalYear, quarter, await getCrossQuarterInvoices(fiscalYear, quarter)),
    ),
  );

  return withCrossQuarterNotes(
    deadlines,
    notes.flatMap((note) => (note === null ? [] : [note])),
  );
}

/**
 * The previous fiscal year's filings that are still open — Q4's 303/130 and the 390 in January,
 * the Modelo 100 during the Renta campaign. See getCarryOverDeadlines for why the current calendar
 * year alone leaves the banner blank on exactly those days.
 *
 * Probed against an empty filed set first: that can only over-report, so when even it finds no open
 * window there is nothing to read. On most days of the year this costs zero queries.
 */
async function loadCarryOverDeadlines(fiscalYear: number, reminderDaysBefore: number): Promise<FiscalDeadline[]> {
  const candidates = getCarryOverDeadlines(computeDeadlines(fiscalYear, NOTHING_FILED, reminderDaysBefore));
  if (candidates.length === 0) return [];

  const filedSet = await getFiledModelos(fiscalYear);
  return getCarryOverDeadlines(computeDeadlines(fiscalYear, filedSet, reminderDaysBefore));
}

export const GET = withApiHandler(async (request) => {
  const { searchParams } = new URL(request.url);
  const onlyActive = searchParams.get('active') === 'true';

  // Default to current year if not provided
  const yearParam = searchParams.get('year') || String(new Date().getFullYear());
  const validation = validateRequest(AnnualFiscalFiltersSchema, { year: yearParam });
  if (!validation.success) return validationError(validation.errors);

  const { year } = validation.data;

  // Fetch settings and filed modelos in parallel
  const [settings, filedSet] = await Promise.all([getDeadlineSettings(), getFiledModelos(year)]);

  const deadlines = computeDeadlines(year, filedSet, settings.reminderDaysBefore);

  // A cross-quarter finding is not a deadline — it qualifies the 303/130 the user is about to
  // file. Only the quarters of those filings are read, so a year with nothing imminent adds no
  // query, and a quarter whose devengo and cobro agree adds no note.
  const annotated = await annotateWithCrossQuarter(deadlines, year);

  // The year view answers for the year it was asked about, and nothing else: adding another year's
  // rows to it would contradict its own meta.year and the selector the user just moved.
  if (!onlyActive) {
    return { data: annotated, meta: { year, reminderDaysBefore: settings.reminderDaysBefore } };
  }

  // The active view answers "what is owed now", and in January or in May that is last year's
  // filing. It leads the list because it is the one running out.
  const carryOver = await loadCarryOverDeadlines(year - 1, settings.reminderDaysBefore);

  return {
    data: [...(await annotateWithCrossQuarter(carryOver, year - 1)), ...getActiveDeadlines(annotated)],
    meta: { year, reminderDaysBefore: settings.reminderDaysBefore },
  };
}, 'GET /api/fiscal/deadlines');
