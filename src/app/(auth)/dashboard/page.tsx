'use client';

/**
 * BudgetGuard Dashboard
 * Money-flow analytics at a glance: KPIs, cash-flow trend, category distribution,
 * year-to-date balance and top spending categories.
 */

import { useState } from 'react';
import { BalanceCards } from '@/components/dashboard/BalanceCards';
import { CashFlowTrendChart } from '@/components/dashboard/charts/CashFlowTrendChart';
import { CategoryDistributionCard } from '@/components/dashboard/charts/CategoryDistributionCard';
import { CategoryTrendsCard } from '@/components/dashboard/charts/CategoryTrendsCard';
import { PeriodSelector } from '@/components/dashboard/charts/PeriodSelector';
import { YtdBalanceCard } from '@/components/dashboard/charts/YtdBalanceCard';
import { FiscalSummaryCard } from '@/components/dashboard/widgets/FiscalSummaryCard';
import { FixedVsVariableCard } from '@/components/dashboard/widgets/FixedVsVariableCard';
import { TopVendorsWidget } from '@/components/dashboard/widgets/TopVendorsWidget';
import { QuickExpenseActions } from '@/components/transactions/QuickExpenseActions';
import { ActiveTripBanner } from '@/components/trips/ActiveTripBanner';
import { TripExpenseForm } from '@/components/trips/TripExpenseForm';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { useDashboardUrlSync } from '@/hooks/useDashboardUrlSync';
import { useTranslate } from '@/hooks/useTranslations';
import { useMonthNavigation, useSelectedMonth } from '@/stores/useFinanceStore';
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
  const [tripExpenseTarget, setTripExpenseTarget] = useState<{ tripId: number; startDate: string | null } | null>(null);

  // Bidirectional sync: URL ↔ Zustand (month, type filter)
  useDashboardUrlSync();

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Month Picker + Quick Actions */}
      <div className="flex flex-col items-center sm:flex-row sm:justify-between gap-3 mb-8">
        <MonthPicker />

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <MobileTodayButton />
          <QuickExpenseActions />
        </div>
      </div>

      <div className="space-y-8">
        {/* Active trip banner */}
        <ActiveTripBanner onAddExpense={setTripExpenseTarget} />

        {/* ── Month-based section (driven by the month picker) ── */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-guard-muted">
            {t('dashboard.sections.monthly')}
          </h2>

          <BalanceCards />

          <CategoryDistributionCard />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 items-stretch">
            <FixedVsVariableCard />
            <TopVendorsWidget />
            <FiscalSummaryCard />
          </div>
        </section>

        {/* ── Historical section (independent of the selected month) ── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-guard-muted">
              {t('dashboard.sections.historical')}
            </h2>
            <PeriodSelector />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">
            <div className="lg:col-span-2">
              <CashFlowTrendChart />
            </div>
            <div>
              <YtdBalanceCard />
            </div>
          </div>

          <CategoryTrendsCard />
        </section>
      </div>

      {/* Trip Expense Modal (from active trip banner) */}
      {tripExpenseTarget !== null && (
        <TripExpenseForm
          tripId={tripExpenseTarget.tripId}
          tripStartDate={tripExpenseTarget.startDate}
          onClose={() => setTripExpenseTarget(null)}
        />
      )}
    </div>
  );
}
