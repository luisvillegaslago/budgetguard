/**
 * BudgetGuard Deferral (aplazamiento/fraccionamiento) Schemas
 *
 * Shared validation for the confirm screen and the API route.
 *
 * **Amounts arrive in CENTS here, unlike every other module.** Elsewhere a form is filled by a
 * human typing euros, so the schema takes euros and the route edge converts. This payload is not
 * typed by anyone: it is a machine reading a printed table, already whole cents by the time it is
 * proposed. Converting through a float would only invent a rounding step that the document does
 * not have — and the cents of these letters are the whole point, since AEAT loads the rounding
 * remainder onto the last fracción (781,66 ×5 then 781,69). There is no euro edge to convert.
 *
 * Nothing here recomputes an amount. The refinements below only check the letter against itself:
 * each fracción against its own printed total, and the fracciones against the printed totals row.
 */

import { z } from 'zod';
import {
  DEFERRAL_MAX_FRACCIONES,
  FISCAL_QUARTER,
  MODELO_TYPE,
  type ModeloType,
  VALIDATION_KEY,
} from '@/constants/finance';
import { requiredPositiveInt } from '@/schemas/shared';

/** Sanity ceiling for any single figure, in cents (10.000.000 €). */
const MAX_DEFERRAL_CENTS = 1_000_000_000;

/** Length of the expediente and liquidación identifiers as AEAT prints them, with headroom. */
const MAX_REFERENCE_LENGTH = 30;

/**
 * A monetary field already in cents.
 *
 * Deliberately not `z.coerce.number()`: a string arriving here means the extractor emitted "781,66"
 * instead of 78166, and coercion would turn that into 781 cents without a word. It must fail.
 */
function centsField(messageKey: string) {
  return z
    .number({ required_error: messageKey, invalid_type_error: messageKey })
    .int(messageKey)
    .nonnegative(messageKey)
    .max(MAX_DEFERRAL_CENTS, VALIDATION_KEY.AMOUNT_TOO_LARGE);
}

/** Same, for a figure that may not be zero: a deferral with no principal defers nothing. */
function positiveCentsField(messageKey: string) {
  return z
    .number({ required_error: messageKey, invalid_type_error: messageKey })
    .int(messageKey)
    .positive(messageKey)
    .max(MAX_DEFERRAL_CENTS, VALIDATION_KEY.AMOUNT_TOO_LARGE);
}

/** The modelo being deferred. Every letter read so far is a Modelo 130. */
export const DeferralModeloSchema = z.enum([MODELO_TYPE.M303, MODELO_TYPE.M130, MODELO_TYPE.M390, MODELO_TYPE.M100]);

const fraccionFields = {
  /** 1..N, in the order ANEXO I prints the rows */
  fraccionNumber: requiredPositiveInt(VALIDATION_KEY.FRACCION_SEQUENCE_INVALID),
  /** Read from this row, never divided out of the total: AEAT does not keep it constant */
  principalCents: centsField(VALIDATION_KEY.AMOUNT_NON_NEGATIVE),
  /** Recargo de apremio of this fracción — its own column, non-deductible (art. 15.c LIS) */
  surchargeCents: centsField(VALIDATION_KEY.AMOUNT_NON_NEGATIVE).default(0),
  /** Intereses de demora of this fracción — the only deductible part (casilla 0203) */
  interestCents: centsField(VALIDATION_KEY.AMOUNT_NON_NEGATIVE),
  /** "Total del plazo", as printed. Required rather than derived — see the refinement below */
  totalCents: centsField(VALIDATION_KEY.AMOUNT_NON_NEGATIVE),
  /** "Fecha de vencimiento" of this fracción */
  dueDate: z.coerce.date({ message: VALIDATION_KEY.INVALID_DATE }),
};

/**
 * `totalCents` is redundant on purpose: it is the figure printed in the letter, and requiring it
 * turns a misread digit into a rejected payload instead of a silently absorbed one. It is checked,
 * never filled in — computing it would make the extractor's mistakes invisible.
 */
