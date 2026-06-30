/**
 * FIFO matcher for Spanish Modelo 100 cripto reporting.
 *
 * Input: an ordered sequence of TaxableEvents (oldest → newest, across
 *        ALL fiscal years — FIFO needs the full history to know what
 *        lots are available when a disposal happens).
 *
 * Output: a list of CryptoDisposalDraft, one per `disposal` event, with
 *         AcquisitionValueCents and AcquisitionFeeCents derived from the
 *         lots consumed (proportional to the disposed quantity).
 *
 * Lot accounting:
 *   - acquisition / airdrop / staking_reward → push lot onto the asset's
 *     queue (cost = GrossValueEurCents, fee = FeeEurCents allocated
 *     proportionally if any).
 *   - transfer_in → push lot at fair market value at receipt time. AEAT
 *     accepts FMV as a reasonable proxy when the original cost basis from
 *     the source wallet is unknown; without this, externally-funded coins
 *     would disposal-against-empty-queue and be taxed at 100% gain.
 *   - disposal → consume lots from the head of the queue until the
 *     QuantityNative is covered. If the asset has fewer remaining lots
 *     than the disposal needs (data gap, partial sync, etc.), we mark
 *     the disposal as `incompleteCoverage = true` and use 0 for the
 *     missing portion's cost basis. Better than dropping the disposal.
 *   - transfer_out → no-op for FIFO (audit only).
 *
 * Decimal handling: native quantities can have up to 18 decimals. We use
 * Number (float64) for arithmetic — for crypto amounts under ~10^9 units
 * the precision loss is below 1e-7, far smaller than the 1-cent rounding
 * that happens when we convert to EUR cents at the end. EUR cents are
 * always integer rounded with Math.round.
 */

import {
  CRYPTO_CONTRAPRESTACION,
  CRYPTO_PRICE_SOURCE,
  CRYPTO_TAXABLE_KIND,
  type CryptoContraprestacion,
  type CryptoTaxableKind,
} from '@/constants/finance';
import { fiscalYearOf } from '@/utils/crypto/fiscalYear';

// ============================================================
// Types
// ============================================================

export interface FifoTaxableEvent {
  taxableEventId: string;
  kind: CryptoTaxableKind;
  occurredAt: string; // ISO
  asset: string;
  quantityNative: string;
  unitPriceEurCents: number;
  grossValueEurCents: number;
  feeEurCents: number;
  /** Price-resolution source of this leg (from TaxableEvents.PriceSource). */
  priceSource: string;
  contraprestacion: CryptoContraprestacion | null;
}

interface Lot {
  /** Original taxableEventId of the acquisition that opened the lot. */
  sourceEventId: string;
  /** Original ISO date so AcquisitionLotsJson can show "from BTC of 2024-08-12". */
  sourceDate: string;
  /** Quantity still available in the lot (after partial consumption). */
  quantityRemaining: number;
  /** Per-unit acquisition cost (EUR cents per native unit). Display only — may be 0 for sub-cent assets; cost basis is apportioned from grossCentsRemaining, NOT this. */
  unitCostCents: number;
  /** Precise stored gross still available in the lot (EUR cents). Apportioned pro-rata as the lot is consumed so sub-cent assets keep their basis. */
  grossCentsRemaining: number;
  /** Total fee paid on this lot (EUR cents). Allocated pro-rata when the lot is partially consumed. */
  feeCentsRemaining: number;
  /** Price-resolution source of the acquisition leg that opened the lot. */
  sourcePriceSource: string;
  /** True when the lot opened from a transfer_in (cost basis is an FMV proxy, not the real source-wallet basis). */
  sourceFmvProxy: boolean;
}

export interface ConsumedLotRecord {
  sourceEventId: string;
  sourceDate: string;
  quantityConsumed: string; // serialized to keep precision
  unitCostCents: number;
  acquisitionValueCents: number;
  acquisitionFeeCents: number;
  /** Price-resolution source of the lot's acquisition leg (e.g. 'binance_eur', 'unresolved'). */
  sourcePriceSource: string;
  /** True when this lot's cost basis is a transfer_in FMV proxy (M1). */
  fmvProxy: boolean;
}

