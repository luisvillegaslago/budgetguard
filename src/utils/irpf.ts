/**
 * BudgetGuard IRPF Utilities
 * Pure functions for the progressive IRPF scale (estimación directa simplificada)
 *
 * Modelo 130 pays a flat 20% of the accumulated net income, but the Renta charges a
 * progressive scale (state + regional halves). These functions quantify that gap.
 *
 * Same Math.round() in backend and frontend = zero rounding discrepancies.
 * Every amount is in cents.
 *
 * Every figure the law fixes — both halves of the scale, the mínimo personal, the pension
 * ceilings — is read out of IRPF_YEAR_FIGURES for the year being declared, so updating the app
 * for a new Ley de Presupuestos cannot move what it says about the years already filed.
 */

import {
  DEFAULT_IRPF_REGION,
  IRPF_YEAR_FIGURES,
  type IrpfRegion,
  type IrpfYearFigures,
  LAST_PUBLISHED_IRPF_YEAR,
} from '@/constants/finance';
import type { IrpfScale } from '@/types/finance';

/** Rates are stored with 3 decimals; rounding the sum avoids 0.43000000000000005. */
const RATE_PRECISION = 10_000;

interface ScaleAccumulator {
  quotaCents: number;
  remainingCents: number;
  previousLimitCents: number;
}

/**
 * Apply a progressive scale to a base amount.
 *
 * @param baseCents - Taxable base in cents
 * @param scale - Brackets as [upperLimitCents, rate], sorted ascending, last one Infinity
 * @returns Quota in cents (0 when the base is not positive)
 *
 * @example
 * applyScale(1_245_000, getIrpfFigures(2026).stateScale) // → 118_275 (12.450 € at 9,5%)
 */
export function applyScale(baseCents: number, scale: IrpfScale): number {
  if (baseCents <= 0) return 0;

  const result = scale.reduce<ScaleAccumulator>(
    (acc, [limitCents, rate]) => {
      if (acc.remainingCents <= 0) return acc;

      const bracketWidthCents = limitCents - acc.previousLimitCents;
      const taxableCents = Math.min(acc.remainingCents, bracketWidthCents);

      return {
        quotaCents: acc.quotaCents + taxableCents * rate,
        remainingCents: acc.remainingCents - taxableCents,
        previousLimitCents: limitCents,
      };
    },
    { quotaCents: 0, remainingCents: baseCents, previousLimitCents: 0 },
  );

  return Math.round(result.quotaCents);
}

/**
 * The figures that apply to a fiscal year: the ones published for it, or — while its Ley de
 * Presupuestos is still to come — the ones of the last published year, carried forward.
 *
 * Same fallback as rentaWindowDate() in src/utils/fiscalDeadlines.ts, and for the same reason:
 * a projection of next year is more useful than no projection at all, as long as nobody is told
 * that the guess is the law. isIrpfScaleConfirmed() is what says which of the two happened.
 */
export function getIrpfFigures(fiscalYear: number): IrpfYearFigures {
  return IRPF_YEAR_FIGURES[fiscalYear] ?? IRPF_YEAR_FIGURES[LAST_PUBLISHED_IRPF_YEAR]!;
}

/** True when the year has published figures of its own, false when they were carried forward. */
export const isIrpfScaleConfirmed = (fiscalYear: number): boolean => fiscalYear in IRPF_YEAR_FIGURES;

/** Both halves of the scale of a year, for a region. */
function scalesFor(fiscalYear: number, region: IrpfRegion): IrpfScale[] {
  const { stateScale, regionalScale } = getIrpfFigures(fiscalYear);
  return [stateScale, regionalScale[region]];
}

/**
 * Estimated IRPF for a net income, state + regional scales.
 *
 * The mínimo personal is not subtracted from the base: it is taxed by the scale and its
 * quota is then subtracted (AEAT rule), so it is always relieved at the lowest brackets.
 *
 * @param fiscalYear - Year being declared: it decides the scale and the mínimo personal
 * @param baseCents - Rendimiento neto in cents
 * @param region - Comunidad autónoma (only Madrid is supported today)
 * @returns IRPF quota in cents (never negative)
 */
export function computeIrpfCents(
  fiscalYear: number,
  baseCents: number,
  region: IrpfRegion = DEFAULT_IRPF_REGION,
): number {
  if (baseCents <= 0) return 0;

  const scales = scalesFor(fiscalYear, region);
  const grossQuotaCents = scales.reduce((sum, scale) => sum + applyScale(baseCents, scale), 0);

  // Capped at the base: a base below the mínimo personal pays no tax, it never refunds.
  const minimoBaseCents = Math.min(baseCents, getIrpfFigures(fiscalYear).minimoPersonalCents);
  const minimoQuotaCents = scales.reduce((sum, scale) => sum + applyScale(minimoBaseCents, scale), 0);

  return Math.max(0, grossQuotaCents - minimoQuotaCents);
}

