/**
 * Unit tests for the EventNormalizer.
 *
 * Each function is pure (no DB, no HTTP), so we test by feeding raw payloads
 * captured from real Binance responses and asserting the resulting
 * NormalisedLeg[] matches expectations.
 */

import { CRYPTO_CONTRAPRESTACION, CRYPTO_EVENT_TYPE, CRYPTO_TAXABLE_KIND } from '@/constants/finance';
import {
  normalizeC2c,
  normalizeConvert,
  normalizeDividend,
  normalizeDust,
  normalizeEarnReward,
  normalizeFiatPayment,
  normalizeRawEvent,
  normalizeSpotTrade,
  normalizeStakingInterest,
  normalizeWithdraw,
} from '@/services/exchanges/binance/EventNormalizer';

const FIXED_DATE = new Date('2025-06-15T10:00:00Z');

describe('normalizeSpotTrade', () => {
  it('BUY of BTCUSDT → acquisition of BTC (F, USD-stablecoin counter) + disposal of USDT (N, BTC counter)', () => {
    // USD-pegged stablecoins (USDC, USDT, BUSD, FDUSD, DAI, TUSD) are
    // treated as pseudo-fiat counters per the finbooks alignment: a
    // disposal whose counter is one of them is routed to box 1804-F.
    // The other side (USDT disposal vs BTC) keeps N because BTC isn't fiat.
    const legs = normalizeSpotTrade({
      eventType: CRYPTO_EVENT_TYPE.SPOT_TRADE,
      occurredAt: FIXED_DATE,
      rawPayload: {
        symbol: 'BTCUSDT',
        isBuyer: true,
        qty: '0.01',
        quoteQty: '600',
        commission: '0.000005',
        commissionAsset: 'BTC',
      },
    });

    expect(legs).toHaveLength(2);
    expect(legs[0]).toEqual({
      kind: CRYPTO_TAXABLE_KIND.ACQUISITION,
      asset: 'BTC',
      quantityNative: '0.01',
      counterAsset: 'USDT',
      counterQuantityNative: '600',
      feeAsset: 'BTC',
      feeQuantityNative: '0.000005',
      contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT,
    });
    expect(legs[1]).toEqual({
      kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
      asset: 'USDT',
      quantityNative: '600',
      counterAsset: 'BTC',
      counterQuantityNative: '0.01',
      feeAsset: null,
      feeQuantityNative: null,
      contraprestacion: CRYPTO_CONTRAPRESTACION.NON_FIAT,
    });
  });

  it('SELL of BTCEUR → disposal of BTC (F) + filters out the EUR leg', () => {
    const legs = normalizeSpotTrade({
      eventType: CRYPTO_EVENT_TYPE.SPOT_TRADE,
      occurredAt: FIXED_DATE,
      rawPayload: {
        symbol: 'BTCEUR',
        isBuyer: false,
        qty: '0.005',
        quoteQty: '300',
        commission: '0.3',
        commissionAsset: 'EUR',
      },
    });

    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({
      kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
      asset: 'BTC',
      contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT,
    });
  });

  it('returns empty for unknown symbol suffix', () => {
    const legs = normalizeSpotTrade({
      eventType: CRYPTO_EVENT_TYPE.SPOT_TRADE,
      occurredAt: FIXED_DATE,
      rawPayload: { symbol: 'UNKNOWNBLAH', isBuyer: true, qty: '1', quoteQty: '1' },
    });
    expect(legs).toHaveLength(0);
  });
});

describe('normalizeConvert', () => {
  it('BTC → USDT routes BTC disposal as F (USDT is a USD-stablecoin counter)', () => {
    const legs = normalizeConvert({
      eventType: CRYPTO_EVENT_TYPE.CONVERT,
      occurredAt: FIXED_DATE,
      rawPayload: { fromAsset: 'BTC', toAsset: 'USDT', fromAmount: '0.01', toAmount: '600' },
    });

    expect(legs).toHaveLength(2);
    expect(legs[0]?.kind).toBe(CRYPTO_TAXABLE_KIND.DISPOSAL);
    expect(legs[0]?.asset).toBe('BTC');
    expect(legs[0]?.contraprestacion).toBe(CRYPTO_CONTRAPRESTACION.FIAT);
    expect(legs[1]?.kind).toBe(CRYPTO_TAXABLE_KIND.ACQUISITION);
    expect(legs[1]?.asset).toBe('USDT');
    expect(legs[1]?.contraprestacion).toBe(CRYPTO_CONTRAPRESTACION.NON_FIAT);
  });

  it('EUR → BTC filters the EUR leg, keeps acquisition of BTC (F)', () => {
    const legs = normalizeConvert({
      eventType: CRYPTO_EVENT_TYPE.CONVERT,
      occurredAt: FIXED_DATE,
      rawPayload: { fromAsset: 'EUR', toAsset: 'BTC', fromAmount: '500', toAmount: '0.008' },
    });

    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({
      kind: CRYPTO_TAXABLE_KIND.ACQUISITION,
      asset: 'BTC',
      contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT,
    });
  });

  it.each([
    'USDC',
    'BUSD',
    'FDUSD',
    'DAI',
    'TUSD',
  ])('BTC → %s routes BTC disposal as F (USD-stablecoin counter)', (stable) => {
    const legs = normalizeConvert({
      eventType: CRYPTO_EVENT_TYPE.CONVERT,
      occurredAt: FIXED_DATE,
      rawPayload: { fromAsset: 'BTC', toAsset: stable, fromAmount: '0.01', toAmount: '600' },
    });
    expect(legs[0]?.kind).toBe(CRYPTO_TAXABLE_KIND.DISPOSAL);
    expect(legs[0]?.contraprestacion).toBe(CRYPTO_CONTRAPRESTACION.FIAT);
  });
});