function fraccionAddsUp(fraccion: {
  principalCents: number;
  surchargeCents: number;
  interestCents: number;
  totalCents: number;
}): boolean {
  return fraccion.principalCents + fraccion.surchargeCents + fraccion.interestCents === fraccion.totalCents;
}

/** One row of ANEXO I. */
export const DeferralFraccionSchema = z.object(fraccionFields).refine(fraccionAddsUp, {
  message: VALIDATION_KEY.FRACCION_TOTAL_MISMATCH,
  path: ['totalCents'],
});

export type DeferralFraccionInput = z.infer<typeof DeferralFraccionSchema>;

const deferralHeaderFields = {
  /** AEAT's identifier for the resolution, e.g. '282640560363H'. Unique per user */
  expedienteNumber: z
    .string()
    .trim()
    .min(1, VALIDATION_KEY.EXPEDIENTE_REQUIRED)
    .max(MAX_REFERENCE_LENGTH, VALIDATION_KEY.EXPEDIENTE_TOO_LONG),
  modeloType: DeferralModeloSchema,
  /** The period being deferred, not the date of the letter */
  fiscalYear: z.number().int().min(2019).max(2100),
  fiscalQuarter: z.nativeEnum(FISCAL_QUARTER).optional().nullable(),
  liquidacionNumber: z
    .string()
    .trim()
    .max(MAX_REFERENCE_LENGTH, VALIDATION_KEY.LIQUIDACION_TOO_LONG)
    .optional()
    .nullable(),
  /** "Fecha de Intereses": the last day of the periodo voluntario. Interest runs from the day AFTER */
  interestStartDate: z.coerce.date({ message: VALIDATION_KEY.INVALID_DATE }),
  /** Interés de demora of the resolution, e.g. 4.062 */
  interestRatePercent: z
    .number({
      required_error: VALIDATION_KEY.INVALID_INTEREST_RATE,
      invalid_type_error: VALIDATION_KEY.INVALID_INTEREST_RATE,
    })
    .positive(VALIDATION_KEY.INVALID_INTEREST_RATE)
    .max(100, VALIDATION_KEY.INVALID_INTEREST_RATE),
  /** Totals row of ANEXO I: the tax itself, which is no expense at all */
  principalCents: positiveCentsField(VALIDATION_KEY.AMOUNT_POSITIVE),
  surchargeCents: centsField(VALIDATION_KEY.AMOUNT_NON_NEGATIVE).default(0),
  interestCents: centsField(VALIDATION_KEY.AMOUNT_NON_NEGATIVE),
  /** The archived letter in "FiscalDocuments", when it has already been uploaded */
  fiscalDocumentId: z.number().int().positive().optional().nullable(),
};

const DeferralHeaderObjectSchema = z.object(deferralHeaderFields);

/**
 * Annual modelos (390, 100) carry no quarter; the quarterly ones (303, 130) must.
 * Same rule as "FiscalDocuments" and as the CK_Deferrals_Quarter constraint.
 *
 * Exported for the PUT route, which must re-apply it to the MERGED row: a partial payload carrying
 * only one of the two fields passes the refinement below and would still break CK_Deferrals_Quarter.
 * Same reason `coefficientFitsGroup` is exported from the fixed-asset schema.
 */
export function quarterMatchesModelo(modeloType: ModeloType, fiscalQuarter: number | null | undefined): boolean {
  const isAnnual = modeloType === MODELO_TYPE.M390 || modeloType === MODELO_TYPE.M100;
  return isAnnual ? fiscalQuarter == null : fiscalQuarter != null;
}

const quarterRefinement = {
  message: VALIDATION_KEY.QUARTERLY_MISMATCH,
  path: ['fiscalQuarter'],
};

/** The fracciones must be the complete run 1..N, in order and with no gaps or repeats. */
function fraccionesAreSequential(fracciones: readonly { fraccionNumber: number }[]): boolean {
  return fracciones.every((fraccion, index) => fraccion.fraccionNumber === index + 1);
}

