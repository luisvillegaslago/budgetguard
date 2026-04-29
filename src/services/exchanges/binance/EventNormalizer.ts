/**
 * EventNormalizer — pure functions that map a raw Binance event into
 * one or more "leg" descriptors that the NormalizationService later
 * enriches with EUR prices.
 *
 * No DB or HTTP work happens here on purpose: every function is testable
 * with a fixture payload, and the same normaliser logic powers both the
 * incremental sync hook and the future "re-normalise everything" admin
 * action when classifier rules change.
 *
 * Output shape (`NormalisedLeg`):
 *   - kind: disposal | acquisition | airdrop | staking_reward | transfer_in | transfer_out
 *   - asset, quantityNative, counterAsset, counterQuantityNative
 *   - feeAsset, feeQuantityNative
 *   - contraprestacion: 'F' (vs fiat) | 'N' (vs non-fiat) | null
 *   - The NormalizationService resolves the EUR price for `asset` at
 *     `occurredAt` via PriceService and computes:
 *       UnitPriceEurCents     = price at occurredAt
 *       GrossValueEurCents    = round(quantityNative * UnitPriceEurCents)
 *       FeeEurCents           = round(feeQuantityNative * priceOf(feeAsset))
 */

import {
  CRYPTO_CONTRAPRESTACION,
  CRYPTO_EVENT_TYPE,
  CRYPTO_TAXABLE_KIND,
  type CryptoContraprestacion,
  type CryptoEventType,
  type CryptoTaxableKind,
} from '@/constants/finance';

// ============================================================
// Types
// ============================================================

export interface NormalisedLeg {
  kind: CryptoTaxableKind;
  asset: string;
  quantityNative: string;
  counterAsset: string | null;
  counterQuantityNative: string | null;
  feeAsset: string | null;
  feeQuantityNative: string | null;
  contraprestacion: CryptoContraprestacion | null;
}

export interface NormaliserContext {
  rawPayload: Record<string, unknown>;
  eventType: CryptoEventType;
  occurredAt: Date;
}

// ============================================================
// Fiat / asset classification helpers
// ============================================================

const FIAT_CURRENCIES = new Set(['EUR', 'USD', 'GBP', 'CHF', 'TRY', 'ARS', 'BRL', 'MXN', 'AUD', 'CAD', 'JPY']);

/**
 * USD-pegged stablecoins. Technically AEAT classifies them as crypto
 * (so a swap into USDC is `N`, not `F`), but tax tools like finbooks
 * treat them as "pseudo-fiat" because the user economic exposure is to
 * USD, not to a volatile asset. We follow the finbooks convention: a
 * disposal whose counter is a USD-stablecoin gets routed to box 1804-F.
 *
 * `isFiat` (real fiat only) keeps doing its job — suppressing EUR/USD
 * legs entirely so we don't emit "disposal of EUR" rows. Stablecoins
 * remain emittable (USDC dust → BNB is a real disposal of USDC).
 */
const STABLECOIN_USD = new Set(['USDC', 'USDT', 'BUSD', 'FDUSD', 'DAI', 'TUSD']);

function isFiat(asset: string | undefined): boolean {
  return !!asset && FIAT_CURRENCIES.has(asset);
}

function isFiatLikeCounter(asset: string | undefined): boolean {
  return !!asset && (FIAT_CURRENCIES.has(asset) || STABLECOIN_USD.has(asset));
}

function contraprestacionFor(counterAsset: string | undefined): CryptoContraprestacion | null {
  if (!counterAsset) return null;
  return isFiatLikeCounter(counterAsset) ? CRYPTO_CONTRAPRESTACION.FIAT : CRYPTO_CONTRAPRESTACION.NON_FIAT;
}

// ============================================================
// Per-event normalisers
// ============================================================

/**
 * Spot trade (myTrades). A single trade always has a "base/quote" — we know
 * which side the user took from `isBuyer`. A buy of BTCUSDT means the user
 * disposed of USDT and acquired BTC (and vice-versa).
 *
 * Symbol parsing: Binance returns the symbol as a concatenation
 * (`BTCUSDT`, `BNBBTC`). We rely on a fixed list of well-known quote suffixes
 * to split the base/quote unambiguously.
 */
