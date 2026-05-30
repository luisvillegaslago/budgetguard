'use client';

/**
 * BudgetGuard Cash Flow Trend Chart
 * Income vs expense bars + balance line across the selected period.
 * Granularity (monthly/yearly) is driven by useTrendBars.
 */

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTranslate } from '@/hooks/useTranslations';
import { useTrendPeriod } from '@/stores/useFinanceStore';
import { ChartCard } from './ChartCard';
import { CHART_COLORS, formatEuroAxis } from './chartConfig';
import { type TrendBar, useTrendBars } from './useTrendBars';

interface CashFlowTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: TrendBar }>;
  labelIncome: string;
  labelExpenses: string;
  labelBalance: string;
}

function CashFlowTooltip({ active, payload, labelIncome, labelExpenses, labelBalance }: CashFlowTooltipProps) {
  const first = payload?.[0];
  if (!active || !first) return null;
  const bar = first.payload;

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold text-popover-foreground mb-1 capitalize">{bar.label}</p>
      <p className="text-guard-success">
        {labelIncome}: <span className="font-medium tabular-nums">{bar.incomeLabel}</span>
      </p>
      <p className="text-guard-danger">
        {labelExpenses}: <span className="font-medium tabular-nums">{bar.expenseLabel}</span>
      </p>
      <p className="text-guard-primary">
        {labelBalance}: <span className="font-medium tabular-nums">{bar.balanceLabel}</span>
      </p>
    </div>
  );
}

export function CashFlowTrendChart() {
  const { t } = useTranslate();
  const period = useTrendPeriod();
  const { bars, granularity, isLoading, isError, refetch } = useTrendBars(period);

  const isEmpty = bars.every((b) => b.income === 0 && b.expense === 0);
  const subtitle = granularity === 'year' ? t('dashboard.charts.by-year') : t('dashboard.charts.by-month');

  return (
    <ChartCard
      title={t('dashboard.charts.cashflow-title')}
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
          <ComposedChart data={bars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
              cursor={{ fill: CHART_COLORS.muted, fillOpacity: 0.08 }}
              content={
                <CashFlowTooltip
                  labelIncome={t('dashboard.charts.income')}
                  labelExpenses={t('dashboard.charts.expenses')}
                  labelBalance={t('dashboard.charts.balance')}
                />
              }
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(value: string) => <span className="text-guard-muted">{value}</span>}
            />
            <Bar
              dataKey="income"
              name={t('dashboard.charts.income')}
              fill={CHART_COLORS.income}
              fillOpacity={0.75}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
            <Bar
              dataKey="expense"
              name={t('dashboard.charts.expenses')}
              fill={CHART_COLORS.expense}
              fillOpacity={0.75}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
            <Line
              type="monotone"
              dataKey="balance"
              name={t('dashboard.charts.balance')}
              stroke={CHART_COLORS.balance}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
