'use client';

/**
 * BudgetGuard Dashboard
 * Money-flow analytics at a glance: KPIs, cash-flow trend, category distribution,
 * year-to-date balance and top spending categories.
 *
 * The summary section is read through one of two lenses, a month or a year. The
 * yearly one hides the fixed-vs-variable, top-vendors and fiscal widgets: the first
 * two read raw transactions from the month-bound /api/transactions, and the fiscal
 * report is quarterly by nature.
 */

import { useState } from 'react';
import { AlertsSection } from '@/components/alerts/AlertsSection';
import { BalanceCards } from '@/components/dashboard/BalanceCards';
import { CashFlowTrendChart } from '@/components/dashboard/charts/CashFlowTrendChart';
import { CategoryDistributionCard } from '@/components/dashboard/charts/CategoryDistributionCard';
import { CategoryTrendsCard } from '@/components/dashboard/charts/CategoryTrendsCard';
import { PeriodSelector } from '@/components/dashboard/charts/PeriodSelector';
import { YtdBalanceCard } from '@/components/dashboard/charts/YtdBalanceCard';
import { GranularityToggle } from '@/components/dashboard/GranularityToggle';
import { FiscalSummaryCard } from '@/components/dashboard/widgets/FiscalSummaryCard';
import { FixedVsVariableCard } from '@/components/dashboard/widgets/FixedVsVariableCard';
import { TopVendorsWidget } from '@/components/dashboard/widgets/TopVendorsWidget';
import { VouchersWidget } from '@/components/dashboard/widgets/VouchersWidget';
import { QuickExpenseActions } from '@/components/transactions/QuickExpenseActions';
import { ActiveTripBanner, type TripExpenseTarget } from '@/components/trips/ActiveTripBanner';
import { TripExpenseForm } from '@/components/trips/TripExpenseForm';
import { AnimatedHeight } from '@/components/ui/AnimatedHeight';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { YearPicker } from '@/components/ui/YearPicker';
import { SUMMARY_GRANULARITY } from '@/constants/finance';
import { useDashboardUrlSync } from '@/hooks/useDashboardUrlSync';
import { useTranslate } from '@/hooks/useTranslations';
import {
  useMonthNavigation,
  useSelectedMonth,
  useSummaryGranularity,
  useSummaryPeriod,
  useTrendPeriod,
} from '@/stores/useFinanceStore';
import { getCurrentMonth } from '@/utils/helpers';

function MobileTodayButton() {
  const { t } = useTranslate();
  const selectedMonth = useSelectedMonth();
  const { goToCurrentMonth } = useMonthNavigation();
  const isCurrentMonth = selectedMonth === getCurrentMonth();

  if (isCurrentMonth) return null;

  return (
    <button
      type="button"
      onClick={goToCurrentMonth}
      className="sm:hidden px-3 py-1.5 text-sm font-medium text-guard-primary hover:bg-guard-primary/10 rounded-lg transition-colors"
    >
      {t('common.today')}
    </button>
  );
}

export default function DashboardPage() {
  const { t } = useTranslate();
  const granularity = useSummaryGranularity();
  const period = useSummaryPeriod();
  const trendPeriod = useTrendPeriod();
  const [tripExpenseTarget, setTripExpenseTarget] = useState<TripExpenseTarget | null>(null);

  // Bidirectional sync: URL ↔ Zustand (month, year, lens, type filter)
  useDashboardUrlSync();

  const isYearLens = granularity === SUMMARY_GRANULARITY.YEAR;
  // Every monthly widget re-animates when either the lens or the period changes.
  const periodTrigger = `${period.granularity}-${period.value}`;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Period picker (month or year) + lens toggle + Quick Actions */}
      <div className="flex flex-col items-center sm:flex-row sm:justify-between gap-3 mb-8">
        <div className="flex flex-col items-center sm:flex-row gap-2 sm:gap-3">
          {isYearLens ? <YearPicker /> : <MonthPicker />}
          <GranularityToggle />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          {!isYearLens && <MobileTodayButton />}
          <QuickExpenseActions className="justify-end" />
        </div>
      </div>

      <div className="space-y-8">
        {/* Alerts first: pending transactions, fiscal deadlines, recurring expenses */}
        <AlertsSection />

        {/* Active trip banner */}
        <ActiveTripBanner onAddExpense={setTripExpenseTarget} />

        {/* ── Period-based section (driven by the month/year picker and the lens toggle) ── */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-guard-muted">
            {isYearLens ? t('dashboard.sections.yearly') : t('dashboard.sections.monthly')}
          </h2>

          {/* Each widget fades + animates its height as the period changes, so nothing jumps */}
          <BalanceCards />

          <AnimatedHeight trigger={periodTrigger}>
            <CategoryDistributionCard />
          </AnimatedHeight>

          {/* Month-only widgets: they read month-bound sources (see the file header) */}
          {!isYearLens && (
            <AnimatedHeight
              trigger={periodTrigger}
              contentClassName="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-8 items-stretch"
            >
              <FixedVsVariableCard />
              <TopVendorsWidget />
              <FiscalSummaryCard />
            </AnimatedHeight>
          )}
        </section>

        {/* ── Historical section (independent of the selected period) ── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-guard-muted">
              {t('dashboard.sections.historical')}
            </h2>
            <PeriodSelector />
          </div>

          {/* Trend widgets fade + animate their height as the period changes */}
          <AnimatedHeight trigger={trendPeriod} contentClassName="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">
            <div className="lg:col-span-2">
              <CashFlowTrendChart />
            </div>
            <div>
              <YtdBalanceCard />
            </div>
          </AnimatedHeight>

          <AnimatedHeight trigger={trendPeriod}>
            <CategoryTrendsCard />
          </AnimatedHeight>

          <VouchersWidget />
        </section>
      </div>

      {/* Trip Expense Modal (from active trip banner) */}
      {tripExpenseTarget !== null && (
        <TripExpenseForm
          tripId={tripExpenseTarget.tripId}
          tripStartDate={tripExpenseTarget.startDate}
          tripIsShared={tripExpenseTarget.isShared}
          onClose={() => setTripExpenseTarget(null)}
        />
      )}
    </div>
  );
}
