/**
 * PositionBandPrimitive — a lightweight-charts v5 series primitive that draws a
 * TradingView-style "position tool" band on the candlestick chart: a shaded
 * rectangle from the average entry price to the exit/live price, coloured green
 * for profit and red for loss, with the entry/exit prices and the P&L % drawn
 * on it.
 *
 * When the position is still open (`endTime === null`) the band is left
 * "unfinished" — it extends to the right edge of the chart.
 *
 * Coordinates: timeToCoordinate / priceToCoordinate return CSS-pixel (media)
 * coordinates, so inside the bitmap space we scale them by the pixel ratios.
 */

import type { IChartApi, ISeriesApi, ISeriesPrimitive, SeriesAttachedParameter, Time } from 'lightweight-charts';

export interface PositionBandData {
  entryPrice: number;
  exitPrice: number;
  startTime: Time;
  // null → the position is open: the band ends a little past the last candle
  // with a jagged right edge instead of running to the chart edge.
  endTime: Time | null;
  // Time of the last candle, used to anchor the open band's right end.
  lastCandleTime: Time | null;
  isProfit: boolean;
}

// Minimal structural type for the bitmap drawing scope (avoids depending on the
// `fancy-canvas` types transitively). Structurally compatible with the
// CanvasRenderingTarget2D lightweight-charts passes to `draw`.
interface BitmapScope {
  context: CanvasRenderingContext2D;
  bitmapSize: { width: number; height: number };
  horizontalPixelRatio: number;
  verticalPixelRatio: number;
}
interface RenderTarget {
  useBitmapCoordinateSpace(callback: (scope: BitmapScope) => void): void;
}

const PROFIT_COLOR = '#10B981'; // guard-success
const LOSS_COLOR = '#EF4444'; // guard-danger

function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export class PositionBandPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<'Candlestick'> | null = null;
  private requestUpdate?: () => void;
  private data: PositionBandData | null;
  private readonly formatPct: (ratio: number) => string;

  constructor(data: PositionBandData | null, formatPct: (ratio: number) => string) {
    this.data = data;
    this.formatPct = formatPct;
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
    this.series = param.series as ISeriesApi<'Candlestick'>;
    this.requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdate = undefined;
  }

  updateAllViews(): void {
    // Nothing cached — paneViews() reads live coordinates on every draw.
  }

  setData(data: PositionBandData | null): void {
    this.data = data;
    this.requestUpdate?.();
  }

  paneViews() {
    return [
      {
        zOrder: () => 'top' as const,
        renderer: () => ({
          draw: (target: RenderTarget) => {
            this.draw(target);
          },
        }),
      },
    ];
  }

  private draw(target: RenderTarget): void {
    const chart = this.chart;
    const series = this.series;
    const data = this.data;
    if (!chart || !series || !data) return;

    const timeScale = chart.timeScale();
    const startXMedia = timeScale.timeToCoordinate(data.startTime);
    const entryYMedia = series.priceToCoordinate(data.entryPrice);
    const exitYMedia = series.priceToCoordinate(data.exitPrice);
    if (startXMedia === null || entryYMedia === null || exitYMedia === null) return;

    const isOpen = data.endTime === null;
    // Closed → up to the exit time. Open → a little past the last candle.
    const endXMedia = isOpen
      ? data.lastCandleTime !== null
        ? timeScale.timeToCoordinate(data.lastCandleTime)
        : null
      : timeScale.timeToCoordinate(data.endTime as Time);
    const color = data.isProfit ? PROFIT_COLOR : LOSS_COLOR;

    // biome-ignore lint/correctness/useHookAtTopLevel: not a React hook — this is the lightweight-charts canvas target API.
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const hp = scope.horizontalPixelRatio;
      const vp = scope.verticalPixelRatio;

      const left = startXMedia * hp;
      const baseRight = endXMedia === null ? scope.bitmapSize.width : endXMedia * hp;
      // Open band overshoots the last candle, then a jagged edge signals "still
      // running"; closed band has a straight right edge at the exit time.
      const overshoot = isOpen ? 26 * hp : 0;
      const toothDepth = isOpen ? 6 * hp : 0;
      const right = Math.min(baseRight + overshoot, scope.bitmapSize.width);
      const entryY = entryYMedia * vp;
      const exitY = exitYMedia * vp;
      const top = Math.min(entryY, exitY);
      const bottom = Math.max(entryY, exitY);

      // Shaded band: rectangle whose right edge is a zigzag when the band is open.
      ctx.fillStyle = withAlpha(color, 0.16);
      ctx.beginPath();
      ctx.moveTo(left, top);
      ctx.lineTo(right - toothDepth, top);
      if (isOpen) {
        const toothH = 9 * vp;
        let y = top;
        let out = true;
        while (y < bottom) {
          y = Math.min(y + toothH, bottom);
          ctx.lineTo(out ? right : right - toothDepth, y);
          out = !out;
        }
      } else {
        ctx.lineTo(right, top);
        ctx.lineTo(right, bottom);
      }
      ctx.lineTo(left, bottom);
      ctx.closePath();
      ctx.fill();

      // Entry/exit horizontal edges + left vertical edge.
      const edgeRight = right - toothDepth;
      ctx.lineWidth = Math.max(1, Math.floor(hp));
      ctx.strokeStyle = withAlpha(color, 0.9);
      ctx.beginPath();
      ctx.moveTo(left, entryY);
      ctx.lineTo(edgeRight, entryY);
      ctx.moveTo(left, exitY);
      ctx.lineTo(edgeRight, exitY);
      ctx.moveTo(left, top);
      ctx.lineTo(left, bottom);
      ctx.stroke();

      // The P&L % is drawn as a filled badge so it stays legible even when the
      // band is razor-thin (tiny gain/loss). Full detail lives in the hover
      // tooltip. Centred, clamped to stay on-screen for a band scrolled left.
      const ratio = data.entryPrice !== 0 ? (data.exitPrice - data.entryPrice) / data.entryPrice : 0;
      const label = this.formatPct(ratio);
      ctx.font = `bold ${13 * vp}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      const padX = 7 * hp;
      const padY = 5 * vp;
      const badgeW = ctx.measureText(label).width + padX * 2;
      const badgeH = 13 * vp + padY * 2;
      const cx = Math.max(left, 0) + (Math.min(right, scope.bitmapSize.width) - Math.max(left, 0)) / 2;
      const cy = (top + bottom) / 2;
      ctx.fillStyle = color; // solid badge + white text — high-contrast, TradingView-like
      ctx.fillRect(cx - badgeW / 2, cy - badgeH / 2, badgeW, badgeH);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(label, cx, cy);
    });
  }
}
