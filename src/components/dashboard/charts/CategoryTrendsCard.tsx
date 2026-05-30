'use client';

/**
 * BudgetGuard Category Trends Card
 * Stacked area of expense by category over the selected period (top-N + Others).
 */

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTranslate } from '@/hooks/useTranslations';
import { useTrendPeriod } from '@/stores/useFinanceStore';
import { ChartCard } from './ChartCard';
import { CHART_COLORS, formatEuroAxis, formatEuroValue } from './chartConfig';
import { type CategorySeries, useCategoryTrendBars } from './useCategoryTrendBars';

interface TrendsTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{ dataKey: string; value: number; color: string; name: string }>;
}

function TrendsTooltip({ active, label, payload }: TrendsTooltipProps) {
  if (!active || !payload?.length) return null;

  // Largest contributors first.
  const rows = [...payload].filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-xl text-xs max-w-[14rem]">
      <p className="font-semibold text-popover-foreground mb-1 capitalize">{label}</p>
      <ul className="space-y-0.5">
        {rows.map((row) => (
          <li key={row.dataKey} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
            <span className="flex-1 truncate text-guard-muted">{row.name}</span>
            <span className="font-medium text-foreground tabular-nums">{formatEuroValue(row.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CategoryTrendsCard() {
  const { t } = useTranslate();
  const period = useTrendPeriod();
  const { series, bars, granularity, isLoading, isError, refetch } = useCategoryTrendBars(period);

  const subtitle = granularity === 'year' ? t('dashboard.charts.by-year') : t('dashboard.charts.by-month');

  return (
    <ChartCard
      title={t('dashboard.charts.category-trends-title')}
      subtitle={subtitle}
      isLoading={isLoading}
      isError={isError}
      isEmpty={!isLoading && (series.length === 0 || bars.length === 0)}
      emptyMessage={t('dashboard.charts.empty')}
      errorMessage={t('errors.load-categories')}
      onRetry={() => refetch()}
    >
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={bars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
            <Tooltip wrapperStyle={{ zIndex: 20, outline: 'none' }} content={<TrendsTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(value: string) => <span className="text-guard-muted">{value}</span>}
            />
            {series.map((s: CategorySeries) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stackId="categories"
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.5}
                strokeWidth={1.5}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
