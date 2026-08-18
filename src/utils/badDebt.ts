/**
 * Créditos incobrables (art. 80.Cuatro LIVA) — the gate and the clock
 *
 * Pure functions: no database, no side effects, no clock of their own (`asOfDate` is always
 * passed in). Nothing here issues a factura rectificativa, files a modelo 952 or touches an
 * invoice's status — this computes *when* the right may be exercised and *whether* the article
 * reaches the invoice at all.
 *
 * Vigencia verified on 18-ago-2026 against the BOE consolidated texts: art. 80 LIVA as in force
 * since 1-1-2023 (art. 77 Ley 31/2022, BOE-A-2022-22128) and art. 24 RIVA as in force since
 * 1-1-2024 (art. 1.4 RD 1171/2023, BOE-A-2023-26454). The legal constants live in
 * `@/constants/finance`; this file is only the arithmetic over them.
 */

import {
  BAD_DEBT_APPROACHING_DAYS,
  BAD_DEBT_EXCLUSION,
  BAD_DEBT_RECTIFICATION_WINDOW_MONTHS,
  BAD_DEBT_STAGE,
  BAD_DEBT_WAITING_TERM_MONTHS,
  BAD_DEBT_WAITING_TERM_OPTIONS,
  INVOICE_STATUS,
  ISSUED_INVOICE_STATUSES,
  SPANISH_ESTABLISHMENT_COUNTRY_TOKENS,
} from '@/constants/finance';
import type { BadDebtExclusion, BadDebtStage, BadDebtWaitingTerm, BadDebtWindow, InvoiceStatus } from '@/types/finance';

const MS_PER_DAY = 86_400_000;

/** 'YYYY-MM-DD' → its three numbers, rejecting anything that is not a real calendar day. */
function parseIsoDay(isoDay: string): [year: number, month: number, day: number] {
  const [year, month, day] = isoDay.split('-').map(Number);

  if (!year || !month || !day || month > 12 || day > 31) {
    throw new Error(`Invalid ISO day: ${isoDay}`);
  }

  return [year, month, day];
}

function toIsoDay(utcDate: Date): string {
  return utcDate.toISOString().slice(0, 10);
}

/**
 * Add whole months to a day, «de fecha a fecha».
 *
 * When the target month has no equivalent day the term expires on its last day — art. 5.1 del
 * Código Civil, which is the rule every plazo por meses of the LIVA is computed under. So a
 * devengo of 31-ago-2026 plus six months is 28-feb-2027, not 3-mar-2027: overshooting the month
 * would hand the user a deadline later than the one the law gives them.
 *
 * Computed in UTC on purpose: these are calendar days, and a local-time Date crossing a DST
 * boundary can land an hour short and lose a day on the way back to a string.
 */
export function addMonthsToIsoDay(isoDay: string, months: number): string {
  const [year, month, day] = parseIsoDay(isoDay);

  const firstOfTargetMonth = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDayOfTargetMonth = new Date(
    Date.UTC(firstOfTargetMonth.getUTCFullYear(), firstOfTargetMonth.getUTCMonth() + 1, 0),
  ).getUTCDate();

  firstOfTargetMonth.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return toIsoDay(firstOfTargetMonth);
}

