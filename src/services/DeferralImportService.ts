/**
 * Deferral Import Service
 *
 * Turns a confirmed AEAT resolution into what the app can actually work with: the stored letter and
 * one pending movement per legally distinct part of each fracción.
 *
 * WHY THE SPLIT. An instalment of an aplazamiento is three different things paid together, and only
 * one of them is an expense:
 *
 * - **principal** — the IVA or the IRPF being paid. Not an expense at all, it is the tax itself.
 * - **recargo de apremio** — expressly non-deductible, art. 15.c LIS.
 * - **intereses de demora** — deductible, and as a *financial* expense: Modelo 100 casilla 0203
 *   (DGT V4080-15, STS 150/2021), which is the category the interés is booked into.
 *
 * Booking the instalment whole is what this replaces, and it is not a tidiness problem: it left
 * 95 EUR of interest undeducted for two years and let one whole instalment be marked 100 %
 * deductible by a stray click. Three rows make the deductible part impossible to miss and the
 * non-deductible parts impossible to deduct.
 *
 * NOTHING HERE RECOMPUTES A SPLIT. The amounts are the letter's own, row by row: AEAT loads the
 * rounding remainder onto the last fracción (781,66 x5 then 781,69), so a derived split is wrong by
 * a few cents on every instalment. The arithmetic gate is CreateDeferralSchema, which checks the
 * letter against itself before anything reaches this service.
 */

import {
  API_ERROR,
  DEFERRAL_PART,
  DEFERRAL_PART_AMOUNT_FIELD,
  DEFERRAL_PART_DEDUCTION_PERCENT,
  DEFERRAL_PART_OPTIONS,
  type ModeloType,
} from '@/constants/finance';
import type { CreateDeferralInput } from '@/schemas/deferral';
import {
  createDeferralWithMovements,
  type DeferralMovementDraft,
  getDeferralCategoryIds,
} from '@/services/database/DeferralRepository';
import type { Deferral, DeferralFraccion, DeferralPart, DeferralVerdict } from '@/types/finance';
import { NotFoundError } from '@/utils/apiErrors';
import { verifyDeferral } from '@/utils/deferral';

/** Who the movements are owed to. The AEAT is not a "Company", so it travels as a plain vendor. */
const DEFERRAL_VENDOR_NAME = 'Agencia Tributaria';

/**
 * A field Zod fills in with `.default()`, as it survives `validateRequest`.
 *
 * That helper infers a single type for a schema's input and its output, so a `.default(0)` leaks a
 * `| undefined` into the parsed result even though the value is always there at runtime — the same
 * caveat written down in schemas/invoice.ts. The recargo keeps its default (a letter with no recargo
 * column at all is the normal case) and this service absorbs the `undefined` with `?? 0`, in the one
 * place that already knows a missing recargo is a zero.
 */
type Defaulted<T, TKey extends keyof T> = Omit<T, TKey> & Partial<Pick<T, TKey>>;

/** The confirmed payload as the route hands it over. */
export type ConfirmedDeferralInput = Defaulted<Omit<CreateDeferralInput, 'fracciones'>, 'surchargeCents'> & {
  fracciones: Defaulted<CreateDeferralInput['fracciones'][number], 'surchargeCents'>[];
};

/**
 * How each part names itself in the movement description.
 *
 * Spanish, and stored in the row rather than translated on read — the same choice the invoice and
 * skydiving flows already make for the descriptions they generate. These are the words the
 * resolution itself prints, which is what makes a movement recognisable next to the letter.
 */
const PART_LABEL: Record<DeferralPart, string> = {
  [DEFERRAL_PART.PRINCIPAL]: 'Principal',
  [DEFERRAL_PART.SURCHARGE]: 'Recargo de apremio',
  [DEFERRAL_PART.INTEREST]: 'Intereses de demora',
};

/** A DATE column takes a calendar day; the UTC one, since that is the day the schema coerced. */
function toDay(value: Date): string {
  return value.toISOString().split('T')[0]!;
}

/** "Modelo 130 2T 2026", or "Modelo 100 2025" for the annual ones, which carry no quarter. */
function periodLabel(modeloType: ModeloType, fiscalYear: number, fiscalQuarter: number | null | undefined): string {
  const period = fiscalQuarter == null ? `${fiscalYear}` : `${fiscalQuarter}T ${fiscalYear}`;
  return `Modelo ${modeloType} ${period}`;
}

/**
 * What a movement says in the list: which resolution, which instalment, which part.
 *
 * The expediente is deliberately left out — it is one click away through "DeferralID" and it would
 * push the readable half of the line out of view in every list.
 */
function movementDescription(header: string, fraccionNumber: number, total: number, part: DeferralPart): string {
  return `Aplazamiento ${header} - Fracción ${fraccionNumber}/${total} - ${PART_LABEL[part]}`;
}

