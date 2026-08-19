/**
 * Editable draft of an AEAT deferral resolution, and the movements it will book.
 *
 * The confirm screen edits strings — that is what an `<input>` holds — while everything downstream
 * (verification, payload) works in integer cents. This module is the single conversion between the
 * two, so no component has to reason about a half-typed amount.
 *
 * **Nothing here derives a split.** The drafts start as the letter was read and are only ever
 * corrected by the human against the printed page: AEAT loads the rounding remainder onto the last
 * fracción (781,66 ×5 then 781,69), so recomputing an even split is wrong by up to three cents per
 * instalment — the very error this module exists to stop.
 */

import type { DeferralPart, FiscalQuarter, ModeloType } from '@/constants/finance';
import { DEFERRAL_PART } from '@/constants/finance';
import type { CreateDeferralPayload } from '@/hooks/useDeferrals';
import { quarterMatchesModelo } from '@/schemas/deferral';
import type { DeferralFraccion, DeferralTotals, ExtractedDeferralData } from '@/types/finance';
import { deferralTotals, type VerifiableDeferral } from '@/utils/deferral';
import { centsToEuros, eurosToCents } from '@/utils/money';

/** One row of ANEXO I while it is being reviewed. Amounts are euro strings, as typed. */
export interface DeferralFraccionDraft {
  fraccionNumber: number;
  principal: string;
  surcharge: string;
  interest: string;
  /** "Total del plazo" as printed. Edited, never filled in: it is what catches a misread digit */
  total: string;
  /** "Fecha de vencimiento", 'YYYY-MM-DD' */
  dueDate: string;
}

/** Everything of a row the confirm screen lets the user correct — the number itself is fixed. */
export type EditableFraccionField = Exclude<keyof DeferralFraccionDraft, 'fraccionNumber'>;

/** The header of the resolution while it is being reviewed. */
export interface DeferralHeaderDraft {
  expedienteNumber: string;
  /** Empty while the reader could not tell which modelo the concepto refers to */
  modeloType: ModeloType | '';
  fiscalYear: number;
  fiscalQuarter: FiscalQuarter | null;
  liquidacionNumber: string;
  /** "Fecha de Intereses": the last day of the periodo voluntario. Interest runs from the day AFTER */
  interestStartDate: string;
  interestRatePercent: string;
  /** The three figures of the TOTAL GENERAL row, in euros */
  principal: string;
  surcharge: string;
  interest: string;
}

/** One pending movement a fracción will produce: its part, its amount and its vencimiento. */
export interface DeferralMovement {
  fraccionNumber: number;
  part: DeferralPart;
  amountCents: number;
  dueDate: string;
}

/** An amount as an `<input type="number">` wants it: a dot decimal mark and always two decimals. */
function toEuroInput(cents: number | null): string {
  return cents === null ? '' : centsToEuros(cents).toFixed(2);
}

/**
 * Euros as typed → cents, or null when the field does not hold a number.
 *
 * A blank field is null rather than zero: it is a value the user has still to supply, and quietly
 * booking a zero recargo the letter never printed is exactly the kind of silence this module avoids.
 */
export function parseEuros(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const euros = Number(trimmed);
  return Number.isFinite(euros) && euros >= 0 ? eurosToCents(euros) : null;
}

/** Tipo de interés de demora as typed → percent, or null. Always between 0 and 100 (e.g. 4.062). */
export function parseRate(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const rate = Number(trimmed);
  return Number.isFinite(rate) && rate > 0 && rate <= 100 ? rate : null;
}

/** Current year, used when the reader could not derive the period the letter defers. */
function currentYear(): number {
  return new Date().getFullYear();
}

/** Turn a freshly read letter into the draft the confirm screen edits. */
export function toHeaderDraft(extracted: ExtractedDeferralData): DeferralHeaderDraft {
  return {
    expedienteNumber: extracted.expedienteNumber ?? '',
    modeloType: extracted.modeloType ?? '',
    fiscalYear: extracted.fiscalYear ?? currentYear(),
    fiscalQuarter: extracted.fiscalQuarter,
    liquidacionNumber: extracted.liquidacionNumber ?? '',
    interestStartDate: extracted.interestStartDate ?? '',
    interestRatePercent: extracted.interestRatePercent === null ? '' : String(extracted.interestRatePercent),
    principal: toEuroInput(extracted.principalCents),
    surcharge: toEuroInput(extracted.surchargeCents),
    interest: toEuroInput(extracted.interestCents),
  };
}

/** Same for ANEXO I, row by row and in printed order. */
export function toFraccionDrafts(fracciones: readonly DeferralFraccion[]): DeferralFraccionDraft[] {
  return fracciones.map((fraccion) => ({
    fraccionNumber: fraccion.fraccionNumber,
    principal: toEuroInput(fraccion.principalCents),
    surcharge: toEuroInput(fraccion.surchargeCents),
    interest: toEuroInput(fraccion.interestCents),
    total: toEuroInput(fraccion.totalCents),
    dueDate: fraccion.dueDate,
  }));
}

/**
 * A draft row read as a fracción, with an unparseable field taken as zero.
 *
 * The zero is for the verification only, never for the payload: a row that does not parse makes
 * {@link buildCreatePayload} return null, so nothing half-typed can be stored. Reading it as zero
 * meanwhile is what turns a cleared field into a visible finding instead of a silent one.
 */
