/**
 * BudgetGuard IRPF Utilities
 * Pure functions for the progressive IRPF scale (estimación directa simplificada)
 *
 * Modelo 130 pays a flat 20% of the accumulated net income, but the Renta charges a
 * progressive scale (state + regional halves). These functions quantify that gap.
 *
 * Same Math.round() in backend and frontend = zero rounding discrepancies.
 * Every amount is in cents.
 */

import {
  DEFAULT_IRPF_REGION,
  IRPF_REGIONAL_SCALE,
  IRPF_STATE_SCALE,
  type IrpfRegion,
  MINIMO_PERSONAL_CENTS,
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
 * applyScale(1_245_000, IRPF_STATE_SCALE) // → 118_275 (12.450 € at 9,5%)
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

/** Both halves of the scale for a region. */
function scalesFor(region: IrpfRegion): IrpfScale[] {
  return [IRPF_STATE_SCALE, IRPF_REGIONAL_SCALE[region]];
}

/**
 * Estimated IRPF for a net income, state + regional scales.
 *
 * The mínimo personal is not subtracted from the base: it is taxed by the scale and its
 * quota is then subtracted (AEAT rule), so it is always relieved at the lowest brackets.
 *
 * @param baseCents - Rendimiento neto in cents
 * @param region - Comunidad autónoma (only Madrid is supported today)
 * @returns IRPF quota in cents (never negative)
 */
export function computeIrpfCents(baseCents: number, region: IrpfRegion = DEFAULT_IRPF_REGION): number {
  if (baseCents <= 0) return 0;

  const scales = scalesFor(region);
  const grossQuotaCents = scales.reduce((sum, scale) => sum + applyScale(baseCents, scale), 0);

  // Capped at the base: a base below the mínimo personal pays no tax, it never refunds.
  const minimoBaseCents = Math.min(baseCents, MINIMO_PERSONAL_CENTS);
  const minimoQuotaCents = scales.reduce((sum, scale) => sum + applyScale(minimoBaseCents, scale), 0);

  return Math.max(0, grossQuotaCents - minimoQuotaCents);
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
 * computeMarginalRate(6_918_900) // → 0.43 (22,5% state + 20,5% Madrid)
 */
export function computeMarginalRate(baseCents: number, region: IrpfRegion = DEFAULT_IRPF_REGION): number {
  const total = scalesFor(region).reduce((sum, scale) => sum + marginalRateOf(Math.max(0, baseCents), scale), 0);
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