function sumBy(
  fracciones: readonly DeferralFraccionInput[],
  part: 'principalCents' | 'surchargeCents' | 'interestCents',
): number {
  return fracciones.reduce((total, fraccion) => total + fraccion[part], 0);
}

/**
 * The letter must agree with itself: adding ANEXO I row by row has to give the totals row.
 *
 * This is the check that catches a digit misread by the extractor, and it is the reason the
 * per-fracción split may be stored as read — a split that reconciles to the printed totals is the
 * document's own, not a reconstruction of it.
 */
function totalsReconcile(data: {
  fracciones: DeferralFraccionInput[];
  principalCents: number;
  surchargeCents: number;
  interestCents: number;
}): boolean {
  return (
    sumBy(data.fracciones, 'principalCents') === data.principalCents &&
    sumBy(data.fracciones, 'surchargeCents') === data.surchargeCents &&
    sumBy(data.fracciones, 'interestCents') === data.interestCents
  );
}

/**
 * The payload the confirm screen submits: the header of the resolution plus every row of ANEXO I.
 *
 * One request creates the deferral and its fracciones together. They are never created apart — a
 * deferral with no fracciones books nothing, and a fracción with no resolution is the untracked
 * pending expense this module replaces.
 */
export const CreateDeferralSchema = DeferralHeaderObjectSchema.extend({
  fracciones: z
    .array(DeferralFraccionSchema)
    .min(1, VALIDATION_KEY.FRACCIONES_REQUIRED)
    .max(DEFERRAL_MAX_FRACCIONES, VALIDATION_KEY.TOO_MANY_FRACCIONES),
})
  .refine((data) => quarterMatchesModelo(data.modeloType, data.fiscalQuarter), quarterRefinement)
  .refine((data) => fraccionesAreSequential(data.fracciones), {
    message: VALIDATION_KEY.FRACCION_SEQUENCE_INVALID,
    path: ['fracciones'],
  })
  .refine(totalsReconcile, {
    message: VALIDATION_KEY.DEFERRAL_TOTALS_MISMATCH,
    path: ['fracciones'],
  });

export type CreateDeferralInput = z.infer<typeof CreateDeferralSchema>;

/**
 * Schema for editing the header of a stored deferral (all fields optional).
 *
 * The fracciones are not editable through it: they are the transactions themselves, and a paid
 * instalment is corrected on its own movement, never by rewriting the letter it came from. The
 * quarter/modelo rule is re-applied, but it only bites when the payload carries both fields — the
 * route re-runs it against the merged row, as the fixed-asset PUT does with its coefficient.
 */
export const UpdateDeferralSchema = DeferralHeaderObjectSchema.partial().refine(
  (data) => data.modeloType == null || quarterMatchesModelo(data.modeloType, data.fiscalQuarter),
  quarterRefinement,
);

export type UpdateDeferralInput = z.infer<typeof UpdateDeferralSchema>;

/** Schema for the deferrals list filters (query params). */
export const DeferralFiltersSchema = z.object({
  /** Only the resolutions deferring a modelo of this fiscal year */
  year: z.coerce.number().int().min(2019).max(2100).optional(),
  modeloType: DeferralModeloSchema.optional(),
});

export type DeferralFiltersInput = z.infer<typeof DeferralFiltersSchema>;

// ============================================================
// OCR Extraction Schemas
// ============================================================

/** 'YYYY-MM-DD', the only date shape the extractor is allowed to emit. */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A date kept as a string, not parsed.
 *
 * `z.coerce.date()` would hand back a Date at UTC midnight that every consumer has to format back
 * with `timeZone: 'UTC'` to avoid losing a day. The extracted payload is only ever shown for
 * confirmation and then re-validated by {@link CreateDeferralSchema}, so it travels as printed.
 */
function isoDateField() {
  return z.string().regex(ISO_DATE_PATTERN, VALIDATION_KEY.INVALID_DATE);
}

/**
 * One row of ANEXO I as the vision reader returns it.
 *
 * Amounts are integer cents and are checked as such: a `781.66` arriving here is the reader having
 * emitted euros, and letting it through would book 7,82 EUR where 781,66 EUR are due. There is no
 * euro fallback on purpose — see the module comment.
 */
