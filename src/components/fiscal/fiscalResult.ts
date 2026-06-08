/**
 * Shared classification of a fiscal result figure (Modelo 303/390).
 *
 * Unifies the color/label semantics across modelo cards so the same neutral
 * amount (0,00 €) is never painted green in one card and red in another.
 * Convention: a POSITIVE result means money owed to the AEAT ("a ingresar",
 * danger); a NEGATIVE result means money in the taxpayer's favor ("a
 * compensar", success); ZERO is neutral, with no owed/compensate label.
 */

export const FISCAL_RESULT_KIND = {
  TO_PAY: 'to_pay',
  TO_COMPENSATE: 'to_compensate',
  NEUTRAL: 'neutral',
} as const;

export type FiscalResultKind = (typeof FISCAL_RESULT_KIND)[keyof typeof FISCAL_RESULT_KIND];

interface FiscalResultClassification {
  kind: FiscalResultKind;
  /** Tailwind text color token for the main figure. */
  amountClassName: string;
  /** Tailwind text color token for the secondary label/caption. */
  labelClassName: string;
}

/**
 * Classify a fiscal result amount (in cents) into a kind + color tokens.
 * Centralizes the single source of truth for owed/compensate/neutral coloring.
 */
export function classifyFiscalResult(cents: number): FiscalResultClassification {
  if (cents > 0) {
    return {
      kind: FISCAL_RESULT_KIND.TO_PAY,
      amountClassName: 'text-guard-danger',
      labelClassName: 'text-guard-danger/70',
    };
  }
  if (cents < 0) {
    return {
      kind: FISCAL_RESULT_KIND.TO_COMPENSATE,
      amountClassName: 'text-guard-success',
      labelClassName: 'text-guard-success/70',
    };
  }
  return {
    kind: FISCAL_RESULT_KIND.NEUTRAL,
    amountClassName: 'text-foreground',
    labelClassName: 'text-guard-muted',
  };
}
