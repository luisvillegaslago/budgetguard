/**
 * Shared chart configuration for dashboard analytics.
 * Colors mirror the fixed guard-* brand palette (tailwind.config.js).
 */

// Brand colors (kept in sync with tailwind.config.js `guard`)
export const CHART_COLORS = {
  income: '#10B981', // guard-success
  expense: '#EF4444', // guard-danger
  balance: '#4F46E5', // guard-primary
  accent: '#8B5CF6', // guard-accent
  warning: '#F59E0B', // guard-warning
  muted: '#64748B', // guard-muted
} as const;

// Fallback palette for category slices without an explicit color.
export const CATEGORY_PALETTE = [
  '#4F46E5',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#EF4444',
  '#06B6D4',
  '#EC4899',
  '#84CC16',
] as const;

// Number of category slices shown before grouping the rest into "Others".
export const DONUT_MAX_SLICES = 6;

/**
 * Format a euro value (as used in chart datasets) back to a currency string.
 * Charts plot euros; formatCurrency expects cents, so convert first.
 */
export function formatEuroValue(euros: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(euros);
}

/**
 * Compact euro axis label (e.g. "2,7k €") for chart axes.
 */
export function formatEuroAxis(euros: number): string {
  const abs = Math.abs(euros);
  const sign = euros < 0 ? '-' : '';

  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace('.', ',')}M €`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1).replace('.', ',')}k €`;
  return `${sign}${Math.round(abs)} €`;
}
