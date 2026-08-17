/**
 * BudgetGuard Fixed Asset (inmovilizado) Schemas
 *
 * Shared validation for the frontend form and the API route. Amounts travel in EUROS and are
 * converted with eurosToCents() at the route edge, like every other module — nothing here stores
 * or returns cents.
 */

import { z } from 'zod';
import {
  AMORTIZATION,
  AMORTIZATION_CASILLA_OPTIONS,
  AMORTIZATION_GROUP,
  type AmortizationGroupNumber,
  VALIDATION_KEY,
} from '@/constants/finance';
import { requiredPositiveNumber } from '@/schemas/shared';

/** Sanity ceiling for the amortizable base, in euros. */
const MAX_BASE_EUROS = 10_000_000;

const AMORTIZATION_GROUP_DEFINITIONS = Object.values(AMORTIZATION_GROUP);

/**
 * The Modelo 100 casilla of a dotación, restricted to the two amortization boxes.
 *
 * modelo100CasillaField() in shared.ts accepts the whole official set and is optional, because a
 * category may legitimately carry none. Here the box is neither optional nor free: an asset that
 * is neither material (0208) nor intangible (0227) has no casilla to be deducted in at all.
 */
function amortizationCasillaField() {
  return z.enum(AMORTIZATION_CASILLA_OPTIONS, {
    errorMap: () => ({ message: VALIDATION_KEY.INVALID_MODELO_100_CASILLA }),
  });
}

/**
 * A grupo of the tabla simplificada, or null when the rate is custom and belongs to no group.
 *
 * z.custom() rather than z.number().refine((g): g is AmortizationGroupNumber => …): a refine leaves
 * the schema's *input* a plain number, and validateRequest() infers its T from both sides, so the
 * narrowing evaporated at the route and every caller had to cast the value back into the union.
 * Here input and output are both AmortizationGroupNumber, so a validated group needs no cast.
 */
function amortizationGroupField() {
  return z
    .custom<AmortizationGroupNumber>(
      (group) => AMORTIZATION_GROUP_DEFINITIONS.some((it) => it.group === group),
      VALIDATION_KEY.INVALID_AMORTIZATION_GROUP,
    )
    .optional()
    .nullable();
}

const fixedAssetFields = {
  description: z
    .string()
    .trim()
    .min(1, VALIDATION_KEY.DESCRIPTION_REQUIRED)
    .max(255, VALIDATION_KEY.DESCRIPTION_TOO_LONG),
  /** Not the invoice date: amortization accrues from the day the asset entered service */
  inServiceDate: z.coerce.date({ message: VALIDATION_KEY.INVALID_DATE }),
  /** Amortizable base in EUROS — acquisition cost net of any deductible VAT */
  baseAmount: requiredPositiveNumber(VALIDATION_KEY.AMOUNT_POSITIVE).max(
    MAX_BASE_EUROS,
    VALIDATION_KEY.AMOUNT_TOO_LARGE,
  ),
  /** The rate actually applied: the tabla maximum, a fraction of it, or its ERD double */
  coefficientPercent: z
    .number({
      required_error: VALIDATION_KEY.INVALID_AMORTIZATION_COEFFICIENT,
      invalid_type_error: VALIDATION_KEY.INVALID_AMORTIZATION_COEFFICIENT,
    })
    .positive(VALIDATION_KEY.INVALID_AMORTIZATION_COEFFICIENT)
    .max(100, VALIDATION_KEY.INVALID_AMORTIZATION_COEFFICIENT),
  amortizationGroup: amortizationGroupField(),
  modelo100CasillaCode: amortizationCasillaField(),
  /** The purchase transaction, when it is recorded in BudgetGuard */
  transactionId: z.number().int().positive().optional().nullable(),
  notes: z.string().max(2000, VALIDATION_KEY.DESCRIPTION_TOO_LONG).optional().nullable(),
};

const FixedAssetObjectSchema = z.object(fixedAssetFields);

/**
 * A declared grupo caps the rate at its coeficiente lineal máximo, doubled by the ERD
 * acceleration of art. 103 LIS — 52% on a grupo 5 laptop is legal, 60% is not.
 *
 * The check only bites when a group is given. Regimes that ignore the tabla altogether
 * (libertad de amortización, art. 102 LIS) are recorded with a custom rate and no group, so
 * they are not caught in this net.
 *
 * Exported because a partial update escapes it: the schema only ever sees the payload, so
 * `{ coefficientPercent: 60 }` on a stored grupo 5 asset carries no group to check against. Only
 * the route knows the stored values, so it re-runs this against the merged row (see PUT in
 * src/app/api/fiscal/assets/[id]/route.ts).
 */
export function coefficientFitsGroup(data: {
  amortizationGroup?: number | null;
  coefficientPercent?: number;
}): boolean {
  if (data.amortizationGroup == null || data.coefficientPercent == null) return true;

  const definition = AMORTIZATION_GROUP_DEFINITIONS.find((it) => it.group === data.amortizationGroup);
  if (!definition) return true; // The group field reports its own error; do not report it twice

  return data.coefficientPercent <= definition.coefficientPercent * AMORTIZATION.ERD_MULTIPLIER;
}

const coefficientRefinement = {
  message: VALIDATION_KEY.INVALID_AMORTIZATION_COEFFICIENT,
  path: ['coefficientPercent'],
};

/** Schema for creating a fixed asset. */
export const CreateFixedAssetSchema = FixedAssetObjectSchema.refine(coefficientFitsGroup, coefficientRefinement);

export type CreateFixedAssetInput = z.infer<typeof CreateFixedAssetSchema>;

/**
 * Schema for updating a fixed asset (all fields optional).
 *
 * The group/coefficient check is re-applied, but it only catches a payload that carries *both*
 * fields. An update that raises the rate alone is caught by the route, which merges the payload
 * over the stored row before checking — this schema cannot, having never seen the stored row.
 */
export const UpdateFixedAssetSchema = FixedAssetObjectSchema.partial().refine(
  coefficientFitsGroup,
  coefficientRefinement,
);

export type UpdateFixedAssetInput = z.infer<typeof UpdateFixedAssetSchema>;

/** Schema for the fixed assets list filters (query params). */
export const FixedAssetFiltersSchema = z.object({
  /** Only assets with a dotación in this fiscal year */
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export type FixedAssetFiltersInput = z.infer<typeof FixedAssetFiltersSchema>;
