'use client';

/**
 * CryptoPriceChart — mini-TradingView per traded spot pair ("Cotizaciones").
 *
 * Renders a lightweight-charts (v5) candlestick chart for the selected pair with:
 *  - buy/sell markers placed on the candle that contains each order, labelled
 *    with the rounded base quantity,
 *  - a hover tooltip showing the full order detail (side, quantity, price, EUR
 *    cost, date), anchored away from the edges so it never clips,
 *  - a TradingView-style "position tool" band (PositionBandPrimitive) from the
 *    average entry to the exit/live price, coloured by P&L and left unfinished
 *    (extended to the right edge) while the position is open,
 *  - a P&L summary panel (native quote + EUR equivalence, unrealized/realized %).
 *
 * Orders are already grouped per Binance order upstream (getPairTrades); CSV
 * imports without an orderId stay as individual markers (no orderId to group by).
 *
 * Money convention: native crypto amounts stay as NUMERIC strings; we parse to
 * Number only for chart rendering and percentage/colour decisions. EUR figures
 * arrive in cents and go through money.ts helpers.
 */

import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { HelpCircle, Info, ListOrdered } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type PositionBandData, PositionBandPrimitive } from '@/components/crypto/positionBandPrimitive';
import { ChartCard } from '@/components/dashboard/charts/ChartCard';
import { CHART_COLORS } from '@/components/dashboard/charts/chartConfig';
import { Select } from '@/components/ui/Select';
import { StringSuggestionCombobox } from '@/components/ui/StringSuggestionCombobox';
import { Tooltip } from '@/components/ui/Tooltip';
import { KLINE_INTERVAL, type KlineInterval } from '@/constants/finance';
import {
  type ClosedTradeWithEur,
  type PairPositionDetail,
  type PairTradeWithEur,
  type PositionLotWithEur,
  useCryptoKlines,
  useCryptoPairPosition,
  useCryptoSpotPairs,
  useCryptoTicker,
} from '@/hooks/useCryptoChart';
import { useTranslate } from '@/hooks/useTranslations';
import type { Candle } from '@/types/cryptoChart';
import { TRADE_SIDE } from '@/types/cryptoChart';
import { formatCurrency } from '@/utils/money';

// Dark-theme palette for the chart surface (kept local — guard tokens are CSS vars).
const CHART_BG = '#0F172A';
const CHART_GRID = 'rgba(148, 163, 184, 0.12)';
const CHART_TEXT = '#94A3B8';
const CHART_BORDER = 'rgba(148, 163, 184, 0.2)';

const INTERVAL_OPTIONS: KlineInterval[] = [KLINE_INTERVAL.ONE_HOUR, KLINE_INTERVAL.FOUR_HOURS, KLINE_INTERVAL.ONE_DAY];

/**
 * Locale-aware amount formatter with adaptive precision: large numbers get 2
 * decimals, sub-unit values get more — so prices like 75265.638 read as
 * "75.265,64" and 0.00978837 reads as "0,009788" instead of a noisy tail.
 */
function formatAmount(value: number, locale: string): string {
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.0001 ? 6 : 8;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
}

/** Locale-aware signed percentage with 2 decimals. */
function formatPercent(ratio: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
  }).format(ratio);
}

/** Locale-aware signed euro amount (e.g. "+12,34 €" / "-8,00 €") for P&L. */
function formatSignedEur(euros: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-US', {
    style: 'currency',
    currency: 'EUR',
    signDisplay: 'exceptZero',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(euros);
}

/**
 * Shared tooltip body for a "position tool" band — used by both closed
 * round-trips and open lots. Shows the base quantity, the date(s), the amount
 * invested in the quote asset plus its EUR equivalent, the entry/exit prices,
 * and the P&L as a percentage and (when EUR is resolvable) signed euros.
 *
 * EUR figures are best-effort: invested EUR and the EUR P&L are each omitted
 * gracefully when their underlying price (historical entry/exit or live) could
 * not be resolved, so the line never shows a misleading "0 €".
 *
 * `entryEurPerBase` / `exitEurPerBase` are euros per ONE base unit at the entry
 * and exit/live moments respectively.
 */