export interface CryptoDisposalDraft {
  taxableEventId: string;
  fiscalYear: number;
  occurredAt: string;
  asset: string;
  contraprestacion: CryptoContraprestacion;
  quantityNative: string;
  transmissionValueCents: number;
  transmissionFeeCents: number;
  acquisitionValueCents: number;
  acquisitionFeeCents: number;
  gainLossCents: number;
  acquisitionLots: ConsumedLotRecord[];
  /** Price-resolution source of the disposal (transmission) leg. */
  priceSource: string;
  /** True when the FIFO queue ran out of lots before covering the disposal. */
  incompleteCoverage: boolean;
  /**
   * True when the disposal's transmission price was unresolved/0, OR any
   * consumed lot's cost was unresolved/0, OR any consumed lot is a transfer_in
   * FMV-proxy. Distinct from incompleteCoverage (queue exhaustion).
   */
  needsReview: boolean;
}

// ============================================================
// FIFO algorithm
// ============================================================

const ACQUISITION_KINDS = new Set<CryptoTaxableKind>([
  CRYPTO_TAXABLE_KIND.ACQUISITION,
  CRYPTO_TAXABLE_KIND.AIRDROP,
  CRYPTO_TAXABLE_KIND.STAKING_REWARD,
  CRYPTO_TAXABLE_KIND.TRANSFER_IN,
]);

/**
 * Run FIFO over a chronologically sorted list of taxable events. Returns
 * one draft disposal per `disposal` event, with cost basis derived from
 * the asset's lot queue at the time of the disposal.
 *
 * Caller is responsible for sorting the input by OccurredAt ASC.
 */
export function runFifo(events: FifoTaxableEvent[]): CryptoDisposalDraft[] {
  const lotsByAsset = new Map<string, Lot[]>();
  const disposals: CryptoDisposalDraft[] = [];

  for (const event of events) {
    if (ACQUISITION_KINDS.has(event.kind)) {
      pushLot(lotsByAsset, event);
      continue;
    }
    if (event.kind === CRYPTO_TAXABLE_KIND.DISPOSAL) {
      const draft = consumeFifo(lotsByAsset, event);
      if (draft) disposals.push(draft);
    }
    // transfer_out: no-op for FIFO (lots remain available; the user is
    // moving coins to their own external wallet, not disposing of them).
  }

  return disposals;
}

function pushLot(lotsByAsset: Map<string, Lot[]>, event: FifoTaxableEvent): void {
  const qty = Number(event.quantityNative);
  if (!Number.isFinite(qty) || qty <= 0) return;

  const queue = lotsByAsset.get(event.asset) ?? [];
  queue.push({
    sourceEventId: event.taxableEventId,
    sourceDate: event.occurredAt,
    quantityRemaining: qty,
    unitCostCents: event.unitPriceEurCents,
    grossCentsRemaining: event.grossValueEurCents,
    feeCentsRemaining: event.feeEurCents,
    sourcePriceSource: event.priceSource,
    sourceFmvProxy: event.kind === CRYPTO_TAXABLE_KIND.TRANSFER_IN,
  });
  lotsByAsset.set(event.asset, queue);
}