export function draftToFraccion(draft: DeferralFraccionDraft): DeferralFraccion {
  return {
    fraccionNumber: draft.fraccionNumber,
    principalCents: parseEuros(draft.principal) ?? 0,
    surchargeCents: parseEuros(draft.surcharge) ?? 0,
    interestCents: parseEuros(draft.interest) ?? 0,
    totalCents: parseEuros(draft.total) ?? 0,
    dueDate: draft.dueDate,
  };
}

/** The draft rows added up, for the footer of the table. Compared with the letter, never merged into it. */
export function deferralTotalsOfDrafts(drafts: readonly DeferralFraccionDraft[]): DeferralTotals {
  return deferralTotals(drafts.map(draftToFraccion));
}

/** The whole draft in the shape `verifyDeferral()` checks: declared totals plus every row. */
export function toVerifiable(header: DeferralHeaderDraft, fracciones: readonly DeferralFraccion[]): VerifiableDeferral {
  return {
    interestStartDate: header.interestStartDate === '' ? null : header.interestStartDate,
    interestRatePercent: parseRate(header.interestRatePercent),
    principalCents: parseEuros(header.principal),
    surchargeCents: parseEuros(header.surcharge),
    interestCents: parseEuros(header.interest),
    fracciones,
  };
}

/** The three parts of a fracción, in the order ANEXO I prints its columns. */
const PART_AMOUNTS = [
  [DEFERRAL_PART.PRINCIPAL, 'principalCents'],
  [DEFERRAL_PART.SURCHARGE, 'surchargeCents'],
  [DEFERRAL_PART.INTEREST, 'interestCents'],
] as const;

/**
 * The pending movements a resolution books: one per part of each fracción that carries an amount.
 *
 * A part printed as 0,00 books nothing — the recargo column is zero on every letter read so far,
 * and a run of empty movements would only be noise to reconcile against a bank statement. The
 * parts that do exist are kept apart because they are three different things: the principal is the
 * tax itself and no expense at all, the recargo is expressly non-deductible (art. 15.c LIS), and
 * only the intereses de demora are deductible — as a financial expense, casilla 0203.
 */
export function deferralMovements(fracciones: readonly DeferralFraccion[]): DeferralMovement[] {
  return fracciones.flatMap((fraccion) =>
    PART_AMOUNTS.flatMap(([part, field]) =>
      fraccion[field] > 0
        ? [{ fraccionNumber: fraccion.fraccionNumber, part, amountCents: fraccion[field], dueDate: fraccion.dueDate }]
        : [],
    ),
  );
}

/** Whether every amount of a row parses. A row that does not is what blocks the payload. */
function isFraccionDraftComplete(draft: DeferralFraccionDraft): boolean {
  return (
    parseEuros(draft.principal) !== null &&
    parseEuros(draft.surcharge) !== null &&
    parseEuros(draft.interest) !== null &&
    parseEuros(draft.total) !== null &&
    draft.dueDate !== ''
  );
}

/**
 * The body of `POST /api/fiscal/deferrals`, or null while the draft is not yet complete.
 *
 * Null is the only gate the confirm screen needs: it means a field is blank or does not hold a
 * number, never that the letter disagrees with itself. A disagreement is shown as a verdict and
 * left to the human — `CreateDeferralSchema` is the one that refuses to store it.
 */
export function buildCreatePayload(
  header: DeferralHeaderDraft,
  drafts: readonly DeferralFraccionDraft[],
): CreateDeferralPayload | null {
  const principalCents = parseEuros(header.principal);
  const surchargeCents = parseEuros(header.surcharge);
  const interestCents = parseEuros(header.interest);
  const interestRatePercent = parseRate(header.interestRatePercent);

  const isComplete =
    header.expedienteNumber.trim() !== '' &&
    header.modeloType !== '' &&
    header.interestStartDate !== '' &&
    interestRatePercent !== null &&
    principalCents !== null &&
    surchargeCents !== null &&
    interestCents !== null &&
    drafts.length > 0 &&
    drafts.every(isFraccionDraftComplete) &&
    // The same rule CreateDeferralSchema and CK_Deferrals_Quarter enforce. Without it the wizard
    // let an annual modelo keep a quarter — the extractor nulls the two independently, and the
    // only code reconciling them fires on a change event that re-picking the same modelo never
    // emits — so the payload built, the wizard advanced, and the server refused at the last step
    // with the quarter <Select> disabled and no way back.
    quarterMatchesModelo(header.modeloType, header.fiscalQuarter);

  if (!isComplete || header.modeloType === '') return null;

  return {
    expedienteNumber: header.expedienteNumber.trim(),
    modeloType: header.modeloType,
    fiscalYear: header.fiscalYear,
    fiscalQuarter: header.fiscalQuarter,
    liquidacionNumber: header.liquidacionNumber.trim() === '' ? null : header.liquidacionNumber.trim(),
    interestStartDate: header.interestStartDate,
    interestRatePercent,
    principalCents,
    surchargeCents,
    interestCents,
    fiscalDocumentId: null,
    fracciones: drafts.map(draftToFraccion),
  };
}