const QUOTE_SUFFIXES = [
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
];

function splitSymbol(symbol: string): { base: string; quote: string } | null {
  for (const quote of QUOTE_SUFFIXES) {
    if (symbol.endsWith(quote) && symbol.length > quote.length) {
      return { base: symbol.slice(0, symbol.length - quote.length), quote };
    }
  }
  return null;
}

export function normalizeSpotTrade(ctx: NormaliserContext): NormalisedLeg[] {
  const p = ctx.rawPayload;
  const symbol = String(p.symbol ?? '');
  const split = splitSymbol(symbol);
  if (!split) return [];

  const isBuyer = Boolean(p.isBuyer);
  const qty = String(p.qty ?? '0'); // base quantity
  const quoteQty = String(p.quoteQty ?? '0');
  const commission = String(p.commission ?? '0');
  const commissionAsset = (p.commissionAsset as string | null) ?? null;

  const baseLeg: NormalisedLeg = isBuyer
    ? {
        kind: CRYPTO_TAXABLE_KIND.ACQUISITION,
        asset: split.base,
        quantityNative: qty,
        counterAsset: split.quote,
        counterQuantityNative: quoteQty,
        feeAsset: commissionAsset,
        feeQuantityNative: commission,
        contraprestacion: contraprestacionFor(split.quote),
      }
    : {
        kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
        asset: split.base,
        quantityNative: qty,
        counterAsset: split.quote,
        counterQuantityNative: quoteQty,
        feeAsset: commissionAsset,
        feeQuantityNative: commission,
        contraprestacion: contraprestacionFor(split.quote),
      };

  // The other side of the trade. We model both sides so FIFO can pick them
  // up correctly: a swap BTC → USDT is BOTH a disposal of BTC and an
  // acquisition of USDT.
  const quoteLeg: NormalisedLeg = isBuyer
    ? {
        kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
        asset: split.quote,
        quantityNative: quoteQty,
        counterAsset: split.base,
        counterQuantityNative: qty,
        feeAsset: null,
        feeQuantityNative: null,
        contraprestacion: contraprestacionFor(split.base),
      }
    : {
        kind: CRYPTO_TAXABLE_KIND.ACQUISITION,
        asset: split.quote,
        quantityNative: quoteQty,
        counterAsset: split.base,
        counterQuantityNative: qty,
        feeAsset: null,
        feeQuantityNative: null,
        contraprestacion: contraprestacionFor(split.base),
      };

  // Suppress legs where the asset is fiat — we don't track EUR/USDT as a
  // "disposal" of fiat (it's just the cash leg of the trade).
  return [baseLeg, quoteLeg].filter((leg) => !isFiat(leg.asset));
}

/**
 * Convert (sapi/v1/convert/tradeFlow). Same idea as a spot trade but the
 * payload uses fromAsset/toAsset/fromAmount/toAmount and there's no "buyer"
 * concept — the user always traded fromAsset → toAsset.
 */
export function normalizeConvert(ctx: NormaliserContext): NormalisedLeg[] {
  const p = ctx.rawPayload;
  const fromAsset = String(p.fromAsset ?? '');
  const toAsset = String(p.toAsset ?? '');
  const fromAmount = String(p.fromAmount ?? '0');
  const toAmount = String(p.toAmount ?? '0');
  if (!fromAsset || !toAsset) return [];

  const disposal: NormalisedLeg = {
    kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
    asset: fromAsset,
    quantityNative: fromAmount,
    counterAsset: toAsset,
    counterQuantityNative: toAmount,
    feeAsset: null,
    feeQuantityNative: null,
    contraprestacion: contraprestacionFor(toAsset),
  };
  const acquisition: NormalisedLeg = {
    kind: CRYPTO_TAXABLE_KIND.ACQUISITION,
    asset: toAsset,
    quantityNative: toAmount,
    counterAsset: fromAsset,
    counterQuantityNative: fromAmount,
    feeAsset: null,
    feeQuantityNative: null,
    contraprestacion: contraprestacionFor(fromAsset),
  };

  return [disposal, acquisition].filter((leg) => !isFiat(leg.asset));
}

