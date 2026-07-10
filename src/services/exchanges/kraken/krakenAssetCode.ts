/**
 * Kraken asset-code normalisation.
 *
 * Kraken exports use legacy ISO-4217-style ticker codes (`XXBT`, `ZEUR`) and
 * appends suffixes to staking / bonded / parachain / futures balances
 * (`ADA.S`, `DOT.S`, `ETH2.S`). The rest of the crypto pipeline keys on the
 * canonical ticker (`BTC`, `EUR`, `ADA`, `ETH`), so every asset read from a
 * Kraken ledger must pass through here first.
 *
 * Rules (applied in order):
 *   1. Strip a single trailing `.S` / `.B` / `.P` / `.F` staking/bond suffix.
 *   2. Map a known legacy code to its canonical ticker (table below, incl.
 *      `ETH2` → `ETH`).
 *   3. Otherwise pass the code through unchanged (`SOL`, `ADA`, `USDT`, …).
 */

// Legacy Kraken code → canonical ticker. Kept as a typed Record so adding a
// mapping is a one-line edit and TypeScript guards the value shape.
const KRAKEN_ASSET_MAP: Record<string, string> = {
  // Crypto with the historical `X` prefix.
  XXBT: 'BTC',
  XBT: 'BTC',
  XETH: 'ETH',
  XXRP: 'XRP',
  XLTC: 'LTC',
  XXMR: 'XMR',
  XZEC: 'ZEC',
  XXLM: 'XLM',
  XREP: 'REP',
  XMLN: 'MLN',
  XETC: 'ETC',
  // Fiat with the historical `Z` prefix.
  ZEUR: 'EUR',
  ZUSD: 'USD',
  ZGBP: 'GBP',
  ZCAD: 'CAD',
  ZJPY: 'JPY',
  ZAUD: 'AUD',
  // ETH 2.0 staking principal collapses to plain ETH.
  ETH2: 'ETH',
};

// Trailing staking/bond/parachain/futures markers Kraken appends to balances.
const STAKING_SUFFIX = /\.(S|B|P|F)$/;

/** Normalise a single Kraken asset code to its canonical ticker. */
export function normalizeKrakenAsset(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return trimmed;
  const withoutSuffix = trimmed.replace(STAKING_SUFFIX, '');
  return KRAKEN_ASSET_MAP[withoutSuffix] ?? withoutSuffix;
}