/**
 * The movements one fracción is booked as: its non-zero parts, all dated on the vencimiento.
 *
 * **A zero part books nothing.** A 0,00 EUR recargo is a real figure of the letter — the totals row
 * proves it was read — but a 0,00 EUR expense is noise in every list, every summary and every
 * export. The zero survives where it belongs: in the resolution's own "SurchargeCents", and in the
 * rebuilt ANEXO I, which adds up either way.
 */
function planFraccion(
  fraccion: ConfirmedDeferralInput['fracciones'][number],
  context: { header: string; fraccionCount: number; interestCategoryId: number; taxCategoryId: number },
): DeferralMovementDraft[] {
  const dueDate = toDay(fraccion.dueDate);

  return DEFERRAL_PART_OPTIONS.flatMap((part) => {
    const amountCents = fraccion[DEFERRAL_PART_AMOUNT_FIELD[part]] ?? 0;
    if (amountCents <= 0) return [];

    return [
      {
        fraccionNumber: fraccion.fraccionNumber,
        part,
        categoryId: part === DEFERRAL_PART.INTEREST ? context.interestCategoryId : context.taxCategoryId,
        amountCents,
        dueDate,
        description: movementDescription(context.header, fraccion.fraccionNumber, context.fraccionCount, part),
        deductionPercent: DEFERRAL_PART_DEDUCTION_PERCENT[part],
        vendorName: DEFERRAL_VENDOR_NAME,
      },
    ];
  });
}

/** What the import wrote, plus the verdict on the letter it wrote it from. */
export interface DeferralImportResult {
  deferral: Deferral;
  /** ANEXO I as stored, in printed order */
  fracciones: DeferralFraccion[];
  /**
   * The letter checked against itself and against art. 53 RGR.
   *
   * Informational: the import is not refused on it. Everything that is an arithmetic identity was
   * already enforced by CreateDeferralSchema, so what can still be reported here is an interés that
   * does not match its own number of days, or vencimientos out of order — worth showing a human,
   * not worth throwing away a resolution the user has already confirmed on screen.
   */
  verdict: DeferralVerdict;
  /** Movements booked. Fewer than 3 x fracciones whenever a part is zero, which is the normal case */
  movementCount: number;
}

/**
 * Import a confirmed resolution: store the letter and book every instalment as pending movements.
 *
 * Everything lands in one database transaction, so a resolution can never exist with half its
 * instalments booked. Importing the same expediente twice is stopped by
 * "UQ_Deferrals_UserExpediente" and surfaces as a ConflictError -> 409, with nothing written.
 *
 * @example
 * // Letter 282640560363H: Modelo 130 2T 2026, six fracciones, no recargo
 * const { movementCount } = await importDeferral(input); // 12 movements: 6 principal + 6 interés
 */
export async function importDeferral(input: ConfirmedDeferralInput): Promise<DeferralImportResult> {
  const { fracciones, interestStartDate, ...header } = input;

  const storedFracciones: DeferralFraccion[] = fracciones.map((fraccion) => ({
    fraccionNumber: fraccion.fraccionNumber,
    principalCents: fraccion.principalCents,
    surchargeCents: fraccion.surchargeCents ?? 0,
    interestCents: fraccion.interestCents,
    totalCents: fraccion.totalCents,
    dueDate: toDay(fraccion.dueDate),
  }));

  const interestStartDay = toDay(interestStartDate);

  const verdict = verifyDeferral({
    interestStartDate: interestStartDay,
    interestRatePercent: header.interestRatePercent,
    principalCents: header.principalCents,
    surchargeCents: header.surchargeCents ?? 0,
    interestCents: header.interestCents,
    fracciones: storedFracciones,
  });

  // Both subcategories are seeded for every user; one missing means the user deleted or renamed it,
  // and booking the interés anywhere else would put a financial expense in the wrong casilla.
  const categories = await getDeferralCategoryIds();
  if (!categories) throw new NotFoundError(API_ERROR.NOT_FOUND.CATEGORY);

  const label = periodLabel(header.modeloType, header.fiscalYear, header.fiscalQuarter);
  const movements = fracciones.flatMap((fraccion) =>
    planFraccion(fraccion, {
      header: label,
      fraccionCount: fracciones.length,
      interestCategoryId: categories.interestCategoryId,
      taxCategoryId: categories.taxCategoryId,
    }),
  );

  const { deferral, movementCount } = await createDeferralWithMovements(
    {
      ...header,
      interestStartDate: interestStartDay,
      surchargeCents: header.surchargeCents ?? 0,
      fiscalQuarter: header.fiscalQuarter ?? null,
      liquidacionNumber: header.liquidacionNumber ?? null,
      fiscalDocumentId: header.fiscalDocumentId ?? null,
    },
    movements,
  );

  return { deferral, fracciones: storedFracciones, verdict, movementCount };
}
