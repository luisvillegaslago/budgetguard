/**
 * NormalizationService — Phase 3 orchestrator.
 *
 * For each unprocessed BinanceRawEvent:
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
 */

import { type CryptoEventType } from '@/constants/finance';
import {
  bulkInsertTaxableEventsForUser,
  listUnnormalisedRawEventsForUser,
  markRawEventsNormalized,
  type TaxableEventInput,
} from '@/services/database/TaxableEventsRepository';
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
}

export type NormalizeProgressCallback = (processed: number, inserted: number) => void | Promise<void>;

/**
 * Normalise all pending raw events for a user. Pulls in batches of
 * BATCH_SIZE, processes them sequentially per-batch (parallelism is
 * limited by the price service cache hits anyway), inserts the resulting
 * TaxableEvents and returns a summary report.
 *
 * If `onProgress` is provided, it's invoked after every batch with the
 * cumulative counts — used by the sync orchestrator to surface live
 * normalize progress in the UI.
 */
export async function normalizeForUser(
  userId: number,
  onProgress?: NormalizeProgressCallback,
): Promise<NormalizeResult> {
  const result: NormalizeResult = { processed: 0, inserted: 0, skipped: 0, failed: 0, failures: [] };

  while (true) {
    const batch = await listUnnormalisedRawEventsForUser(userId, BATCH_SIZE);
    if (batch.length === 0) break;

    const legs: TaxableEventInput[] = [];
    for (const raw of batch) {
      result.processed++;
      const occurredAt = new Date(raw.occurredAt);
      const normalisedLegs = normalizeRawEvent({
        rawPayload: raw.rawPayload,
        eventType: raw.eventType as CryptoEventType,
        occurredAt,
      });

      if (normalisedLegs.length === 0) {
        result.skipped++;
        continue;
      }

      try {
        const enriched = await enrichLegsWithPrices(raw.rawEventId, occurredAt, normalisedLegs);
        legs.push(...enriched);
      } catch (error) {
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

    if (legs.length > 0) {
      const inserted = await bulkInsertTaxableEventsForUser(userId, legs);
      result.inserted += inserted;
    }

    // Stamp every raw event in the batch as processed — including those that
    // produced 0 legs (fiat_order) or failed pricing — so they're skipped on
    // future runs. Without this, the same 12 stale raws re-enter the queue
    // every sync.
    await markRawEventsNormalized(batch.map((r) => r.rawEventId));

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

async function enrichLegsWithPrices(
  rawEventId: string,
  occurredAt: Date,
  legs: NormalisedLeg[],
): Promise<TaxableEventInput[]> {
  const enriched: TaxableEventInput[] = [];

  for (const leg of legs) {
    const price = await getPriceEurCents(leg.asset, occurredAt);
    const grossValueEurCents = computeGrossEurCents(leg.quantityNative, price.eurPriceCents);

    let feeEurCents = 0;
    if (leg.feeAsset && leg.feeQuantityNative && Number(leg.feeQuantityNative) > 0) {
      const feePrice = await getPriceEurCents(leg.feeAsset, occurredAt);
      feeEurCents = computeGrossEurCents(leg.feeQuantityNative, feePrice.eurPriceCents);
    }

    enriched.push({
      rawEventId,
      kind: leg.kind,
      occurredAt,
      asset: leg.asset,
      quantityNative: leg.quantityNative,
      counterAsset: leg.counterAsset,
      counterQuantityNative: leg.counterQuantityNative,
      feeAsset: leg.feeAsset,
      feeQuantityNative: leg.feeQuantityNative,
      unitPriceEurCents: price.eurPriceCents,
      grossValueEurCents,
      feeEurCents,
      priceSource: price.source,
      contraprestacion: leg.contraprestacion,
    });
  }

  return enriched;
}
