/**
 * NormalizationService — Phase 3 orchestrator.
 *
 * For each unprocessed CryptoRawEvent:
 *   1. Run EventNormalizer to get one or more `NormalisedLeg`s.
 *   2. For each leg, resolve the EUR price (asset, occurredAt) via
 *      PriceService. Same for the fee asset if any.
 *   3. Persist as TaxableEvents in batches of 200 with ON CONFLICT DO
 *      NOTHING — re-runs are idempotent.
 *
 * Designed to be safe to call repeatedly: only un-normalised raws are
 * processed (LEFT JOIN pattern in listUnnormalisedRawEventsForUser).
 *
 * The PriceService cache means a sync of 4500 raw events triggers maybe
 * 200-300 unique (asset, dateUtc) lookups the first time, and 0 on
 * subsequent runs.
 *
 * A sync job hands in the budget of its round: the run stops between events
 * once it is spent, and what is left keeps NormalizedAt NULL for the next call.
 * An event still being priced at the round's cutoff is abandoned the same way.
 */

import { CRYPTO_EVENT_TYPE, CRYPTO_PRICE_SOURCE, type CryptoEventType } from '@/constants/finance';
import {
  bulkInsertTaxableEventsForUser,
  listUnnormalisedRawEventsForUser,
  markRawEventsNormalized,
  type TaxableEventInput,
} from '@/services/database/TaxableEventsRepository';
import {
  cutoffOf,
  isBudgetSpent,
  raceCutoff,
  type SyncBudget,
  type SyncCutoff,
  SyncCutoffError,
} from '@/services/exchanges/shared/syncBudget';
import { eurosToCents } from '@/utils/money';
import { BinanceClientError } from './BinanceClient';
import { type NormalisedLeg, normalizeRawEvent } from './EventNormalizer';
import { computeGrossEurCents, getPriceEurCents } from './PriceService';
import { syncDebug } from './syncDebug';

const BATCH_SIZE = 200;

export interface NormalizeResult {
  processed: number;
  inserted: number;
  skipped: number; // raw events that produced 0 legs
  failed: number;
  failures: Array<{ rawEventId: string; eventType: string; reason: string }>;
  // The budget ran out with events still queued; a later call continues.
  stoppedAtDeadline: boolean;
}

export type NormalizeProgressCallback = (processed: number, inserted: number) => void | Promise<void>;

type UnnormalisedRaw = Awaited<ReturnType<typeof listUnnormalisedRawEventsForUser>>[number];

/**
 * Normalise all pending raw events for a user. Pulls in batches of
 * BATCH_SIZE, processes them sequentially per-batch (parallelism is
 * limited by the price service cache hits anyway), inserts the resulting
 * TaxableEvents and returns a summary report.
 *
 * If `onProgress` is provided, it's invoked after every batch with the
 * cumulative counts — used by the sync orchestrator to surface live
 * normalize progress in the UI.
 *
 * With a `budget`, no event is started once it is spent; the one being priced
 * finishes, unless its price lookups are still running at the round's cutoff:
 * then it is abandoned, since a lookup can wait minutes on Binance or
 * CoinGecko. Only the events processed are stamped, so the rest stay in the
 * queue for the next call.
 */
