/**
 * Presenter that turns a raw Binance event payload into a human-readable
 * shape for the crypto "Movements" table — closer to how Binance displays
 * the asset/order history than the raw `eventType` + JSON payload.
 *
 * Pure and dependency-light: takes the event type + raw payload and returns
 * a concept i18n key plus the signed amount legs to render. The component
 * resolves labels via `useTranslate` and formats amounts per locale.
 */

import { CRYPTO_EVENT_TYPE, type CryptoEventType } from '@/constants/finance';
import { splitSymbol } from '@/utils/cryptoSymbol';

export const AMOUNT_DIRECTION = {
  IN: 'in',
  OUT: 'out',
  NEUTRAL: 'neutral',
} as const;

export type AmountDirection = (typeof AMOUNT_DIRECTION)[keyof typeof AMOUNT_DIRECTION];

export interface AmountLeg {
  direction: AmountDirection;
  amount: string; // raw numeric string, formatted at render time
  asset: string;
}

export interface CryptoEventPresentation {
  /** i18n key for the concept label, e.g. `crypto.events.concept.buy`. */
  conceptKey: string;
  /** Optional trading pair shown next to the concept (e.g. `BTC/EUR`). */
  pair?: string;
  /** Signed amount legs rendered in the amount column. */
  legs: AmountLeg[];
  /** Optional free-text note from the exchange (e.g. dividend description). */
  note?: string;
  /** Average fill price for grouped spot orders (quote per 1 base unit). */
  avgPrice?: { amount: string; asset: string };
  /** Number of partial fills collapsed into a grouped spot order. */
  fills?: number;
}

const CONCEPT_PREFIX = 'crypto.events.concept.';

