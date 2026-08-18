/**
 * The colour language of the three parts of a fracción, shared by the ANEXO I table and the
 * explainer beside it so a column and its card always read as the same thing.
 *
 * Colour never carries the meaning on its own (DESIGN.md): every place that uses these classes also
 * prints the part's deduction status in words — "No es gasto" / "No deducible" / "100 % deducible".
 *
 * Emerald is deliberately unused: in this app green means income, and the intereses are the one
 * part that IS an expense. Indigo marks it as the figure that does something (the only deductible
 * one, casilla 0203), amber marks the recargo as the one that is expressly excluded, and the
 * principal stays neutral because it is not an expense at all.
 */

import type { DeferralPart } from '@/constants/finance';
import { DEFERRAL_PART } from '@/constants/finance';

export interface DeferralPartStyle {
  /** Figures and headings of the part */
  text: string;
  /** The small chip that spells the deduction status out */
  badge: string;
  /** Tint of the part's column/card, subtle enough to group without shouting */
  surface: string;
}

export const DEFERRAL_PART_STYLE: Record<DeferralPart, DeferralPartStyle> = {
  [DEFERRAL_PART.PRINCIPAL]: {
    text: 'text-foreground',
    badge: 'bg-muted text-guard-muted',
    surface: 'bg-muted/30',
  },
  [DEFERRAL_PART.SURCHARGE]: {
    text: 'text-guard-warning',
    badge: 'bg-guard-warning/10 text-guard-warning',
    surface: 'bg-guard-warning/5',
  },
  [DEFERRAL_PART.INTEREST]: {
    text: 'text-guard-primary',
    badge: 'bg-guard-primary/10 text-guard-primary',
    surface: 'bg-guard-primary/5',
  },
};