function consumeFifo(lotsByAsset: Map<string, Lot[]>, event: FifoTaxableEvent): CryptoDisposalDraft | null {
  // A disposal MUST have a contraprestacion — that's how we route to
  // casilla 1804-F vs 1804-N. If somehow it's null (corrupted normaliser
  // input) we skip rather than emit a bogus row.
  if (!event.contraprestacion) return null;

  let remaining = Number(event.quantityNative);
  if (!Number.isFinite(remaining) || remaining <= 0) return null;

  const queue = lotsByAsset.get(event.asset) ?? [];
  const consumedLots: ConsumedLotRecord[] = [];
  let totalAcquisitionCents = 0;
  let totalAcquisitionFeeCents = 0;

  while (remaining > 0 && queue.length > 0) {
    const lot = queue[0];
    if (!lot) break;

    const take = Math.min(lot.quantityRemaining, remaining);
    if (take <= 0) {
      // Defensive: shouldn't happen, but avoids infinite loops on bad data.
      queue.shift();
      continue;
    }

    // Apportion the lot's STORED gross (precise, sub-cent safe) proportionally
    // to the slice consumed. Multiplying a per-unit cent price here would
    // re-quantize sub-cent assets to 0. Full consumption takes whatever gross
    // is left so the apportioned slices sum to the lot's original gross exactly.
    const acquisitionValueCents =
      take >= lot.quantityRemaining
        ? lot.grossCentsRemaining
        : Math.round(lot.grossCentsRemaining * (take / lot.quantityRemaining));
    // Allocate the lot's remaining fee proportionally to the slice consumed.
    const feeShare = lot.quantityRemaining > 0 ? Math.round(lot.feeCentsRemaining * (take / lot.quantityRemaining)) : 0;

    consumedLots.push({
      sourceEventId: lot.sourceEventId,
      sourceDate: lot.sourceDate,
      quantityConsumed: take.toString(),
      unitCostCents: lot.unitCostCents,
      acquisitionValueCents,
      acquisitionFeeCents: feeShare,
      sourcePriceSource: lot.sourcePriceSource,
      fmvProxy: lot.sourceFmvProxy,
    });

    totalAcquisitionCents += acquisitionValueCents;
    totalAcquisitionFeeCents += feeShare;

    lot.quantityRemaining -= take;
    lot.grossCentsRemaining -= acquisitionValueCents;
    lot.feeCentsRemaining -= feeShare;
    remaining -= take;

    if (lot.quantityRemaining <= 1e-12) {
      // Treat tiny floating-point residuals as zero and drop the lot.
      queue.shift();
    }
  }

  const incompleteCoverage = remaining > 1e-12;
  const transmissionValueCents = event.grossValueEurCents;
  const transmissionFeeCents = event.feeEurCents;
  const gainLossCents =
    transmissionValueCents - transmissionFeeCents - totalAcquisitionCents - totalAcquisitionFeeCents;

  // needsReview: the transmission price is unresolved/0, OR any consumed lot's
  // cost is unresolved/0, OR any consumed lot is a transfer_in FMV proxy (M1).
  // Lot cost is checked via acquisitionValueCents (the apportioned basis), NOT
  // unitCostCents — after the sub-cent fix a valid lot can have unitCostCents=0.
  const transmissionUnreliable = event.priceSource === CRYPTO_PRICE_SOURCE.UNRESOLVED || transmissionValueCents === 0;
  const lotUnreliable = consumedLots.some(
    (lot) =>
      lot.sourcePriceSource === CRYPTO_PRICE_SOURCE.UNRESOLVED || lot.acquisitionValueCents === 0 || lot.fmvProxy,
  );
  const needsReview = transmissionUnreliable || lotUnreliable;

  return {
    taxableEventId: event.taxableEventId,
    fiscalYear: fiscalYearOf(event.occurredAt),
    occurredAt: event.occurredAt,
    asset: event.asset,
    contraprestacion: event.contraprestacion,
    quantityNative: event.quantityNative,
    transmissionValueCents,
    transmissionFeeCents,
    acquisitionValueCents: totalAcquisitionCents,
    acquisitionFeeCents: totalAcquisitionFeeCents,
    gainLossCents,
    acquisitionLots: consumedLots,
    priceSource: event.priceSource,
    incompleteCoverage,
    needsReview,
  };
}

// ============================================================
// Aggregation helpers (Modelo 100 casillas)
// ============================================================

export interface Modelo100CryptoSummary {
  fiscalYear: number;
  /** 1804-F: disposals against fiat (EUR sells, fiat payments, c2c, etc.) */
  casilla1804F: {
    transmissionValueCents: number;
    transmissionFeeCents: number;
    acquisitionValueCents: number;
    acquisitionFeeCents: number;
    gainLossCents: number;
    rowCount: number;
  };
  /** 1804-N: disposals against another crypto (swaps, dust, convert) */
  casilla1804N: {
    transmissionValueCents: number;
    transmissionFeeCents: number;
    acquisitionValueCents: number;
    acquisitionFeeCents: number;
    gainLossCents: number;
    rowCount: number;
  };
  /** 0304: airdrops and other non-disposal capital gains */
  casilla0304Cents: number;
  /** 0033: staking / Earn rewards (rendimientos del capital mobiliario) */
  casilla0033Cents: number;
  incompleteCoverageCount: number;
  needsReviewCount: number;
}