export async function normalizeForUser(
  userId: number,
  onProgress?: NormalizeProgressCallback,
  budget?: SyncBudget,
): Promise<NormalizeResult> {
  const result: NormalizeResult = {
    processed: 0,
    inserted: 0,
    skipped: 0,
    failed: 0,
    failures: [],
    stoppedAtDeadline: false,
  };
  const cutoff = budget === undefined ? undefined : cutoffOf(budget);

  while (!result.stoppedAtDeadline) {
    // The queue is read before the budget: an empty one ends the run as
    // finished, so a round never hands off to one that finds nothing left.
    const batch = await listUnnormalisedRawEventsForUser(userId, BATCH_SIZE);
    if (batch.length === 0) break;
    if (isBudgetSpent(budget)) {
      result.stoppedAtDeadline = true;
      break;
    }

    const legs: TaxableEventInput[] = [];
    // One event at a time, in order, so the budget is read between events.
    const processedIds = await batch.reduce<Promise<string[]>>(async (previous, raw) => {
      const done = await previous;
      if (result.stoppedAtDeadline) return done;
      if (isBudgetSpent(budget)) {
        result.stoppedAtDeadline = true;
        return done;
      }
      try {
        await normaliseRawEvent(raw, result, legs, cutoff);
      } catch (error) {
        if (!(error instanceof SyncCutoffError)) throw error;
        // Not stamped: the next round prices it again from the start.
        result.stoppedAtDeadline = true;
        return done;
      }
      done.push(raw.rawEventId);
      return done;
    }, Promise.resolve([]));

    if (legs.length > 0) {
      const inserted = await bulkInsertTaxableEventsForUser(userId, legs);
      result.inserted += inserted;
    }

    // Stamp every raw event processed — including those that produced 0 legs
    // (fiat_order) or failed pricing — so they're skipped on future runs.
    // Without this, the same 12 stale raws re-enter the queue every sync.
    await markRawEventsNormalized(processedIds);

    if (onProgress) {
      await onProgress(result.processed, result.inserted);
    }

    // If the batch was short (< BATCH_SIZE) it means we drained the queue.
    if (batch.length < BATCH_SIZE) break;
  }

  syncDebug.endpointSummary('normalize', result.inserted, result.failed, result.processed);
  return result;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Counts one raw event into `result` and adds its priced legs to `legs`. When
 * its pricing is abandoned at `cutoff` it throws SyncCutoffError and counts
 * nothing: the pricing carries on unobserved, and whatever it finishes later
 * never reaches `result` or `legs`.
 */
async function normaliseRawEvent(
  raw: UnnormalisedRaw,
  result: NormalizeResult,
  legs: TaxableEventInput[],
  cutoff: SyncCutoff | undefined,
): Promise<void> {
  const occurredAt = new Date(raw.occurredAt);
  const normalisedLegs = normalizeRawEvent({
    rawPayload: raw.rawPayload,
    eventType: raw.eventType as CryptoEventType,
    occurredAt,
  });

  if (normalisedLegs.length === 0) {
    result.processed++;
    result.skipped++;
    return;
  }

  try {
    const enriched = await raceCutoff(
      enrichLegsWithPrices(raw.rawEventId, raw.eventType, occurredAt, normalisedLegs),
      cutoff,
    );
    result.processed++;
    legs.push(...enriched);
  } catch (error) {
    if (error instanceof SyncCutoffError) throw error;
    result.processed++;
    result.failed++;
    const reason =
      error instanceof BinanceClientError ? error.code : error instanceof Error ? error.message : String(error);
    result.failures.push({ rawEventId: raw.rawEventId, eventType: raw.eventType, reason });
    syncDebug.taskFailure(`normalize/${raw.eventType}`, {
      code: error instanceof BinanceClientError ? error.code : 'normalize_failed',
      binanceCode: error instanceof BinanceClientError ? error.binanceCode : undefined,
      statusCode: error instanceof BinanceClientError ? error.statusCode : undefined,
      cause: error instanceof BinanceClientError ? error.cause : error,
    });
  }
}

/**
 * The operations whose legs may be valued at their counter asset when their own
 * asset has no price. A dust sweep is a closed conversion Binance states in full
 * (the token swept and the BNB credited, fee included), so what the token
 * fetched is its value. Spot, convert and P2P legs are left to the price
 * cascade: an unresolved result there can be a passing outage, and pricing it
 * from the counter would take it out of the review queue for good.
 */
const COUNTER_VALUED_EVENT_TYPES = new Set<string>([CRYPTO_EVENT_TYPE.DUST]);

function unitPriceOf(grossValueEurCents: number, quantityNative: string): number {
  const qty = Number(quantityNative);
  return qty > 0 ? Math.round(grossValueEurCents / qty) : 0;
}

/**
 * EUR value of what the other side of the leg's operation paid, fee included
 * when it was charged in that same asset (the counter quantity is net of it),
 * or null when there is no counter or it has no price either.
 */
async function valueOfCounter(leg: NormalisedLeg, occurredAt: Date): Promise<number | null> {
  const counterQty = Number(leg.counterQuantityNative ?? 0);
  if (!leg.counterAsset || leg.counterAsset === leg.asset || !Number.isFinite(counterQty) || counterQty <= 0) {
    return null;
  }
  const feeInCounter = leg.feeAsset === leg.counterAsset ? Number(leg.feeQuantityNative ?? 0) : 0;
  const paid = counterQty + (Number.isFinite(feeInCounter) && feeInCounter > 0 ? feeInCounter : 0);
  const counterPrice = await getPriceEurCents(leg.counterAsset, occurredAt);
  if (counterPrice.source === CRYPTO_PRICE_SOURCE.UNRESOLVED) return null;
  const value = computeGrossEurCents(String(paid), counterPrice.eurPriceMicroCents);
  return value > 0 ? value : null;
}

async function priceLeg(
  rawEventId: string,
  eventType: string,
  occurredAt: Date,
  leg: NormalisedLeg,
): Promise<TaxableEventInput> {
  // When the consideration is exact euros (a EUR sell or a EUR purchase),
  // AEAT's value is "lo recibido/pagado" — the real euros exchanged — not a
  // daily-close estimate of the crypto side. Use the known counter amount
  // directly, which also avoids zeroing the value if the price lookup fails.
  const eurCounter =
    leg.counterAsset === 'EUR' && leg.counterQuantityNative != null && Number(leg.counterQuantityNative) > 0
      ? Number(leg.counterQuantityNative)
      : null;

  let unitPriceEurCents: number;
  let grossValueEurCents: number;
  let priceSource: string;
  if (eurCounter !== null) {
    grossValueEurCents = eurosToCents(eurCounter);
    unitPriceEurCents = unitPriceOf(grossValueEurCents, leg.quantityNative);
    priceSource = CRYPTO_PRICE_SOURCE.FIAT_COUNTER;
  } else {
    const price = await getPriceEurCents(leg.asset, occurredAt);
    // UnitPriceEurCents is display-only (may be 0 for sub-cent assets); gross
    // is computed from the micro-cent price so it doesn't quantize to 0.
    unitPriceEurCents = price.eurPriceCents;
    grossValueEurCents = computeGrossEurCents(leg.quantityNative, price.eurPriceMicroCents);
    priceSource = price.source;
    const counterValue =
      price.source === CRYPTO_PRICE_SOURCE.UNRESOLVED && COUNTER_VALUED_EVENT_TYPES.has(eventType)
        ? await valueOfCounter(leg, occurredAt)
        : null;
    if (counterValue !== null) {
      grossValueEurCents = counterValue;
      unitPriceEurCents = unitPriceOf(counterValue, leg.quantityNative);
      priceSource = CRYPTO_PRICE_SOURCE.COUNTER_ASSET;
    }
  }

  let feeEurCents = 0;
  if (leg.feeAsset && leg.feeQuantityNative && Number(leg.feeQuantityNative) > 0) {
    // EUR fees resolve to 1 EUR/unit via PriceService (eur_self), so this
    // already yields the exact euro fee; non-EUR fees are priced to EUR.
    const feePrice = await getPriceEurCents(leg.feeAsset, occurredAt);
    feeEurCents = computeGrossEurCents(leg.feeQuantityNative, feePrice.eurPriceMicroCents);
  }

  return {
    rawEventId,
    kind: leg.kind,
    occurredAt,
    asset: leg.asset,
    quantityNative: leg.quantityNative,
    counterAsset: leg.counterAsset,
    counterQuantityNative: leg.counterQuantityNative,
    feeAsset: leg.feeAsset,
    feeQuantityNative: leg.feeQuantityNative,
    unitPriceEurCents,
    grossValueEurCents,
    feeEurCents,
    priceSource,
    contraprestacion: leg.contraprestacion,
  };
}

/**
 * Prices the legs one after another, so a price already cached serves the next
 * leg. The first lookup starts synchronously, as a plain loop would: the caller
 * arms the round's cutoff timer right after this call returns.
 */
function enrichLegsWithPrices(
  rawEventId: string,
  eventType: string,
  occurredAt: Date,
  legs: NormalisedLeg[],
  priced: TaxableEventInput[] = [],
): Promise<TaxableEventInput[]> {
  const [leg, ...rest] = legs;
  if (leg === undefined) return Promise.resolve(priced);
  return priceLeg(rawEventId, eventType, occurredAt, leg).then((entry) =>
    enrichLegsWithPrices(rawEventId, eventType, occurredAt, rest, [...priced, entry]),
  );
}