/**
 * Earn rewards (flexible + locked). The user receives `rewards` of `asset`
 * for free → staking_reward. No fee, no counter.
 */
export function normalizeEarnReward(ctx: NormaliserContext): NormalisedLeg[] {
  const p = ctx.rawPayload;
  const asset = String(p.asset ?? '');
  const rewards = String(p.rewards ?? p.amount ?? '0');
  if (!asset || rewards === '0') return [];

  return [
    {
      kind: CRYPTO_TAXABLE_KIND.STAKING_REWARD,
      asset,
      quantityNative: rewards,
      counterAsset: null,
      counterQuantityNative: null,
      feeAsset: null,
      feeQuantityNative: null,
      contraprestacion: null,
    },
  ];
}

/**
 * ETH staking history. Receives `distributeAmount` of `asset` (BETH/WBETH).
 */
export function normalizeEthStaking(ctx: NormaliserContext): NormalisedLeg[] {
  const p = ctx.rawPayload;
  const asset = String(p.asset ?? 'BETH');
  const amount = String(p.distributeAmount ?? p.amount ?? '0');
  if (amount === '0') return [];
  return [
    {
      kind: CRYPTO_TAXABLE_KIND.STAKING_REWARD,
      asset,
      quantityNative: amount,
      counterAsset: null,
      counterQuantityNative: null,
      feeAsset: null,
      feeQuantityNative: null,
      contraprestacion: null,
    },
  ];
}

/**
 * On-chain staking interest (sapi/v1/staking/history?txnType=INTEREST).
 */
export function normalizeStakingInterest(ctx: NormaliserContext): NormalisedLeg[] {
  const p = ctx.rawPayload;
  const asset = String(p.asset ?? '');
  const amount = String(p.amount ?? '0');
  if (!asset || amount === '0') return [];
  return [
    {
      kind: CRYPTO_TAXABLE_KIND.STAKING_REWARD,
      asset,
      quantityNative: amount,
      counterAsset: null,
      counterQuantityNative: null,
      feeAsset: null,
      feeQuantityNative: null,
      contraprestacion: null,
    },
  ];
}

/**
 * Asset dividends — the most heterogeneous bucket. Binance lumps together:
 *   - HODLer Airdrops, Launchpool, Megadrop → AIRDROP (casilla 0304)
 *   - BNB Vault, On-chain Yields, Flexible/Locked rewards → STAKING_REWARD (casilla 0033)
 *   - Soft Staking, Sol Boost, ETH 2.0 → STAKING_REWARD
 *
 * Classifier reads `enInfo` (English description) and falls back to AIRDROP
 * for unknown labels (most conservative for casilla 0304, which catches
 * any bonus the user couldn't expect).
 */
const STAKING_INFO_KEYWORDS = ['vault', 'yield', 'flexible', 'locked', 'soft staking', 'eth 2.0', 'boost', 'rewards'];
const AIRDROP_INFO_KEYWORDS = ['airdrop', 'launchpool', 'megadrop', 'distribution', 'bonus'];

function classifyDividend(enInfo: string): CryptoTaxableKind {
  const lower = enInfo.toLowerCase();
  if (STAKING_INFO_KEYWORDS.some((kw) => lower.includes(kw))) return CRYPTO_TAXABLE_KIND.STAKING_REWARD;
  if (AIRDROP_INFO_KEYWORDS.some((kw) => lower.includes(kw))) return CRYPTO_TAXABLE_KIND.AIRDROP;
  return CRYPTO_TAXABLE_KIND.AIRDROP; // conservative fallback
}

