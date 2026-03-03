/**
 * BudgetGuard Money Utilities
 * All monetary values are stored as integers (cents) to avoid floating point errors
 *
 * Example: 419.28 is stored as 41928
 * Division by 100 happens ONLY in the presentation layer
 */

/**
 * Convert euros to cents for database storage
 * @param euros - Amount in euros (e.g., 419.28)
 * @returns Amount in cents as integer (e.g., 41928)
 */
export function eurosToCents(euros: number): number {
  return Math.round(euros * 100);
}

/**
 * Convert cents to euros for display
 * @param cents - Amount in cents (e.g., 41928)
 * @returns Amount in euros (e.g., 419.28)
 */
export function centsToEuros(cents: number): number {
  return cents / 100;
}

/**
 * Format cents as currency string (EUR)
 * Uses Spanish locale formatting (comma as decimal separator)
 *
 * @param cents - Amount in cents (e.g., 41928)
 * @param showSymbol - Whether to include currency symbol (default: true)
 * @returns Formatted currency string (e.g., "419,28" or "419,28 €")
 */
export function formatCurrency(cents: number, showSymbol = true): string {
  const euros = centsToEuros(cents);
  const formatted = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(euros));

  if (!showSymbol) {
    return euros < 0 ? `-${formatted}` : formatted;
  }

  const sign = euros < 0 ? '-' : '';
  return `${sign}${formatted} €`;
}

/**
 * Format cents as compact currency (for cards/headers)
 * Shows abbreviated amounts for large numbers
 *
 * @param cents - Amount in cents
 * @returns Compact formatted string (e.g., "2,7k €" for 270000 cents)
 */
export function formatCompactCurrency(cents: number): string {
  const euros = centsToEuros(Math.abs(cents));
  const sign = cents < 0 ? '-' : '';

  if (euros >= 1000000) {
    return `${sign}${(euros / 1000000).toFixed(1).replace('.', ',')}M €`;
  }
  if (euros >= 10000) {
    return `${sign}${(euros / 1000).toFixed(1).replace('.', ',')}k €`;
  }

  return formatCurrency(cents);
}

/**
 * Parse user input string to cents
 * Handles both comma and period as decimal separators
 *
 * @param input - User input string (e.g., "419,28" or "419.28")
 * @returns Amount in cents, or null if invalid
 */
export function parseInputToCents(input: string): number | null {
  if (!input || input.trim() === '') return null;

  // Remove spaces and replace comma with period
  const normalized = input.trim().replace(/\s/g, '').replace(',', '.');

  // Remove any currency symbols
  const cleaned = normalized.replace(/[€$]/g, '');

  const parsed = Number.parseFloat(cleaned);

  if (Number.isNaN(parsed)) return null;

  return eurosToCents(parsed);
}

/**
 * Calculate percentage of total
 * @param part - Part amount in cents
 * @param total - Total amount in cents
 * @returns Percentage (0-100)
 */
export function calculatePercentage(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((Math.abs(part) / Math.abs(total)) * 100);
}

/**
 * Sum an array of cent amounts
 * @param amounts - Array of amounts in cents
 * @returns Total in cents
 */
export function sumCents(amounts: number[]): number {
  return amounts.reduce((sum, amount) => sum + amount, 0);
}

/**
 * Validate that a cent amount is a valid integer
 * @param cents - Amount to validate
 * @returns true if valid
 */
export function isValidCents(cents: number): boolean {
  return Number.isInteger(cents) && Number.isFinite(cents);
}