/**
 * Roll up FIFO disposals + the original taxable events into the four
 * Modelo 100 boxes the user needs to file. The repository computes this
 * with a single SQL aggregation in production — this helper is here for
 * unit tests and for the in-memory recompute path.
 */
export function summariseForModelo100(
  fiscalYear: number,
  disposals: CryptoDisposalDraft[],
  airdropEvents: FifoTaxableEvent[],
  stakingRewardEvents: FifoTaxableEvent[],
): Modelo100CryptoSummary {
  const yearDisposals = disposals.filter((d) => d.fiscalYear === fiscalYear);

  const summary: Modelo100CryptoSummary = {
    fiscalYear,
    casilla1804F: emptyBucket(),
    casilla1804N: emptyBucket(),
    casilla0304Cents: 0,
    casilla0033Cents: 0,
    incompleteCoverageCount: 0,
    needsReviewCount: 0,
  };

  yearDisposals.forEach((d) => {
    const bucket = d.contraprestacion === CRYPTO_CONTRAPRESTACION.FIAT ? summary.casilla1804F : summary.casilla1804N;
    bucket.transmissionValueCents += d.transmissionValueCents;
    bucket.transmissionFeeCents += d.transmissionFeeCents;
    bucket.acquisitionValueCents += d.acquisitionValueCents;
    bucket.acquisitionFeeCents += d.acquisitionFeeCents;
    bucket.gainLossCents += d.gainLossCents;
    bucket.rowCount += 1;
    if (d.incompleteCoverage) summary.incompleteCoverageCount += 1;
    if (d.needsReview) summary.needsReviewCount += 1;
  });

  airdropEvents
    .filter((e) => fiscalYearOf(e.occurredAt) === fiscalYear)
    .forEach((e) => {
      summary.casilla0304Cents += e.grossValueEurCents;
    });

  stakingRewardEvents
    .filter((e) => fiscalYearOf(e.occurredAt) === fiscalYear)
    .forEach((e) => {
      summary.casilla0033Cents += e.grossValueEurCents;
    });

  return summary;
}

function emptyBucket(): Modelo100CryptoSummary['casilla1804F'] {
  return {
    transmissionValueCents: 0,
    transmissionFeeCents: 0,
    acquisitionValueCents: 0,
    acquisitionFeeCents: 0,
    gainLossCents: 0,
    rowCount: 0,
  };
}

// ============================================================
// Per-element AEAT box derivation (Alta Elemento patrimonial)
// ============================================================

/** Cent fields needed to derive an element's printed boxes. */
export interface Modelo100ElementBoxInput {
  transmissionValueCents: number;
  transmissionFeeCents: number;
  acquisitionValueCents: number;
  acquisitionFeeCents: number;
}

export interface Modelo100ElementBoxes {
  /** 1804 — valor de transmisión NETO de gastos de venta. */
  box1804Cents: number;
  /** 1806 — valor de adquisición + gastos de compra. */
  box1806Cents: number;
  /** 1807 — pérdida (>= 0; 0 cuando hay ganancia o empate). */
  box1807Cents: number;
  /** 1809 — ganancia (>= 0; 0 cuando hay pérdida o empate). */
  box1809Cents: number;
}

/**
 * Derive the four printed AEAT boxes for one Elemento patrimonial.
 * 1804 is the transmission value NET of transmission fees; 1806 is the
 * acquisition value plus its fee; the signed difference splits into
 * 1809 (gain) or 1807 (loss). Result equals the stored gainLossCents.
 */
export function modelo100ElementBoxes(input: Modelo100ElementBoxInput): Modelo100ElementBoxes {
  const box1804Cents = input.transmissionValueCents - input.transmissionFeeCents;
  const box1806Cents = input.acquisitionValueCents + input.acquisitionFeeCents;
  const net = box1804Cents - box1806Cents;
  return {
    box1804Cents,
    box1806Cents,
    box1807Cents: net < 0 ? -net : 0,
    box1809Cents: net > 0 ? net : 0,
  };
}