const ExtractedFraccionRawSchema = z.object({
  fraccionNumber: requiredPositiveInt(VALIDATION_KEY.FRACCION_SEQUENCE_INVALID),
  principalCents: centsField(VALIDATION_KEY.AMOUNT_NON_NEGATIVE),
  surchargeCents: centsField(VALIDATION_KEY.AMOUNT_NON_NEGATIVE).default(0),
  interestCents: centsField(VALIDATION_KEY.AMOUNT_NON_NEGATIVE),
  totalCents: centsField(VALIDATION_KEY.AMOUNT_NON_NEGATIVE),
  dueDate: isoDateField(),
});

/**
 * What Claude Vision is allowed to return for one resolution letter.
 *
 * **This schema checks shapes, never sums.** It deliberately does not carry the refinements of
 * {@link CreateDeferralSchema}: a letter whose rows do not add up to its totals row must still
 * reach the confirm screen, because a rejected extraction shows the user nothing to correct while a
 * mismatch shown as a `DeferralVerdict` names the fracción and the cents. The arithmetic gate is
 * `CreateDeferralSchema`, at the point where the data is about to be stored.
 *
 * Header fields are nullable because a corner of the page can be unreadable while the rest is
 * perfect, and a null is something the confirm screen can act on. A fracción row is not: an
 * incomplete row is a misread table, and it fails.
 */
export const ExtractedDeferralRawSchema = z
  .object({
    expedienteNumber: z
      .string()
      .trim()
      .min(1, VALIDATION_KEY.EXPEDIENTE_REQUIRED)
      .max(MAX_REFERENCE_LENGTH, VALIDATION_KEY.EXPEDIENTE_TOO_LONG)
      .nullable()
      .optional(),
    liquidacionNumber: z
      .string()
      .trim()
      .max(MAX_REFERENCE_LENGTH, VALIDATION_KEY.LIQUIDACION_TOO_LONG)
      .nullable()
      .optional(),
    /** The "Concepto:" line verbatim — kept so the user can see what `modeloType` was read from */
    concepto: z.string().trim().nullable().optional(),
    modeloType: DeferralModeloSchema.nullable().optional(),
    interestStartDate: isoDateField().nullable().optional(),
    /**
     * The letter prints the interés de demora with a dot ("4.062" = 4,062 %). The ceiling is what
     * catches a reader that took that dot for a thousands separator and returned 4062.
     */
    interestRatePercent: z
      .number()
      .positive(VALIDATION_KEY.INVALID_INTEREST_RATE)
      .max(100, VALIDATION_KEY.INVALID_INTEREST_RATE)
      .nullable()
      .optional(),
    /** The TOTAL GENERAL row of ANEXO I, transcribed — never the sum of the rows above it */
    principalCents: centsField(VALIDATION_KEY.AMOUNT_NON_NEGATIVE).nullable().optional(),
    surchargeCents: centsField(VALIDATION_KEY.AMOUNT_NON_NEGATIVE).nullable().optional(),
    interestCents: centsField(VALIDATION_KEY.AMOUNT_NON_NEGATIVE).nullable().optional(),
    fracciones: z.array(ExtractedFraccionRawSchema).max(DEFERRAL_MAX_FRACCIONES, VALIDATION_KEY.TOO_MANY_FRACCIONES),
    confidence: z.number().min(0).max(1),
  })
  .transform((data) => ({
    expedienteNumber: data.expedienteNumber ?? null,
    liquidacionNumber: data.liquidacionNumber ?? null,
    concepto: data.concepto ?? null,
    modeloType: data.modeloType ?? null,
    interestStartDate: data.interestStartDate ?? null,
    interestRatePercent: data.interestRatePercent ?? null,
    principalCents: data.principalCents ?? null,
    surchargeCents: data.surchargeCents ?? null,
    interestCents: data.interestCents ?? null,
    fracciones: data.fracciones,
    confidence: data.confidence,
  }));

export type ExtractedDeferralRaw = z.infer<typeof ExtractedDeferralRawSchema>;
