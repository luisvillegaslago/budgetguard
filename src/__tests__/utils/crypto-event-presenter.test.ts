/**
 * Unit tests for the crypto movements presenter.
 *
 * Pure function: feed a raw Binance payload + event type and assert the
 * human-readable concept key and signed amount legs. Payloads mirror the
 * real shapes captured by the Binance fetchers.
 */

import { CRYPTO_EVENT_TYPE } from '@/constants/finance';
import { AMOUNT_DIRECTION, formatCryptoAmount, presentCryptoEvent } from '@/utils/cryptoEventPresenter';

describe('presentCryptoEvent', () => {
  it('spot trade BUY → buy concept, BTC in / EUR out, pair BTC/EUR', () => {
    const result = presentCryptoEvent(CRYPTO_EVENT_TYPE.SPOT_TRADE, {
      symbol: 'BTCEUR',
      isBuyer: true,
      qty: '0.00682',
      quoteQty: '250.50',
    });

    expect(result.conceptKey).toBe('crypto.events.concept.buy');
    expect(result.pair).toBe('BTC/EUR');
    expect(result.legs).toEqual([
      { direction: AMOUNT_DIRECTION.IN, amount: '0.00682', asset: 'BTC' },
      { direction: AMOUNT_DIRECTION.OUT, amount: '250.50', asset: 'EUR' },
    ]);
  });

  it('grouped spot order → avg price (quote/base) and fills count when > 1', () => {
    const result = presentCryptoEvent(CRYPTO_EVENT_TYPE.SPOT_TRADE, {
      symbol: 'BTCEUR',
      isBuyer: true,
      qty: '0.03958',
      quoteQty: '2498.69678910',
      fills: 4,
    });

    expect(result.fills).toBe(4);
    expect(result.avgPrice?.asset).toBe('EUR');
    expect(Number(result.avgPrice?.amount)).toBeCloseTo(63130.29, 1);
  });

  it('single-fill spot order → no fills badge', () => {
    const result = presentCryptoEvent(CRYPTO_EVENT_TYPE.SPOT_TRADE, {
      symbol: 'BTCEUR',
      isBuyer: true,
      qty: '0.01',
      quoteQty: '631.3',
      fills: 1,
    });

    expect(result.fills).toBeUndefined();
    expect(result.avgPrice?.asset).toBe('EUR');
  });

  it('spot trade SELL → sell concept with reversed leg directions', () => {
    const result = presentCryptoEvent(CRYPTO_EVENT_TYPE.SPOT_TRADE, {
      symbol: 'BTCEUR',
      isBuyer: false,
      qty: '0.00682',
      quoteQty: '250.50',
    });

    expect(result.conceptKey).toBe('crypto.events.concept.sell');
    expect(result.legs[0]).toEqual({ direction: AMOUNT_DIRECTION.OUT, amount: '0.00682', asset: 'BTC' });
    expect(result.legs[1]).toEqual({ direction: AMOUNT_DIRECTION.IN, amount: '250.50', asset: 'EUR' });
  });

  it('convert → in leg first (received), out leg second (spent)', () => {
    const result = presentCryptoEvent(CRYPTO_EVENT_TYPE.CONVERT, {
      fromAsset: 'GENIUS',
      toAsset: 'BNB',
      fromAmount: '22.19691271',
      toAmount: '0.01482962',
    });

    expect(result.conceptKey).toBe('crypto.events.concept.convert');
    expect(result.pair).toBe('GENIUS → BNB');
    expect(result.legs).toEqual([
      { direction: AMOUNT_DIRECTION.IN, amount: '0.01482962', asset: 'BNB' },
      { direction: AMOUNT_DIRECTION.OUT, amount: '22.19691271', asset: 'GENIUS' },
    ]);
  });

  it('dust → reads nested detail, target defaults to BNB', () => {
    const result = presentCryptoEvent(CRYPTO_EVENT_TYPE.DUST, {
      detail: {
        fromAsset: 'GENIUS',
        amount: '22.19691271',
        transferedAmount: '0.01482962',
        transId: 376015025603,
      },
    });

    expect(result.conceptKey).toBe('crypto.events.concept.dust');
    expect(result.pair).toBe('GENIUS → BNB');
    expect(result.legs).toEqual([
      { direction: AMOUNT_DIRECTION.IN, amount: '0.01482962', asset: 'BNB' },
      { direction: AMOUNT_DIRECTION.OUT, amount: '22.19691271', asset: 'GENIUS' },
    ]);
  });

  it('flexible earn reward → single positive leg using rewards field', () => {
    const result = presentCryptoEvent(CRYPTO_EVENT_TYPE.EARN_FLEX, {
      asset: 'BNB',
      rewards: '0.00000328',
    });

    expect(result.conceptKey).toBe('crypto.events.concept.earn_flex');
    expect(result.legs).toEqual([{ direction: AMOUNT_DIRECTION.IN, amount: '0.00000328', asset: 'BNB' }]);
  });

  it('dividend → positive leg and surfaces enInfo as a note', () => {
    const result = presentCryptoEvent(CRYPTO_EVENT_TYPE.DIVIDEND, {
      asset: 'BNB',
      amount: '0.00006007',
      enInfo: 'HODLer Airdrops',
    });

    expect(result.conceptKey).toBe('crypto.events.concept.dividend');
    expect(result.note).toBe('HODLer Airdrops');
    expect(result.legs).toEqual([{ direction: AMOUNT_DIRECTION.IN, amount: '0.00006007', asset: 'BNB' }]);
  });

  it('withdraw → outbound amount plus a separate fee leg when fee > 0', () => {
    const result = presentCryptoEvent(CRYPTO_EVENT_TYPE.WITHDRAW, {
      coin: 'BTC',
      amount: '0.5',
      transactionFee: '0.0001',
    });

    expect(result.legs).toEqual([
      { direction: AMOUNT_DIRECTION.OUT, amount: '0.5', asset: 'BTC' },
      { direction: AMOUNT_DIRECTION.OUT, amount: '0.0001', asset: 'BTC' },
    ]);
  });

  it('unknown / csv_import → generic concept with best-effort leg', () => {
    const result = presentCryptoEvent(CRYPTO_EVENT_TYPE.CSV_IMPORT, {
      asset: 'ADA',
      amount: '10',
    });

    expect(result.conceptKey).toBe('crypto.events.concept.other');
    expect(result.legs).toEqual([{ direction: AMOUNT_DIRECTION.NEUTRAL, amount: '10', asset: 'ADA' }]);
  });
});

describe('formatCryptoAmount', () => {
  it('trims trailing zeros and groups by locale', () => {
    expect(formatCryptoAmount('0.00682000', 'en')).toBe('0.00682');
    expect(formatCryptoAmount('1234.5', 'en')).toBe('1,234.5');
  });

  it('returns the raw value when it is not numeric', () => {
    expect(formatCryptoAmount('not-a-number', 'en')).toBe('not-a-number');
  });
});
