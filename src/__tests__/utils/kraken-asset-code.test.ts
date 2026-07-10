/**
 * Unit tests: Kraken asset-code normalisation.
 *
 * Covers the three rule layers — legacy X/Z prefixes, .S/.B/.P/.F suffix
 * stripping (incl. ETH2 / ETH2.S → ETH), and unchanged pass-through.
 */

import { normalizeKrakenAsset } from '@/services/exchanges/kraken/krakenAssetCode';

describe('normalizeKrakenAsset', () => {
  it('maps legacy X-prefixed crypto codes to canonical tickers', () => {
    expect(normalizeKrakenAsset('XXBT')).toBe('BTC');
    expect(normalizeKrakenAsset('XBT')).toBe('BTC');
    expect(normalizeKrakenAsset('XETH')).toBe('ETH');
    expect(normalizeKrakenAsset('XXRP')).toBe('XRP');
    expect(normalizeKrakenAsset('XLTC')).toBe('LTC');
    expect(normalizeKrakenAsset('XETC')).toBe('ETC');
  });

  it('maps legacy Z-prefixed fiat codes to ISO tickers', () => {
    expect(normalizeKrakenAsset('ZEUR')).toBe('EUR');
    expect(normalizeKrakenAsset('ZUSD')).toBe('USD');
    expect(normalizeKrakenAsset('ZGBP')).toBe('GBP');
    expect(normalizeKrakenAsset('ZJPY')).toBe('JPY');
  });

  it('strips a trailing staking/bond/parachain/futures suffix', () => {
    expect(normalizeKrakenAsset('ADA.S')).toBe('ADA');
    expect(normalizeKrakenAsset('DOT.S')).toBe('DOT');
    expect(normalizeKrakenAsset('USDT.B')).toBe('USDT');
    expect(normalizeKrakenAsset('SOL.F')).toBe('SOL');
  });

  it('collapses ETH2 and ETH2.S to plain ETH', () => {
    expect(normalizeKrakenAsset('ETH2')).toBe('ETH');
    expect(normalizeKrakenAsset('ETH2.S')).toBe('ETH');
  });

  it('passes through unknown / already-canonical codes unchanged', () => {
    expect(normalizeKrakenAsset('SOL')).toBe('SOL');
    expect(normalizeKrakenAsset('ADA')).toBe('ADA');
    expect(normalizeKrakenAsset('USDT')).toBe('USDT');
    expect(normalizeKrakenAsset('USDC')).toBe('USDC');
  });

  it('trims surrounding whitespace and tolerates the empty string', () => {
    expect(normalizeKrakenAsset('  XXBT  ')).toBe('BTC');
    expect(normalizeKrakenAsset('')).toBe('');
  });
});
