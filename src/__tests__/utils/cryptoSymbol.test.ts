/**
 * Unit Tests: cryptoSymbol
 * Verifies splitSymbol and canonicalizePair, which normalize Binance spot
 * symbols (sometimes stored inverted, e.g. USDCBTC instead of BTCUSDC) into a
 * canonical base/quote orientation for the price chart feature.
 */

import { canonicalizePair, splitSymbol } from '@/utils/cryptoSymbol';

describe('cryptoSymbol', () => {
  describe('splitSymbol', () => {
    it('splits a known quote suffix', () => {
      expect(splitSymbol('BTCUSDC')).toEqual({ base: 'BTC', quote: 'USDC' });
    });

    it('returns null when no known quote suffix matches', () => {
      expect(splitSymbol('XYZ')).toBeNull();
    });
  });

  describe('canonicalizePair', () => {
    it('flips an inverted pair where the base outranks the quote', () => {
      expect(canonicalizePair('USDCBTC')).toEqual({
        base: 'BTC',
        quote: 'USDC',
        symbol: 'BTCUSDC',
        inverted: true,
      });
    });

    it('keeps a pair with a BTC quote as-is (BTC is a valid quote)', () => {
      expect(canonicalizePair('BNBBTC')).toEqual({
        base: 'BNB',
        quote: 'BTC',
        symbol: 'BNBBTC',
        inverted: false,
      });
    });

    it('keeps a EUR-quoted pair as-is', () => {
      expect(canonicalizePair('BTCEUR')).toEqual({
        base: 'BTC',
        quote: 'EUR',
        symbol: 'BTCEUR',
        inverted: false,
      });
    });

    it('keeps an already-canonical pair as-is', () => {
      expect(canonicalizePair('BTCUSDC')).toEqual({
        base: 'BTC',
        quote: 'USDC',
        symbol: 'BTCUSDC',
        inverted: false,
      });
    });

    it('returns null for an unsplittable symbol', () => {
      expect(canonicalizePair('XYZ')).toBeNull();
    });
  });
});