function buildBandTooltipLines(params: {
  qty: number;
  entryPrice: number;
  exitPrice: number;
  entryEurPerBase: number | null;
  exitEurPerBase: number | null;
  base: string;
  quote: string;
  locale: string;
  dateLine: string;
  investedLabel: string;
  entryLabel: string;
  exitLabel: string;
}): string[] {
  const { qty, entryPrice, exitPrice, entryEurPerBase, exitEurPerBase, base, quote, locale } = params;
  const investedQuote = qty * entryPrice;
  const investedEur = entryEurPerBase != null ? qty * entryEurPerBase : null;
  const ratio = entryPrice !== 0 ? (exitPrice - entryPrice) / entryPrice : 0;
  const pnlEur = entryEurPerBase != null && exitEurPerBase != null ? qty * (exitEurPerBase - entryEurPerBase) : null;

  const investedLine =
    `${params.investedLabel}: ${formatAmount(investedQuote, locale)} ${quote}` +
    (investedEur != null ? ` (${formatCurrency(Math.round(investedEur * 100))})` : '');

  return [
    `${formatAmount(qty, locale)} ${base}`,
    params.dateLine,
    investedLine,
    `${params.entryLabel}: ${formatAmount(entryPrice, locale)} ${quote}`,
    `${params.exitLabel}: ${formatAmount(exitPrice, locale)} ${quote}`,
    pnlEur != null
      ? `${formatPercent(ratio, locale)} · ${formatSignedEur(pnlEur, locale)}`
      : formatPercent(ratio, locale),
  ];
}

export function CryptoPriceChart() {
  const { t, locale } = useTranslate();
  const pairsQuery = useCryptoSpotPairs();
  const [symbol, setSymbol] = useState<string | null>(null);
  const [interval, setInterval] = useState<KlineInterval>(KLINE_INTERVAL.ONE_DAY);

  const pairs = pairsQuery.data ?? [];
  const suggestions = useMemo(() => pairs.map((p) => p.symbol), [pairs]);
  // Show the trade count next to each pair, e.g. "BTCUSDC (44)".
  const tradeCounts = useMemo(() => new Map(pairs.map((p) => [p.symbol, p.tradeCount])), [pairs]);
  const getOptionLabel = useCallback(
    (sym: string) => {
      const count = tradeCounts.get(sym);
      return count != null ? `${sym} (${count})` : sym;
    },
    [tradeCounts],
  );

  // Default the selector to the first available pair once loaded.
  useEffect(() => {
    const first = suggestions[0];
    if (!symbol && first) setSymbol(first);
  }, [symbol, suggestions]);

  const positionQuery = useCryptoPairPosition(symbol);
  // Start the candles a little BEFORE the first trade: pull the range start back
  // by a margin so the candle that contains the first buy is included (Binance
  // returns candles with openTime >= startTime, so an exact-instant start would
  // drop the entry's own candle) and there's some context before it.
  const fromMs = useMemo(() => {
    const first = positionQuery.data?.trades?.[0];
    if (!first) return undefined;
    const tradeMs = new Date(first.occurredAt).getTime();
    const margin = Math.max((Date.now() - tradeMs) * 0.05, 7 * 24 * 60 * 60 * 1000);
    return Math.floor(tradeMs - margin);
  }, [positionQuery.data]);
  const klinesQuery = useCryptoKlines(symbol, interval, fromMs);
  const tickerQuery = useCryptoTicker(symbol);

  const position = positionQuery.data ?? null;
  const candles = klinesQuery.data ?? [];
  const livePrice = tickerQuery.data?.price ?? null;
  const baseEurPrice = tickerQuery.data?.baseEurPrice ?? null;

  const isLoading = pairsQuery.isLoading || klinesQuery.isLoading || positionQuery.isLoading;
  const isError = pairsQuery.isError || klinesQuery.isError || positionQuery.isError;
  const isEmpty = !isLoading && !isError && (suggestions.length === 0 || candles.length === 0);

  const intervalToggle = (
    <Select
      aria-label={t('crypto.prices.interval-label')}
      value={interval}
      onChange={(e) => setInterval(e.target.value as KlineInterval)}
      className="w-28"
    >
      {INTERVAL_OPTIONS.map((iv) => (
        <option key={iv} value={iv}>
          {t(`crypto.prices.intervals.${iv}`)}
        </option>
      ))}
    </Select>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <StringSuggestionCombobox
            value={symbol}
            onChange={setSymbol}
            suggestions={suggestions}
            allowCreate={false}
            getOptionLabel={getOptionLabel}
            placeholder={t('crypto.prices.pair-placeholder')}
            searchPlaceholder={t('crypto.prices.pair-search')}
            disabled={pairsQuery.isLoading || suggestions.length === 0}
          />
        </div>
        {intervalToggle}
      </div>

      {position && (
        <PairSummaryPanel position={position} livePrice={livePrice} baseEurPrice={baseEurPrice} locale={locale} />
      )}

      <ChartCard
        title={symbol ?? t('crypto.prices.title')}
        subtitle={t('crypto.prices.subtitle')}
        action={
          position && position.trades.length > 0 ? (
            <TradesList trades={position.trades} base={position.base} locale={locale} />
          ) : undefined
        }
        isLoading={isLoading}
        isError={isError}
        isEmpty={isEmpty}
        emptyMessage={t('crypto.prices.empty')}
        errorMessage={t('crypto.prices.error')}
        onRetry={() => {
          klinesQuery.refetch();
          positionQuery.refetch();
        }}
      >
        <CandlestickChart
          candles={candles}
          trades={position?.trades ?? []}
          base={position?.base ?? ''}
          quote={position?.quote ?? ''}
          openLots={position?.openLots ?? []}
          closedTrades={position?.closedTrades ?? []}
          livePrice={livePrice}
          baseEurPrice={baseEurPrice}
          locale={locale}
          buyLabel={t('crypto.prices.marker.buy')}
          sellLabel={t('crypto.prices.marker.sell')}
          priceLabel={t('crypto.prices.tooltip.price')}
          costLabel={t('crypto.prices.tooltip.cost')}
          investedLabel={t('crypto.prices.tooltip.invested')}
          entryLabel={t('crypto.prices.entry-line')}
          liveLabel={t('crypto.prices.live-line')}
          exitLabel={t('crypto.prices.exit-line')}
          closedLabel={t('crypto.prices.closed')}
        />
      </ChartCard>
    </div>
  );
}