function str(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  if (value === null || value === undefined || value === '') return undefined;
  return String(value);
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function isPositive(value: string | undefined): boolean {
  if (value === undefined) return false;
  const num = Number.parseFloat(value);
  return Number.isFinite(num) && num > 0;
}

function leg(direction: AmountDirection, amount: string | undefined, asset: string | undefined): AmountLeg | null {
  if (!amount || !asset) return null;
  return { direction, amount, asset };
}

function compact(legs: Array<AmountLeg | null>): AmountLeg[] {
  return legs.filter((item): item is AmountLeg => item !== null);
}

/**
 * Maps a raw event to its display representation. Unknown shapes fall back to a
 * generic concept with whatever amount/asset fields can be recovered.
 */
export function presentCryptoEvent(
  eventType: CryptoEventType,
  payload: Record<string, unknown>,
): CryptoEventPresentation {
  switch (eventType) {
    case CRYPTO_EVENT_TYPE.SPOT_TRADE: {
      const symbol = str(payload, 'symbol') ?? '';
      const split = splitSymbol(symbol);
      const base = split?.base ?? symbol;
      const quote = split?.quote;
      const isBuyer = isTruthyFlag(payload.isBuyer);
      const qty = str(payload, 'qty');
      const quoteQty = str(payload, 'quoteQty');
      const fillsRaw = payload.fills;
      const fills = typeof fillsRaw === 'number' ? fillsRaw : undefined;
      // Average fill price = total quote / total base, when both sides exist.
      const qtyNum = qty ? Number.parseFloat(qty) : Number.NaN;
      const quoteNum = quoteQty ? Number.parseFloat(quoteQty) : Number.NaN;
      const avgPrice =
        quote && Number.isFinite(qtyNum) && qtyNum > 0 && Number.isFinite(quoteNum)
          ? { amount: String(quoteNum / qtyNum), asset: quote }
          : undefined;
      return {
        conceptKey: `${CONCEPT_PREFIX}${isBuyer ? 'buy' : 'sell'}`,
        pair: quote ? `${base}/${quote}` : base,
        avgPrice,
        fills: fills && fills > 1 ? fills : undefined,
        legs: compact([
          leg(isBuyer ? AMOUNT_DIRECTION.IN : AMOUNT_DIRECTION.OUT, qty, base),
          leg(isBuyer ? AMOUNT_DIRECTION.OUT : AMOUNT_DIRECTION.IN, quoteQty, quote),
        ]),
      };
    }

    case CRYPTO_EVENT_TYPE.CONVERT: {
      const fromAsset = str(payload, 'fromAsset');
      const toAsset = str(payload, 'toAsset');
      return {
        conceptKey: `${CONCEPT_PREFIX}convert`,
        pair: fromAsset && toAsset ? `${fromAsset} → ${toAsset}` : undefined,
        legs: compact([
          leg(AMOUNT_DIRECTION.IN, str(payload, 'toAmount'), toAsset),
          leg(AMOUNT_DIRECTION.OUT, str(payload, 'fromAmount'), fromAsset),
        ]),
      };
    }

    case CRYPTO_EVENT_TYPE.DUST: {
      const detail = (payload.detail as Record<string, unknown> | undefined) ?? payload;
      const fromAsset = str(detail, 'fromAsset');
      const target = str(detail, 'targetAsset') ?? 'BNB';
      return {
        conceptKey: `${CONCEPT_PREFIX}dust`,
        pair: fromAsset ? `${fromAsset} → ${target}` : undefined,
        legs: compact([
          leg(AMOUNT_DIRECTION.IN, str(detail, 'transferedAmount'), target),
          leg(AMOUNT_DIRECTION.OUT, str(detail, 'amount'), fromAsset),
        ]),
      };
    }

    case CRYPTO_EVENT_TYPE.EARN_FLEX:
    case CRYPTO_EVENT_TYPE.EARN_LOCKED:
    case CRYPTO_EVENT_TYPE.ETH_STAKING:
    case CRYPTO_EVENT_TYPE.STAKING_INTEREST: {
      const asset = str(payload, 'asset');
      const amount = str(payload, 'rewards') ?? str(payload, 'distributeAmount') ?? str(payload, 'amount');
      return {
        conceptKey: `${CONCEPT_PREFIX}${eventType}`,
        legs: compact([leg(AMOUNT_DIRECTION.IN, amount, asset)]),
      };
    }

    case CRYPTO_EVENT_TYPE.DIVIDEND: {
      return {
        conceptKey: `${CONCEPT_PREFIX}dividend`,
        note: str(payload, 'enInfo'),
        legs: compact([leg(AMOUNT_DIRECTION.IN, str(payload, 'amount'), str(payload, 'asset'))]),
      };
    }

    case CRYPTO_EVENT_TYPE.DEPOSIT: {
      return {
        conceptKey: `${CONCEPT_PREFIX}deposit`,
        legs: compact([leg(AMOUNT_DIRECTION.IN, str(payload, 'amount'), str(payload, 'coin'))]),
      };
    }

    case CRYPTO_EVENT_TYPE.WITHDRAW: {
      const coin = str(payload, 'coin');
      const fee = str(payload, 'transactionFee');
      return {
        conceptKey: `${CONCEPT_PREFIX}withdraw`,
        legs: compact([
          leg(AMOUNT_DIRECTION.OUT, str(payload, 'amount'), coin),
          isPositive(fee) ? leg(AMOUNT_DIRECTION.OUT, fee, coin) : null,
        ]),
      };
    }

    case CRYPTO_EVENT_TYPE.FIAT_ORDER: {
      const isWithdraw = str(payload, 'transactionType') === '1';
      const fiat = str(payload, 'fiatCurrency') ?? str(payload, 'fiat') ?? 'EUR';
      return {
        conceptKey: `${CONCEPT_PREFIX}${isWithdraw ? 'fiat-withdraw' : 'fiat-deposit'}`,
        legs: compact([leg(isWithdraw ? AMOUNT_DIRECTION.OUT : AMOUNT_DIRECTION.IN, str(payload, 'amount'), fiat)]),
      };
    }

    case CRYPTO_EVENT_TYPE.FIAT_PAYMENT: {
      const crypto = str(payload, 'cryptoCurrency');
      const fiat = str(payload, 'fiatCurrency') ?? 'EUR';
      return {
        conceptKey: `${CONCEPT_PREFIX}card-buy`,
        pair: crypto ? `${crypto}/${fiat}` : undefined,
        legs: compact([
          leg(AMOUNT_DIRECTION.IN, str(payload, 'obtainAmount'), crypto),
          leg(AMOUNT_DIRECTION.OUT, str(payload, 'sourceAmount'), fiat),
        ]),
      };
    }

    case CRYPTO_EVENT_TYPE.C2C: {
      const isBuy = (str(payload, 'tradeType') ?? '').toUpperCase() === 'BUY';
      const asset = str(payload, 'asset');
      const fiat = str(payload, 'fiat') ?? 'EUR';
      return {
        conceptKey: `${CONCEPT_PREFIX}${isBuy ? 'p2p-buy' : 'p2p-sell'}`,
        pair: asset ? `${asset}/${fiat}` : undefined,
        legs: compact([
          leg(isBuy ? AMOUNT_DIRECTION.IN : AMOUNT_DIRECTION.OUT, str(payload, 'amount'), asset),
          leg(isBuy ? AMOUNT_DIRECTION.OUT : AMOUNT_DIRECTION.IN, str(payload, 'totalPrice'), fiat),
        ]),
      };
    }

    default: {
      // csv_import or any future/unknown type: recover best-effort fields.
      const asset = str(payload, 'asset') ?? str(payload, 'coin');
      const amount = str(payload, 'amount') ?? str(payload, 'qty');
      return {
        conceptKey: `${CONCEPT_PREFIX}other`,
        legs: compact([leg(AMOUNT_DIRECTION.NEUTRAL, amount, asset)]),
      };
    }
  }
}

/** Formats a native crypto/fiat amount string for display, trimming noise. */
export function formatCryptoAmount(value: string, locale: string): string {
  const num = Number.parseFloat(value);
  if (!Number.isFinite(num)) return value;
  return new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-US', {
    maximumFractionDigits: 8,
  }).format(num);
}