describe('normalizeEarnReward', () => {
  it('flexible reward → staking_reward', () => {
    const legs = normalizeEarnReward({
      eventType: CRYPTO_EVENT_TYPE.EARN_FLEX,
      occurredAt: FIXED_DATE,
      rawPayload: { asset: 'USDC', rewards: '0.5', projectId: 'X' },
    });
    expect(legs).toEqual([
      {
        kind: CRYPTO_TAXABLE_KIND.STAKING_REWARD,
        asset: 'USDC',
        quantityNative: '0.5',
        counterAsset: null,
        counterQuantityNative: null,
        feeAsset: null,
        feeQuantityNative: null,
        contraprestacion: null,
      },
    ]);
  });

  it('zero amount returns empty (no useless taxable event)', () => {
    const legs = normalizeEarnReward({
      eventType: CRYPTO_EVENT_TYPE.EARN_FLEX,
      occurredAt: FIXED_DATE,
      rawPayload: { asset: 'BNB', rewards: '0' },
    });
    expect(legs).toHaveLength(0);
  });
});

describe('normalizeStakingInterest', () => {
  it('on-chain staking interest → staking_reward', () => {
    const legs = normalizeStakingInterest({
      eventType: CRYPTO_EVENT_TYPE.STAKING_INTEREST,
      occurredAt: FIXED_DATE,
      rawPayload: { asset: 'BNB', amount: '0.001', time: 1700000000000 },
    });
    expect(legs[0]).toMatchObject({ kind: CRYPTO_TAXABLE_KIND.STAKING_REWARD, asset: 'BNB' });
  });
});

describe('normalizeDividend (classification)', () => {
  it('classifies "On-chain Yields" as staking_reward', () => {
    const legs = normalizeDividend({
      eventType: CRYPTO_EVENT_TYPE.DIVIDEND,
      occurredAt: FIXED_DATE,
      rawPayload: { asset: 'BNB', amount: '0.001', enInfo: 'On-chain Yields' },
    });
    expect(legs[0]?.kind).toBe(CRYPTO_TAXABLE_KIND.STAKING_REWARD);
  });

  it('classifies "BNB Vault" as staking_reward', () => {
    const legs = normalizeDividend({
      eventType: CRYPTO_EVENT_TYPE.DIVIDEND,
      occurredAt: FIXED_DATE,
      rawPayload: { asset: 'BNB', amount: '0.0001', enInfo: 'BNB Vault' },
    });
    expect(legs[0]?.kind).toBe(CRYPTO_TAXABLE_KIND.STAKING_REWARD);
  });

  it('classifies "HODLer Airdrops" as airdrop', () => {
    const legs = normalizeDividend({
      eventType: CRYPTO_EVENT_TYPE.DIVIDEND,
      occurredAt: FIXED_DATE,
      rawPayload: { asset: 'BREV', amount: '100', enInfo: 'HODLer Airdrops' },
    });
    expect(legs[0]?.kind).toBe(CRYPTO_TAXABLE_KIND.AIRDROP);
  });

  it('classifies "Launchpool" as airdrop', () => {
    const legs = normalizeDividend({
      eventType: CRYPTO_EVENT_TYPE.DIVIDEND,
      occurredAt: FIXED_DATE,
      rawPayload: { asset: 'OPN', amount: '50', enInfo: 'Launchpool' },
    });
    expect(legs[0]?.kind).toBe(CRYPTO_TAXABLE_KIND.AIRDROP);
  });

  it('falls back to airdrop for unknown enInfo (conservative)', () => {
    const legs = normalizeDividend({
      eventType: CRYPTO_EVENT_TYPE.DIVIDEND,
      occurredAt: FIXED_DATE,
      rawPayload: { asset: 'XYZ', amount: '1', enInfo: 'Some New Thing' },
    });
    expect(legs[0]?.kind).toBe(CRYPTO_TAXABLE_KIND.AIRDROP);
  });
});