// ============================================================
// Summary panel
// ============================================================

interface PairSummaryPanelProps {
  position: PairPositionDetail;
  livePrice: number | null;
  baseEurPrice: number | null;
  locale: string;
}

function PairSummaryPanel({ position, livePrice, baseEurPrice, locale }: PairSummaryPanelProps) {
  const { t } = useTranslate();
  const { quote, base, avgEntryPrice, avgEntryEurCents, netQtyBase, realizedPnlQuote, realizedCostQuote, isOpen } =
    position;

  const avgEntry = avgEntryPrice != null ? Number(avgEntryPrice) : null;
  const realizedPnl = Number(realizedPnlQuote);
  const realizedCost = Number(realizedCostQuote);

  // Unrealized % for open positions; realized % for closed/partly-closed ones.
  const unrealizedRatio =
    isOpen && avgEntry != null && avgEntry > 0 && livePrice != null ? (livePrice - avgEntry) / avgEntry : null;
  const realizedRatio = realizedCost > 0 ? realizedPnl / realizedCost : null;

  return (
    <div className="card grid grid-cols-2 sm:grid-cols-4 gap-4">
      <Metric label={t('crypto.prices.summary.avg-entry')} help={t('crypto.prices.summary.avg-entry-help')}>
        <span className="font-semibold text-foreground">
          {avgEntry != null ? `${formatAmount(avgEntry, locale)} ${quote}` : '—'}
        </span>
        {avgEntryEurCents != null && (
          <span className="block text-xs text-guard-muted">{formatCurrency(avgEntryEurCents)}</span>
        )}
      </Metric>

      <Metric label={t('crypto.prices.summary.live-price')} help={t('crypto.prices.summary.live-price-help')}>
        <span className="font-semibold text-foreground">
          {livePrice != null ? `${formatAmount(livePrice, locale)} ${quote}` : '—'}
        </span>
        {baseEurPrice != null && (
          <span className="block text-xs text-guard-muted">{formatCurrency(Math.round(baseEurPrice * 100))}</span>
        )}
      </Metric>

      <Metric label={t('crypto.prices.summary.net-qty')} help={t('crypto.prices.summary.net-qty-help')}>
        <span className="font-semibold text-foreground">
          {formatAmount(Number(netQtyBase), locale)} {base}
        </span>
      </Metric>

      <Metric
        label={isOpen ? t('crypto.prices.summary.unrealized') : t('crypto.prices.summary.realized')}
        help={isOpen ? t('crypto.prices.summary.unrealized-help') : t('crypto.prices.summary.realized-help')}
      >
        {isOpen ? (
          unrealizedRatio != null ? (
            <span
              className={unrealizedRatio >= 0 ? 'font-semibold text-guard-success' : 'font-semibold text-guard-danger'}
            >
              {formatPercent(unrealizedRatio, locale)}
            </span>
          ) : (
            <span className="text-guard-muted">—</span>
          )
        ) : (
          <>
            <span className={realizedPnl >= 0 ? 'font-semibold text-guard-success' : 'font-semibold text-guard-danger'}>
              {formatAmount(realizedPnl, locale)} {quote}
            </span>
            {realizedRatio != null && (
              <span
                className={realizedRatio >= 0 ? 'block text-xs text-guard-success' : 'block text-xs text-guard-danger'}
              >
                {formatPercent(realizedRatio, locale)}
              </span>
            )}
          </>
        )}
      </Metric>
    </div>
  );
}

