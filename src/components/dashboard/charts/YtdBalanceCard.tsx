'use client';

/**
 * BudgetGuard Cumulative Balance Card
 * Running cumulative balance across the selected period (shared with the cash-flow chart).
 */

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTranslate } from '@/hooks/useTranslations';
import { useTrendPeriod } from '@/stores/useFinanceStore';
import { ChartCard } from './ChartCard';
import { CHART_COLORS, formatEuroAxis } from './chartConfig';
import { type TrendBar, useTrendBars } from './useTrendBars';

interface CumulativeTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: TrendBar }>;
  label: string;
}

function CumulativeTooltip({ active, payload, label }: CumulativeTooltipProps) {
  const first = payload?.[0];
  if (!active || !first) return null;
  const bar = first.payload;

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold text-popover-foreground mb-1 capitalize">{bar.label}</p>
      <p className="text-guard-primary">
        {label}: <span className="font-medium tabular-nums">{bar.cumulativeLabel}</span>
      </p>
    </div>
  );
}

export function YtdBalanceCard() {
  const { t } = useTranslate();
  const period = useTrendPeriod();
  const { bars, granularity, isLoading, isError, refetch } = useTrendBars(period);

  const isEmpty = bars.every((b) => b.income === 0 && b.expense === 0);
  const subtitle = granularity === 'year' ? t('dashboard.charts.by-year') : t('dashboard.charts.by-month');

  return (
    <ChartCard
      title={t('dashboard.charts.ytd-title')}
      subtitle={subtitle}
      isLoading={isLoading}
      isError={isError}
      isEmpty={!isLoading && isEmpty}
      emptyMessage={t('dashboard.charts.empty')}
      errorMessage={t('errors.load-summary')}
      onRetry={() => refetch()}
    >
      <div className="flex-1 w-full min-h-[18rem]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={bars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="cumulative-balance-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS.balance} stopOpacity={0.35} />
                <stop offset="100%" stopColor={CHART_COLORS.balance} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.muted} strokeOpacity={0.15} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: CHART_COLORS.muted }}
              tickLine={false}
              axisLine={{ stroke: CHART_COLORS.muted, strokeOpacity: 0.2 }}
            />
            <YAxis
              tickFormatter={formatEuroAxis}
              tick={{ fontSize: 11, fill: CHART_COLORS.muted }}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip
              wrapperStyle={{ zIndex: 20, outline: 'none' }}
              content={<CumulativeTooltip label={t('dashboard.charts.cumulative-balance')} />}
            />
            <Area
              type="monotone"
              dataKey="cumulative"
              name={t('dashboard.charts.cumulative-balance')}
              stroke={CHART_COLORS.balance}
              strokeWidth={2.5}
              fill="url(#cumulative-balance-gradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
