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