function Metric({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 mb-1">
        <p className="text-xs text-guard-muted">{label}</p>
        {help && (
          <Tooltip content={help} side="top" className="max-w-xs font-normal normal-case">
            <Info className="h-3 w-3 text-guard-muted/70 cursor-help" aria-hidden="true" />
          </Tooltip>
        )}
      </div>
      <div className="text-sm truncate">{children}</div>
    </div>
  );
}

/** A hover tooltip listing every trade of the pair (newest first): side,
 * quantity, EUR-equivalent value and date, aligned in columns. */
function TradesList({ trades, base, locale }: { trades: PairTradeWithEur[]; base: string; locale: string }) {
  const { t } = useTranslate();
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
  const rows = [...trades].reverse();

  return (
    <Tooltip
      side="bottom"
      align="end"
      className="max-w-none p-2"
      content={
        <div className="max-h-72 overflow-y-auto">
          <div
            className="grid items-center gap-x-4 gap-y-1 text-left text-xs tabular-nums"
            style={{ gridTemplateColumns: 'max-content max-content max-content max-content' }}
          >
            {rows.map((trade, index) => {
              const isBuy = trade.side === TRADE_SIDE.BUY;
              return (
                <Fragment key={`${trade.occurredAt}-${trade.qtyBase}-${index}`}>
                  <span className={`font-medium ${isBuy ? 'text-guard-success' : 'text-guard-danger'}`}>
                    {isBuy ? t('crypto.prices.marker.buy') : t('crypto.prices.marker.sell')}
                  </span>
                  <span className="whitespace-nowrap text-right font-medium">
                    {formatAmount(Number(trade.qtyBase), locale)} {base}
                  </span>
                  <span className="whitespace-nowrap text-right opacity-90">
                    {trade.valueEurCents != null ? formatCurrency(trade.valueEurCents) : '—'}
                  </span>
                  <span className="whitespace-nowrap opacity-55">{dateFmt.format(new Date(trade.occurredAt))}</span>
                </Fragment>
              );
            })}
          </div>
        </div>
      }
    >
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs text-guard-muted transition-colors hover:text-foreground"
      >
        <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
        {t('crypto.prices.trades-count', { n: trades.length })}
        <HelpCircle className="h-3 w-3 opacity-50" aria-hidden="true" />
      </button>
    </Tooltip>
  );
}

// ============================================================
// Candlestick chart (imperative lightweight-charts lifecycle)
// ============================================================

