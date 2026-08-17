/**
 * BudgetGuard Amortization
 *
 * An asset is not consumed in the year it is bought: its cost is spread over its useful life
 * (art. 30.2 RIRPF and the tabla de amortización simplificada, Orden de 27 de marzo de 1998).
 *
 * Everything here is a pure function over calendar days. Dates are 'YYYY-MM-DD' strings and the
 * arithmetic runs in UTC, because a DATE column is a calendar day and never an instant — reading
 * it in local time would shift the acquisition by one day for half the year.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = 365;

/** Parse a 'YYYY-MM-DD' calendar day into a UTC timestamp. */
function dayToUtcMs(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year!, month! - 1, date!);
}

/** Days from `from` to `to`, both inclusive. Zero when `to` precedes `from`. */
function inclusiveDays(from: string, to: string): number {
  const days = (dayToUtcMs(to) - dayToUtcMs(from)) / MS_PER_DAY + 1;
  return days > 0 ? days : 0;
}

export interface AmortizableAsset {
  /** Amortizable base in cents: the acquisition cost net of any deductible VAT */
  baseCents: number;
  /** Date the asset entered service, 'YYYY-MM-DD'. Amortization accrues from here, not from the invoice */
  inServiceDate: string;
  /** Annual straight-line rate, e.g. 26 from the tabla simplificada, or 52 with the ERD doubling */
  coefficientPercent: number;
}

/**
 * Amortization accrued from the in-service date up to and including `day`, capped at the base.
 *
 * The cap is what makes the final period take exactly the remainder instead of overshooting: a
 * 52% rate exhausts the base in 702 days, which lands mid-year.
 */
function accruedCents(asset: AmortizableAsset, day: string): number {
  if (asset.baseCents <= 0 || asset.coefficientPercent <= 0) return 0;

  const days = inclusiveDays(asset.inServiceDate, day);
  if (days === 0) return 0;

  const raw = Math.round((asset.baseCents * asset.coefficientPercent * days) / (100 * DAYS_PER_YEAR));
  return Math.min(raw, asset.baseCents);
}

/** The day before a given one, 'YYYY-MM-DD'. */
function previousDay(day: string): string {
  return new Date(dayToUtcMs(day) - MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Amortization deductible in the period [from, to], both inclusive.
 *
 * Computed as the difference of two accrued totals rather than by prorating the period on its own,
 * so the yearly figures always add up to the base exactly — no period can inherit a rounding drift
 * from the one before it.
 *
 * @example
 * // Lenovo: 718,18 € in service 28-Nov-2025, 52% (26% doubled for ERD)
 * amortizationCentsBetween(asset, '2025-01-01', '2025-12-31') // → 3479 (34,79 €, 34 days)
 * amortizationCentsBetween(asset, '2026-01-01', '2026-12-31') // → 37345 (373,45 €, 71818 × 0,52 = 37345,36)
 * amortizationCentsBetween(asset, '2027-01-01', '2027-12-31') // → 30994 (309,94 €, the remainder)
 */
export function amortizationCentsBetween(asset: AmortizableAsset, from: string, to: string): number {
  if (to < asset.inServiceDate) return 0;

  const accruedToEnd = accruedCents(asset, to);
  const accruedBeforeStart = from <= asset.inServiceDate ? 0 : accruedCents(asset, previousDay(from));

  return Math.max(0, accruedToEnd - accruedBeforeStart);
}

export interface AmortizationYear {
  fiscalYear: number;
  cents: number;
  /** Base left to amortize after this year */
  remainingCents: number;
}

/** Last fiscal year in which the asset still has base to amortize. */
function finalYear(asset: AmortizableAsset): number {
  const startYear = Number(asset.inServiceDate.slice(0, 4));
  // Days needed to exhaust the base at this rate, plus the days already elapsed in the first year
  const totalDays = Math.ceil((100 * DAYS_PER_YEAR) / asset.coefficientPercent);
  const endMs = dayToUtcMs(asset.inServiceDate) + totalDays * MS_PER_DAY;
  return Math.max(startYear, new Date(endMs).getUTCFullYear());
}

/**
 * Year-by-year schedule, from the year it entered service until the base is exhausted.
 * The cents always sum to `baseCents`.
 */
export function computeAmortizationSchedule(asset: AmortizableAsset): AmortizationYear[] {
  if (asset.baseCents <= 0 || asset.coefficientPercent <= 0) return [];

  const startYear = Number(asset.inServiceDate.slice(0, 4));
  const lastYear = finalYear(asset);

  return Array.from({ length: lastYear - startYear + 1 }, (_, index) => startYear + index).reduce<AmortizationYear[]>(
    (schedule, fiscalYear) => {
      const cents = amortizationCentsBetween(asset, `${fiscalYear}-01-01`, `${fiscalYear}-12-31`);
      const previousRemaining = schedule.at(-1)?.remainingCents ?? asset.baseCents;

      // A year that amortizes nothing only happens past the end; stop rather than pad the list
      if (cents === 0 && previousRemaining === 0) return schedule;

      schedule.push({ fiscalYear, cents, remainingCents: previousRemaining - cents });
      return schedule;
    },
    [],
  );
}
