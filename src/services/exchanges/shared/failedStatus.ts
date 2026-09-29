/**
 * Which stored raw events describe an operation the exchange cancelled,
 * rejected, failed or refunded. Shared by the normaliser, which drops them
 * before they become legs, and by the FIFO loader, which skips legs stored
 * before that rule existed.
 */

import { BINANCE_FAILED_STATUS, CRYPTO_EVENT_TYPE, type CryptoEventType } from '@/constants/finance';

/**
 * Payload field that carries each endpoint's status, and the values that mean
 * the record ended without moving funds. Event types without an entry (spot
 * fills, rewards, dust, CSV rows) only ever report completed operations.
 */
const FAILED_STATUS: Partial<Record<CryptoEventType, { field: string; values: readonly string[] }>> = {
  [CRYPTO_EVENT_TYPE.C2C]: { field: 'orderStatus', values: BINANCE_FAILED_STATUS.C2C },
  [CRYPTO_EVENT_TYPE.FIAT_PAYMENT]: { field: 'status', values: BINANCE_FAILED_STATUS.FIAT_PAYMENT },
  [CRYPTO_EVENT_TYPE.CONVERT]: { field: 'orderStatus', values: BINANCE_FAILED_STATUS.CONVERT },
  [CRYPTO_EVENT_TYPE.WITHDRAW]: { field: 'status', values: BINANCE_FAILED_STATUS.WITHDRAW },
  [CRYPTO_EVENT_TYPE.DEPOSIT]: { field: 'status', values: BINANCE_FAILED_STATUS.DEPOSIT },
};

/**
 * True for a record Binance cancelled, rejected, failed or refunded: no
 * funds moved, so it must not reach FIFO or the Modelo 100.
 *
 * In-flight states (a P2P order still TRADING, a withdrawal still
 * processing) keep producing legs. Ingestion stores the first payload it
 * sees and never refreshes it (ON CONFLICT DO NOTHING), so dropping an
 * in-flight record here would lose it for good once it completes.
 *
 * FIFO applies the same rule when it loads TaxableEvents, because legs
 * normalised before this filter existed are still stored.
 */
export function isFailedRawEvent(eventType: CryptoEventType, rawPayload: Record<string, unknown>): boolean {
  const rule = FAILED_STATUS[eventType];
  if (!rule) return false;
  const status = rawPayload[rule.field];
  if (status === null || status === undefined) return false;
  return rule.values.includes(String(status).toUpperCase());
}

/** Event types whose payload can carry a failed status; the rest never need their payload read. */
export const EVENT_TYPES_WITH_FAILED_STATUS = Object.keys(FAILED_STATUS);