describe('normalizeWithdraw', () => {
  it('produces transfer_out + disposal of fee', () => {
    const legs = normalizeWithdraw({
      eventType: CRYPTO_EVENT_TYPE.WITHDRAW,
      occurredAt: FIXED_DATE,
      rawPayload: { coin: 'BTC', amount: '0.1', transactionFee: '0.0005' },
    });
    expect(legs).toHaveLength(2);
    expect(legs[0]).toMatchObject({ kind: CRYPTO_TAXABLE_KIND.TRANSFER_OUT, asset: 'BTC' });
    expect(legs[1]).toMatchObject({
      kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
      asset: 'BTC',
      quantityNative: '0.0005',
      contraprestacion: CRYPTO_CONTRAPRESTACION.NON_FIAT,
    });
  });

  it('skips fee leg when fee is 0', () => {
    const legs = normalizeWithdraw({
      eventType: CRYPTO_EVENT_TYPE.WITHDRAW,
      occurredAt: FIXED_DATE,
      rawPayload: { coin: 'BTC', amount: '0.1', transactionFee: '0' },
    });
    expect(legs).toHaveLength(1);
    expect(legs[0]?.kind).toBe(CRYPTO_TAXABLE_KIND.TRANSFER_OUT);
  });
});

describe('normalizeFiatPayment', () => {
  it('card buy of BTC with EUR → acquisition F', () => {
    const legs = normalizeFiatPayment({
      eventType: CRYPTO_EVENT_TYPE.FIAT_PAYMENT,
      occurredAt: FIXED_DATE,
      rawPayload: {
        cryptoCurrency: 'BTC',
        fiatCurrency: 'EUR',
        obtainAmount: '0.005',
        sourceAmount: '300',
        totalFee: '5',
      },
    });
    expect(legs[0]).toMatchObject({
      kind: CRYPTO_TAXABLE_KIND.ACQUISITION,
      asset: 'BTC',
      counterAsset: 'EUR',
      contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT,
    });
  });
});

describe('normalizeDust', () => {
  it('USDC → BNB dust → disposal of USDC, counter BNB, fee BNB, N', () => {
    const legs = normalizeDust({
      eventType: CRYPTO_EVENT_TYPE.DUST,
      occurredAt: FIXED_DATE,
      rawPayload: {
        detail: {
          fromAsset: 'USDC',
          targetAsset: 'BNB',
          amount: '4',
          transferedAmount: '0.004',
          serviceChargeAmount: '0.00008',
        },
      },
    });
    expect(legs).toHaveLength(1);
    expect(legs[0]).toEqual({
      kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
      asset: 'USDC',
      quantityNative: '4',
      counterAsset: 'BNB',
      counterQuantityNative: '0.004',
      feeAsset: 'BNB',
      feeQuantityNative: '0.00008',
      contraprestacion: CRYPTO_CONTRAPRESTACION.NON_FIAT,
    });
  });
});

describe('normalizeC2c', () => {
  it('BUY → acquisition F', () => {
    const legs = normalizeC2c({
      eventType: CRYPTO_EVENT_TYPE.C2C,
      occurredAt: FIXED_DATE,
      rawPayload: {
        tradeType: 'BUY',
        asset: 'USDT',
        fiat: 'EUR',
        amount: '100',
        totalPrice: '95',
        commission: '0.5',
      },
    });
    expect(legs[0]).toMatchObject({
      kind: CRYPTO_TAXABLE_KIND.ACQUISITION,
      asset: 'USDT',
      counterAsset: 'EUR',
      contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT,
    });
  });

  it('SELL → disposal F', () => {
    const legs = normalizeC2c({
      eventType: CRYPTO_EVENT_TYPE.C2C,
      occurredAt: FIXED_DATE,
      rawPayload: {
        tradeType: 'SELL',
        asset: 'USDT',
        fiat: 'EUR',
        amount: '50',
        totalPrice: '47',
        commission: '0',
      },
    });
    expect(legs[0]).toMatchObject({
      kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
      contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT,
    });
  });
});

describe('normalizeRawEvent (dispatcher)', () => {
  it('routes by eventType', () => {
    const legs = normalizeRawEvent({
      eventType: CRYPTO_EVENT_TYPE.STAKING_INTEREST,
      occurredAt: FIXED_DATE,
      rawPayload: { asset: 'BNB', amount: '1' },
    });
    expect(legs[0]?.kind).toBe(CRYPTO_TAXABLE_KIND.STAKING_REWARD);
  });

  it('returns empty for unknown event type', () => {
    const legs = normalizeRawEvent({
      eventType: 'unknown_type' as CryptoEventType,
      occurredAt: FIXED_DATE,
      rawPayload: {},
    });
    expect(legs).toHaveLength(0);
  });
});

// silence the unused-import warning for the dispatcher test
type CryptoEventType = (typeof CRYPTO_EVENT_TYPE)[keyof typeof CRYPTO_EVENT_TYPE];
