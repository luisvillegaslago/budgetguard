/**
 * Shared helpers for splitting a Binance spot symbol (e.g. `BTCEUR`) into its
 * base/quote assets. Binance does not return base/quote separately, so we rely
 * on a fixed list of well-known quote suffixes to split unambiguously.
 *
 * Used both by the fiscal EventNormalizer (server) and the movements presenter
 * (client) — keep it dependency-free so it is safe to import from either side.
 */

// Order matters: longer/more specific suffixes first so `FDUSD` wins over `USD`.
export const QUOTE_SUFFIXES = [
  'USDT',
  'BUSD',
  'USDC',
  'FDUSD',
  'BTC',
  'ETH',
  'BNB',
  'EUR',
  'TRY',
  'GBP',
  'AUD',
  'BRL',
  'TUSD',
  'DAI',
] as const;

export function splitSymbol(symbol: string): { base: string; quote: string } | null {
  const match = QUOTE_SUFFIXES.find((quote) => symbol.endsWith(quote) && symbol.length > quote.length);
  if (!match) return null;
  return { base: symbol.slice(0, symbol.length - match.length), quote: match };
}

// Relative desirability of each asset when acting as the quote side of a pair.
// Higher rank = better quote currency. Only these assets are considered real
// quotes; anything else defaults to -1 (always treated as the base side).
const QUOTE_RANK: Record<string, number> = {
  EUR: 7,
  USDC: 6,
  USDT: 5,
  BUSD: 4,
  FDUSD: 3,
  BTC: 2,
  ETH: 1,
  BNB: 0,
};

function quoteRank(asset: string): number {
  return QUOTE_RANK[asset] ?? -1;
}

/**
 * Canonicalize a Binance spot symbol to its real (non-inverted) orientation.
 *
 * Binance sometimes stores the inverted side of a pair (e.g. `USDCBTC` instead
 * of `BTCUSDC`). We detect this by comparing the quote-desirability rank of the
 * two halves: if the parsed base outranks the parsed quote, the symbol is
 * inverted and we swap the sides back.
 *
 * @returns the canonical base/quote/symbol plus an `inverted` flag, or null if
 *          the symbol cannot be split into a known quote suffix.
 */
export function canonicalizePair(
  symbol: string,
): { base: string; quote: string; symbol: string; inverted: boolean } | null {
  const split = splitSymbol(symbol);
  if (split === null) return null;

  if (quoteRank(split.base) > quoteRank(split.quote)) {
    return {
      base: split.quote,
      quote: split.base,
      symbol: split.quote + split.base,
      inverted: true,
    };
  }

  return { base: split.base, quote: split.quote, symbol, inverted: false };
}