export function normalizeDividend(ctx: NormaliserContext): NormalisedLeg[] {
  const p = ctx.rawPayload;
  const asset = String(p.asset ?? '');
  const amount = String(p.amount ?? '0');
  const enInfo = String(p.enInfo ?? '');
  if (!asset || amount === '0') return [];
  return [
    {
      kind: classifyDividend(enInfo),
      asset,
      quantityNative: amount,
      counterAsset: null,
      counterQuantityNative: null,
      feeAsset: null,
      feeQuantityNative: null,
      contraprestacion: null,
    },
  ];
}

/**
 * Deposit (cripto coming into the wallet). Not fiscally relevant on its own
 * — we record it as `transfer_in` for traceability but FIFO ignores it.
 */
export function normalizeDeposit(ctx: NormaliserContext): NormalisedLeg[] {
  const p = ctx.rawPayload;
  const asset = String(p.coin ?? '');
  const amount = String(p.amount ?? '0');
  if (!asset || amount === '0') return [];
  return [
    {
      kind: CRYPTO_TAXABLE_KIND.TRANSFER_IN,
      asset,
      quantityNative: amount,
      counterAsset: null,
      counterQuantityNative: null,
      feeAsset: null,
      feeQuantityNative: null,
      contraprestacion: null,
    },
  ];
}

/**
 * Withdraw. Two legs:
 *   - transfer_out for the asset leaving
 *   - disposal of the same asset for `transactionFee` (the network fee paid
 *     in-kind is treated as a transmission by AEAT)
 */
export function normalizeWithdraw(ctx: NormaliserContext): NormalisedLeg[] {
  const p = ctx.rawPayload;
  const asset = String(p.coin ?? '');
  const amount = String(p.amount ?? '0');
  const fee = String(p.transactionFee ?? '0');
  if (!asset || amount === '0') return [];

  const legs: NormalisedLeg[] = [
    {
      kind: CRYPTO_TAXABLE_KIND.TRANSFER_OUT,
      asset,
      quantityNative: amount,
      counterAsset: null,
      counterQuantityNative: null,
      feeAsset: null,
      feeQuantityNative: null,
      contraprestacion: null,
    },
  ];

  if (Number(fee) > 0) {
    legs.push({
      kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
      asset,
      quantityNative: fee,
      counterAsset: null,
      counterQuantityNative: null,
      feeAsset: null,
      feeQuantityNative: null,
      contraprestacion: CRYPTO_CONTRAPRESTACION.NON_FIAT,
    });
  }
  return legs;
}

/**
 * Fiat order (deposit/withdrawal of EUR via SEPA/card). Not crypto-fiscal —
 * we record nothing. (Returned as an empty array so the dispatcher still
 * marks it as "processed" and doesn't keep retrying.)
 */
export function normalizeFiatOrder(_ctx: NormaliserContext): NormalisedLeg[] {
  return [];
}

/**
 * Fiat payment (card purchase of crypto). One leg: acquisition of the
 * crypto bought, with EUR as counter.
 */
export function normalizeFiatPayment(ctx: NormaliserContext): NormalisedLeg[] {
  const p = ctx.rawPayload;
  const cryptoAsset = String(p.cryptoCurrency ?? '');
  const fiatAsset = String(p.fiatCurrency ?? 'EUR');
  const cryptoAmount = String(p.obtainAmount ?? '0');
  const fiatAmount = String(p.sourceAmount ?? '0');
  const totalFee = String(p.totalFee ?? '0');
  if (!cryptoAsset || cryptoAmount === '0') return [];

  return [
    {
      kind: CRYPTO_TAXABLE_KIND.ACQUISITION,
      asset: cryptoAsset,
      quantityNative: cryptoAmount,
      counterAsset: fiatAsset,
      counterQuantityNative: fiatAmount,
      feeAsset: fiatAsset,
      feeQuantityNative: totalFee,
      contraprestacion: contraprestacionFor(fiatAsset),
    },
  ];
}