interface CandlestickChartProps {
  candles: Candle[];
  trades: PairTradeWithEur[];
  base: string;
  quote: string;
  openLots: PositionLotWithEur[];
  closedTrades: ClosedTradeWithEur[];
  livePrice: number | null;
  baseEurPrice: number | null;
  locale: string;
  buyLabel: string;
  sellLabel: string;
  priceLabel: string;
  costLabel: string;
  investedLabel: string;
  entryLabel: string;
  liveLabel: string;
  exitLabel: string;
  closedLabel: string;
}

/** A tooltip block: a coloured title (Buy/Sell) plus plain detail lines. */
interface TooltipEntry {
  isBuy: boolean;
  title: string;
  lines: string[];
}

/** A band plus the tooltip to show when its % badge is hovered. */
interface BandWithTooltip {
  band: PositionBandData;
  tooltip: TooltipEntry;
}

interface TooltipState {
  x: number;
  y: number;
  anchorRight: boolean;
  anchorBottom: boolean;
  entries: TooltipEntry[];
}

function CandlestickChart({
  candles,
  trades,
  base,
  quote,
  openLots,
  closedTrades,
  livePrice,
  baseEurPrice,
  locale,
  buyLabel,
  sellLabel,
  priceLabel,
  costLabel,
  investedLabel,
  entryLabel,
  liveLabel,
  exitLabel,
  closedLabel,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  // Live band primitives paired with the tooltip to show when their % badge is
  // hovered. Read by the crosshair handler for badge-only hit-testing.
  const bandHitsRef = useRef<Array<{ primitive: PositionBandPrimitive; tooltip: TooltipEntry }>>([]);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Anchor a trade to the candle that contains it (so markers and the band line
  // up at any interval). Returns the candle time, or null if it predates the
  // visible range.
  const candleTimes = useMemo(() => candles.map((c) => c.time), [candles]);
  const containingCandle = useCallback(
    (iso: string): number | null => {
      const sec = Math.floor(new Date(iso).getTime() / 1000);
      let found: number | null = null;
      candleTimes.forEach((ct) => {
        if (ct <= sec) found = ct;
      });
      return found;
    },
    [candleTimes],
  );

  // Markers + a time→trades index for the hover tooltip.
  const markerInfo = useMemo(() => {
    const byTime = new Map<number, PairTradeWithEur[]>();
    const markers: SeriesMarker<Time>[] = [];

    trades.forEach((trade, index) => {
      const candleTime = containingCandle(trade.occurredAt);
      if (candleTime === null) return;
      const isBuy = trade.side === TRADE_SIDE.BUY;
      markers.push({
        time: candleTime as UTCTimestamp,
        position: isBuy ? 'belowBar' : 'aboveBar',
        color: isBuy ? CHART_COLORS.income : CHART_COLORS.expense,
        shape: isBuy ? 'arrowUp' : 'arrowDown',
        text: formatAmount(Number(trade.qtyBase), locale),
        id: `${trade.side}-${index}`,
      });
      const bucket = byTime.get(candleTime) ?? [];
      bucket.push(trade);
      byTime.set(candleTime, bucket);
    });

    markers.sort((a, b) => (a.time as number) - (b.time as number));
    return { markers, byTime };
  }, [trades, locale, containingCandle]);

  // "Position tool" bands: one per CLOSED round-trip (entry → exit, realized %)
  // and one per OPEN buy lot (entry → live price, still running). Each carries
  // the detail shown on hover.
  const bands = useMemo<BandWithTooltip[]>(() => {
    const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
    const lastCandle = (candleTimes[candleTimes.length - 1] ?? null) as Time | null;
    const result: BandWithTooltip[] = [];

    // Closed round-trips: entry candle → exit candle, straight right edge.
    closedTrades.forEach((closed) => {
      const entry = Number(closed.entryPrice);
      const exit = Number(closed.exitPrice);
      if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(exit)) return;
      const startTime = containingCandle(closed.entryOccurredAt) ?? candleTimes[0];
      const endTime = containingCandle(closed.exitOccurredAt) ?? lastCandle;
      if (startTime == null || endTime == null) return;
      result.push({
        band: {
          entryPrice: entry,
          exitPrice: exit,
          startTime: startTime as Time,
          endTime: endTime as Time,
          lastCandleTime: lastCandle,
          isProfit: exit >= entry,
        },
        tooltip: {
          isBuy: exit >= entry,
          title: closedLabel,
          lines: buildBandTooltipLines({
            qty: Number(closed.qtyBase),
            entryPrice: entry,
            exitPrice: exit,
            entryEurPerBase: closed.entryEurCents != null ? closed.entryEurCents / 100 : null,
            exitEurPerBase: closed.exitEurCents != null ? closed.exitEurCents / 100 : null,
            base,
            quote,
            locale,
            dateLine: `${dateFmt.format(new Date(closed.entryOccurredAt))} → ${dateFmt.format(new Date(closed.exitOccurredAt))}`,
            investedLabel,
            entryLabel,
            exitLabel,
          }),
        },
      });
    });

    // Open lots: entry candle → live price, extended past the last candle.
    if (livePrice !== null && Number.isFinite(livePrice)) {
      openLots.forEach((lot) => {
        const entry = Number(lot.entryPrice);
        if (!Number.isFinite(entry) || entry <= 0) return;
        const startTime = containingCandle(lot.occurredAt) ?? candleTimes[0];
        if (startTime == null) return;
        const qty = Number(lot.qtyOpen);
        result.push({
          band: {
            entryPrice: entry,
            exitPrice: livePrice,
            startTime: startTime as Time,
            endTime: null,
            lastCandleTime: lastCandle,
            isProfit: livePrice >= entry,
          },
          tooltip: {
            isBuy: true,
            title: buyLabel,
            lines: buildBandTooltipLines({
              qty,
              entryPrice: entry,
              exitPrice: livePrice,
              entryEurPerBase: lot.entryEurCents != null ? lot.entryEurCents / 100 : null,
              // Live EUR price of one base unit (already euros, not cents).
              exitEurPerBase: baseEurPrice,
              base,
              quote,
              locale,
              dateLine: dateFmt.format(new Date(lot.occurredAt)),
              investedLabel,
              entryLabel,
              exitLabel: liveLabel,
            }),
          },
        });
      });
    }

    return result;
  }, [
    openLots,
    closedTrades,
    livePrice,
    baseEurPrice,
    containingCandle,
    candleTimes,
    locale,
    base,
    quote,
    buyLabel,
    investedLabel,
    entryLabel,
    liveLabel,
    exitLabel,
    closedLabel,
  ]);

  // Create the chart once on mount; dispose on unmount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: { background: { color: CHART_BG }, textColor: CHART_TEXT },
      grid: { vertLines: { color: CHART_GRID }, horzLines: { color: CHART_GRID } },
      rightPriceScale: { borderColor: CHART_BORDER },
      timeScale: { borderColor: CHART_BORDER, timeVisible: true },
      // Allow dragging the price (Y) axis to scale it vertically, and the time
      // axis horizontally; double-click an axis resets it to auto.
      handleScale: {
        axisPressedMouseMove: { time: true, price: true },
        axisDoubleClickReset: { time: true, price: true },
        mouseWheel: true,
        pinch: true,
      },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: CHART_COLORS.income,
      downColor: CHART_COLORS.expense,
      borderVisible: false,
      wickUpColor: CHART_COLORS.income,
      wickDownColor: CHART_COLORS.expense,
    });

    chartRef.current = chart;
    seriesRef.current = series;
    markersRef.current = createSeriesMarkers(series, []);

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
    };
  }, []);

  // Update candle data + markers whenever data changes.
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    series.setData(
      candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })),
    );
    markersRef.current?.setMarkers(markerInfo.markers);
    chart.timeScale().fitContent();
  }, [candles, markerInfo]);

  // Adapt the price-axis precision to the pair's price magnitude, so sub-unit
  // pairs (e.g. BNBBTC ≈ 0.009812) show enough decimals instead of rounding to
  // ~0.01 — matching how TradingView renders the right-hand axis.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const reference = livePrice ?? candles[candles.length - 1]?.close;
    if (reference == null || !Number.isFinite(reference)) return;
    const abs = Math.abs(reference);
    const precision = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.0001 ? 6 : 8;
    series.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } });
  }, [livePrice, candles]);

  // Attach one band primitive per band (open lot / closed round-trip), refreshing
  // when they move (e.g. the live price ticks or a new pair loads). Each primitive
  // is paired with its tooltip in bandHitsRef so the hover handler can map a
  // hovered % badge back to the right detail.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    const created = bands.map((item) => {
      const primitive = new PositionBandPrimitive(item.band, (ratio) => formatPercent(ratio, locale));
      series.attachPrimitive(primitive);
      return { primitive, tooltip: item.tooltip };
    });
    bandHitsRef.current = created;
    return () => {
      created.forEach(({ primitive }) => {
        series.detachPrimitive(primitive);
      });
      bandHitsRef.current = [];
    };
  }, [bands, locale]);

  // Hover tooltip: the order detail for the trades on the hovered candle, or —
  // if there are none — the lot detail for the position band under the cursor.
  // Anchors flip near the edges so it never clips.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
    const handler = (param: MouseEventParams<Time>) => {
      const container = containerRef.current;
      const series = seriesRef.current;
      const chart = chartRef.current;
      // Note: param.time is null past the last candle, but param.point still
      // exists there — needed so the open band (extended to the right) is hoverable.
      if (!param.point || !container || !series || !chart) {
        setTooltip(null);
        return;
      }

      let entries: TooltipEntry[] | null = null;

      // 1. Markers need a candle under the cursor.
      const bucket = param.time == null ? undefined : markerInfo.byTime.get(param.time as number);
      if (bucket && bucket.length > 0) {
        entries = bucket.map((trade) => ({
          isBuy: trade.side === TRADE_SIDE.BUY,
          title: trade.side === TRADE_SIDE.BUY ? buyLabel : sellLabel,
          lines: [
            `${formatAmount(Number(trade.qtyBase), locale)} ${base}`,
            `${priceLabel}: ${formatAmount(Number(trade.avgPrice), locale)} ${quote}`,
            ...(trade.valueEurCents != null ? [`${costLabel}: ${formatCurrency(trade.valueEurCents)}`] : []),
            dateFmt.format(new Date(trade.occurredAt)),
          ],
        }));
      } else {
        // 2. Otherwise, is the cursor over a band's % badge? Hit-test only the
        // badge box (not the whole band) so the tooltip shows just on the
        // percentage indicator — and overlapping bands stay individually
        // reachable via their distinct badges. Stack every badge under the
        // cursor when several coincide.
        const { x, y } = param.point;
        const hits = bandHitsRef.current.filter(({ primitive }) => {
          const r = primitive.getBadgeRect();
          return r != null && x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;
        });
        if (hits.length > 0) entries = hits.map((hit) => hit.tooltip);
      }

      if (!entries) {
        setTooltip(null);
        return;
      }
      setTooltip({
        x: param.point.x,
        y: param.point.y,
        anchorRight: param.point.x > container.clientWidth / 2,
        anchorBottom: param.point.y > container.clientHeight / 2,
        entries,
      });
    };

    chart.subscribeCrosshairMove(handler);
    return () => chart.unsubscribeCrosshairMove(handler);
  }, [markerInfo, base, quote, locale, buyLabel, sellLabel, priceLabel, costLabel]);

  return (
    <div ref={containerRef} className="relative w-full h-[28rem] rounded-lg overflow-hidden">
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-border bg-popover px-2.5 py-1.5 shadow-lg text-xs tabular-nums"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: `translate(${tooltip.anchorRight ? 'calc(-100% - 14px)' : '14px'}, ${
              tooltip.anchorBottom ? 'calc(-100% - 14px)' : '14px'
            })`,
          }}
        >
          {tooltip.entries.map((entry, index) => (
            <div
              key={`${entry.title}-${entry.lines.join('|')}`}
              className={index > 0 ? 'mt-1.5 pt-1.5 border-t border-border' : ''}
            >
              <div className={entry.isBuy ? 'font-semibold text-guard-success' : 'font-semibold text-guard-danger'}>
                {entry.title}
              </div>
              {entry.lines.map((line) => (
                <div key={line} className="text-popover-foreground">
                  {line}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