/** Whole calendar days from one day to another; negative when `toIsoDay` is the earlier one. */
export function daysBetweenIsoDays(fromIsoDay: string, toIsoDay: string): number {
  const [fromYear, fromMonth, fromDay] = parseIsoDay(fromIsoDay);
  const [toYear, toMonth, toDay] = parseIsoDay(toIsoDay);

  return Math.round((Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / MS_PER_DAY);
}

/**
 * Whether the invoice snapshot places the recipient inside Spanish territory for the purposes of
 * art. 80.Cinco.2.ª, which names the TAI, Canarias, Ceuta and Melilla — all four are Spain, so a
 * country field is enough to decide it.
 *
 * Compared lowercased and stripped of accents so 'España', 'ESPAÑA' and 'es' all agree. NULL,
 * empty and anything unrecognised return false: the gate above is fail-closed and this function
 * must never be the place that guesses.
 */
export function isEstablishedInSpain(clientCountry: string | null): boolean {
  if (clientCountry === null) return false;

  const normalized = clientCountry
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();

  return SPANISH_ESTABLISHMENT_COUNTRY_TOKENS.some((token) => token === normalized);
}

/** What the gate needs to know about an invoice. Everything comes from the frozen snapshot. */
export interface BadDebtGateInput {
  status: InvoiceStatus;
  /** True when "Invoices"."TransactionID" points at a payment movement */
  hasLinkedMovement: boolean;
  /** The cuota repercutida in cents */
  vatCents: number;
  vatPercent: number;
  /** "ClientCountry" from the snapshot; null decides nothing and therefore closes the gate */
  clientCountry: string | null;
}

/**
 * Why art. 80.Cuatro does not reach an invoice, or null when the clock runs.
 *
 * FAIL-CLOSED, and the order is the narrative order, not a ranking: first the structural
 * questions (is this an issued, uncollected invoice at all), then the two independent grounds on
 * which the article itself stops. Several can be true at once — DW-09 is out on NO_OUTPUT_VAT and
 * on RECIPIENT_NOT_ESTABLISHED — and only the first is reported, because the copy has one slot.
 *
 * COLLECTED reads the status as well as the link, in step with the cross-quarter classification:
 * a 'paid' invoice whose "TransactionID" was lost was still collected. The app not knowing *when*
 * is a data-integrity finding, and it is emphatically not an impagado.
 *
 * NOT_ISSUED and COLLECTED cannot fire on what `getBadDebtReport()` selects; they are here so the
 * function is total and so the gate, not the WHERE clause, is what decides.
 */
export function resolveBadDebtExclusion(input: BadDebtGateInput): BadDebtExclusion | null {
  const issued = ISSUED_INVOICE_STATUSES.some((status) => status === input.status);
  if (!issued) return BAD_DEBT_EXCLUSION.NOT_ISSUED;

  if (input.status === INVOICE_STATUS.PAID || input.hasLinkedMovement) return BAD_DEBT_EXCLUSION.COLLECTED;

  // art. 80.Cuatro reduces the base of «las cuotas repercutidas por las operaciones gravadas».
  // With no cuota there is nothing to recover: a rectificativa would move 0,00 € in the 303 and
  // no right lapses by letting the window close. This is the ground DW-09 is out on.
  if (input.vatPercent <= 0 || input.vatCents <= 0) return BAD_DEBT_EXCLUSION.NO_OUTPUT_VAT;

  // art. 80.Cinco.2.ª. Art. 24.2.a).2.º RIVA makes the acreedor declare expressly that the
  // operation is not one whose destinatario is unestablished, so a 952 filed here would be false.
  if (input.clientCountry === null || input.clientCountry.trim() === '') {
    return BAD_DEBT_EXCLUSION.RECIPIENT_ESTABLISHMENT_UNKNOWN;
  }
  if (!isEstablishedInSpain(input.clientCountry)) return BAD_DEBT_EXCLUSION.RECIPIENT_NOT_ESTABLISHED;

  return null;
}

function resolveStage(asOfDate: string, windowStartDate: string, windowEndDate: string): BadDebtStage {
  if (asOfDate < windowStartDate) return BAD_DEBT_STAGE.WAITING;
  return asOfDate <= windowEndDate ? BAD_DEBT_STAGE.IN_WINDOW : BAD_DEBT_STAGE.WINDOW_EXPIRED;
}

/**
 * One term's window on one invoice.
 *
 *   windowStartDate = devengo + 6 or 12 months   [art. 80.Cuatro.A).1.ª]
 *   windowEndDate   = windowStartDate + 6 months [art. 80.Cuatro.B)]
 *
 * Both ends are inclusive. The waiting term is «un año desde el devengo sin haber obtenido el
 * cobro», so on its anniversary the year has elapsed and the rectificativa may be issued; and the
 * closing day is the last day of a plazo de caducidad, not the first day after it. On that last
 * day `daysRemainingInWindow` is 0 — still open, and out of time.
 */
export function computeBadDebtWindow(accrualDate: string, term: BadDebtWaitingTerm, asOfDate: string): BadDebtWindow {
  const waitingMonths = BAD_DEBT_WAITING_TERM_MONTHS[term];
  const windowStartDate = addMonthsToIsoDay(accrualDate, waitingMonths);
  const windowEndDate = addMonthsToIsoDay(windowStartDate, BAD_DEBT_RECTIFICATION_WINDOW_MONTHS);
  const stage = resolveStage(asOfDate, windowStartDate, windowEndDate);

  return {
    term,
    waitingMonths,
    windowStartDate,
    windowEndDate,
    stage,
    daysUntilWindowStart: stage === BAD_DEBT_STAGE.WAITING ? daysBetweenIsoDays(asOfDate, windowStartDate) : null,
    daysRemainingInWindow: stage === BAD_DEBT_STAGE.IN_WINDOW ? daysBetweenIsoDays(asOfDate, windowEndDate) : null,
  };
}

/**
 * Both windows, shortest term first.
 *
 * Which term applies is the taxpayer's option (art. 80.Cuatro.A).1.ª, «podrá ser, de seis meses o
 * un año») and nothing in the data model records the choice, so the app presents two labelled
 * alternatives rather than picking one. That the two windows are contiguous — and therefore that
 * a PYME who lets the six-month one lapse still has the one-year one — is NOT CONFIRMED by any
 * DGT ruling found, which is exactly why neither is dropped.
 */
export function computeBadDebtWindows(accrualDate: string, asOfDate: string): BadDebtWindow[] {
  return BAD_DEBT_WAITING_TERM_OPTIONS.map((term) => computeBadDebtWindow(accrualDate, term, asOfDate));
}

/**
 * Whether any window is open or opens within {@link BAD_DEBT_APPROACHING_DAYS}.
 *
 * An expired window is deliberately not attention-worthy: for that term the right is already
 * gone, and the invoice stays listed so the loss is visible, not so it can be chased.
 */
export function hasBadDebtAttention(windows: BadDebtWindow[]): boolean {
  return windows.some(
    (window) =>
      window.stage === BAD_DEBT_STAGE.IN_WINDOW ||
      (window.daysUntilWindowStart !== null && window.daysUntilWindowStart <= BAD_DEBT_APPROACHING_DAYS),
  );
}