/**
 * Reduction of the base imponible general for pension plan contributions (arts. 51-52
 * Ley 35/2006). It is neither an expense nor a deducción en cuota: it lowers the base the
 * scale is applied to, and only in the annual Renta — the pagos fraccionados of Modelo 130
 * (art. 110 RIRPF) ignore it entirely.
 *
 * Two buckets, because each carries its own ceiling and they cannot be added up first:
 * the general limit covers any plan (an individual one included), while the increment is
 * reserved for planes de empleo simplificados de trabajadores por cuenta propia. Capping a
 * single total would let an individual contribution absorb an allowance it is not entitled to.
 *
 * The caps, in the order the law applies them:
 *  1. Art. 52.1.b): each bucket against its own ceiling (1.500 € / +4.250 €).
 *  2. Art. 52.1.a): 30% of the rendimientos netos del trabajo y de actividades económicas,
 *     applied to the SUM — it is the joint ceiling of the whole reduction, not of one bucket.
 *  3. Art. 50.1: the base itself, which can never turn negative because of a reduction. Here it
 *     needs no separate term: the base equals the net income, and 30% of it is always smaller.
 *
 * Returns a single figure rather than a per-bucket breakdown on purpose: once the joint 30%
 * cap bites, splitting the shortfall back across the two buckets would need an allocation rule
 * the law does not define. The caller can still tell that a cap applied by comparing the result
 * with what was contributed.
 *
 * The excess is not lost — art. 52.2 carries it to the next five years — but this projection
 * only measures the current year.
 *
 * @param fiscalYear - Year being declared: it decides the three ceilings
 * @param individualCents - Contributed to a plan de pensiones individual, in cents
 * @param employmentCents - Contributed to a plan de empleo simplificado de autónomos, in cents
 * @param netIncomeCents - Rendimiento neto de actividades económicas, in cents
 * @returns Reduction in cents: never above what was contributed, never below zero
 */
export function computePensionReductionCents(
  fiscalYear: number,
  individualCents: number,
  employmentCents: number,
  netIncomeCents: number,
): number {
  const { generalLimitCents, selfEmployedExtraCents, incomePercentageCap } = getIrpfFigures(fiscalYear).pensionPlan;
  const individual = Math.max(0, individualCents);
  const employment = Math.max(0, employmentCents);

  // The 1.500 € general limit applies to the TOTAL, whatever the instrument; only the 4.250 €
  // increment is reserved to the self-employed products. So an individual plan can never use
  // more than the general limit, while an employment plan may absorb both (1.500 + 4.250).
  const deductibleContributionsCents = Math.min(individual, generalLimitCents) + employment;
  const absoluteCapCents = generalLimitCents + Math.min(employment, selfEmployedExtraCents);
  const percentageCapCents = Math.round(Math.max(0, netIncomeCents) * incomePercentageCap);

  return Math.min(deductibleContributionsCents, absoluteCapCents, percentageCapCents);
}

/** Rate that the next cent of income would pay in a single scale. */
function marginalRateOf(baseCents: number, scale: IrpfScale): number {
  const bracket = scale.find(([limitCents]) => baseCents < limitCents);
  return bracket ? bracket[1] : 0;
}

/**
 * Marginal rate at a given net income (state + regional), as a factor.
 *
 * @example
 * computeMarginalRate(2026, 6_918_900) // → 0.43 (22,5% state + 20,5% Madrid)
 */
export function computeMarginalRate(
  fiscalYear: number,
  baseCents: number,
  region: IrpfRegion = DEFAULT_IRPF_REGION,
): number {
  const total = scalesFor(fiscalYear, region).reduce(
    (sum, scale) => sum + marginalRateOf(Math.max(0, baseCents), scale),
    0,
  );
  return Math.round(total * RATE_PRECISION) / RATE_PRECISION;
}

/**
 * Project a year-to-date amount to the full year by linear run-rate.
 *
 * @param ytdCents - Amount accumulated so far, in cents
 * @param elapsedDays - Days already elapsed in the year
 * @param totalDaysInYear - 365 or 366
 * @returns Projected annual amount in cents (the YTD amount itself once the year is over)
 */
export function projectAnnualCents(ytdCents: number, elapsedDays: number, totalDaysInYear: number): number {
  if (elapsedDays <= 0 || totalDaysInYear <= 0) return ytdCents;
  if (elapsedDays >= totalDaysInYear) return ytdCents;

  return Math.round((ytdCents * totalDaysInYear) / elapsedDays);
}

/**
 * How far a calendar year has progressed at a given moment.
 * Past years are fully elapsed; future years have not started.
 * UTC throughout, like every other date in the app.
 */
export function getYearProgress(
  year: number,
  now: Date = new Date(),
): { elapsedDays: number; totalDaysInYear: number } {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const startMs = Date.UTC(year, 0, 1);
  const endMs = Date.UTC(year + 1, 0, 1);
  const totalDaysInYear = Math.round((endMs - startMs) / MS_PER_DAY);

  const nowMs = now.getTime();
  if (nowMs <= startMs) return { elapsedDays: 0, totalDaysInYear };
  if (nowMs >= endMs) return { elapsedDays: totalDaysInYear, totalDaysInYear };

  // The day in progress counts as elapsed.
  return { elapsedDays: Math.floor((nowMs - startMs) / MS_PER_DAY) + 1, totalDaysInYear };
}