/**
 * Dust → BNB. Each detail line is one micro-disposal of a long-tail asset
 * paid in BNB (counter = BNB, contraprestacion = 'N').
 *
 * Binance lets the "Convert Small Balances to BNB" tool sweep fiat dust
 * too (e.g. EUR < 1€). Those rows must be ignored — fiat is not a crypto
 * disposal under AEAT.
 */
export function normalizeDust(ctx: NormaliserContext): NormalisedLeg[] {
  const p = ctx.rawPayload;
  const detail = (p.detail ?? {}) as Record<string, unknown>;
  const fromAsset = String(detail.fromAsset ?? '');
  const targetAsset = String(detail.targetAsset ?? 'BNB');
  const amount = String(detail.amount ?? '0');
  const transferred = String(detail.transferedAmount ?? '0');
  const serviceCharge = String(detail.serviceChargeAmount ?? '0');
  if (!fromAsset || amount === '0') return [];
  if (isFiat(fromAsset)) return [];

  return [
    {
      kind: CRYPTO_TAXABLE_KIND.DISPOSAL,
      asset: fromAsset,
      quantityNative: amount,
      counterAsset: targetAsset,
      counterQuantityNative: transferred,
      feeAsset: targetAsset,
      feeQuantityNative: serviceCharge,
      contraprestacion: CRYPTO_CONTRAPRESTACION.NON_FIAT,
    },
  ];
}

/**
 * C2C trade (P2P). Buy = acquisition of crypto vs fiat (F).
 *                  Sell = disposal of crypto vs fiat (F).
 */
export function normalizeC2c(ctx: NormaliserContext): NormalisedLeg[] {
  const p = ctx.rawPayload;
  const tradeType = String(p.tradeType ?? '');
  const asset = String(p.asset ?? '');
  const fiat = String(p.fiat ?? 'EUR');
  const amount = String(p.amount ?? '0');
  const totalPrice = String(p.totalPrice ?? '0');
  const commission = String(p.commission ?? '0');
  if (!asset || amount === '0') return [];

  const kind = tradeType === 'BUY' ? CRYPTO_TAXABLE_KIND.ACQUISITION : CRYPTO_TAXABLE_KIND.DISPOSAL;

  return [
    {
      kind,
      asset,
      quantityNative: amount,
      counterAsset: fiat,
      counterQuantityNative: totalPrice,
      feeAsset: asset, // commission is in the same asset
      feeQuantityNative: commission,
      contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT,
    },
  ];
}

// ============================================================
// Dispatcher
// ============================================================

const NORMALIZERS: Partial<Record<CryptoEventType, (ctx: NormaliserContext) => NormalisedLeg[]>> = {
  [CRYPTO_EVENT_TYPE.SPOT_TRADE]: normalizeSpotTrade,
  [CRYPTO_EVENT_TYPE.CONVERT]: normalizeConvert,
  [CRYPTO_EVENT_TYPE.EARN_FLEX]: normalizeEarnReward,
  [CRYPTO_EVENT_TYPE.EARN_LOCKED]: normalizeEarnReward,
  [CRYPTO_EVENT_TYPE.ETH_STAKING]: normalizeEthStaking,
  [CRYPTO_EVENT_TYPE.STAKING_INTEREST]: normalizeStakingInterest,
  [CRYPTO_EVENT_TYPE.DIVIDEND]: normalizeDividend,
  [CRYPTO_EVENT_TYPE.DEPOSIT]: normalizeDeposit,
  [CRYPTO_EVENT_TYPE.WITHDRAW]: normalizeWithdraw,
  [CRYPTO_EVENT_TYPE.FIAT_ORDER]: normalizeFiatOrder,
  [CRYPTO_EVENT_TYPE.FIAT_PAYMENT]: normalizeFiatPayment,
  [CRYPTO_EVENT_TYPE.DUST]: normalizeDust,
  [CRYPTO_EVENT_TYPE.C2C]: normalizeC2c,
};

export function normalizeRawEvent(ctx: NormaliserContext): NormalisedLeg[] {
  const fn = NORMALIZERS[ctx.eventType];
  if (!fn) return [];
  return fn(ctx);
}
