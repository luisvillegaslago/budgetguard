'use client';

/**
 * BudgetGuard Fixed vs Variable Card
 * Splits the month's expenses into recurring (fixed) vs one-off (variable),
 * shown as a stacked bar with amounts and percentages.
 */

import { Layers } from 'lucide-react';
import { useMemo } from 'react';
import { CHART_COLORS } from '@/components/dashboard/charts/chartConfig';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { OverflowTooltip } from '@/components/ui/OverflowTooltip';
import { TRANSACTION_TYPE } from '@/constants/finance';
import { useTransactions } from '@/hooks/useTransactions';
import { useTranslate } from '@/hooks/useTranslations';
import { useSelectedMonth } from '@/stores/useFinanceStore';
import type { Transaction } from '@/types/finance';
import { formatCurrency } from '@/utils/money';

// Derive from the centralized chart palette to stay in sync with the brand tokens.
const FIXED_COLOR = CHART_COLORS.balance; // guard-primary
const VARIABLE_COLOR = CHART_COLORS.warning; // guard-warning

export interface FixedVariableSplit {
  fixedCents: number;
  variableCents: number;
}

/** Split month expenses: recurring (fixed) vs one-off (variable). */
export function splitFixedVariable(transactions: Transaction[]): FixedVariableSplit {
  let fixedCents = 0;
  let variableCents = 0;

  transactions.forEach((tx) => {
    if (tx.type !== TRANSACTION_TYPE.EXPENSE) return;
    if (tx.recurringExpenseId != null) {
      fixedCents += tx.amountCents;
    } else {
      variableCents += tx.amountCents;
    }
  });

  return { fixedCents, variableCents };
}

interface LegendRowProps {
  label: string;
  color: string;
  cents: number;
  pct: number;
}

function LegendRow({ label, color, cents, pct }: LegendRowProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="flex-1 text-foreground">{label}</span>
      <span className="font-semibold text-foreground tabular-nums">{formatCurrency(cents)}</span>
      <span className="text-guard-muted w-9 text-right tabular-nums">{pct}%</span>
    </div>
  );
}

export function FixedVsVariableCard() {
  const { t } = useTranslate();
  const selectedMonth = useSelectedMonth();
  // Intentional client-side aggregation: reuses the cached month-transactions query
  // shared with the drill-down popups. Move to a SQL view if monthly volume grows large.
  const { data, isPending, isError, refetch } = useTransactions(selectedMonth);

  const { fixedCents, variableCents } = useMemo(() => splitFixedVariable(data?.data ?? []), [data]);
  const total = fixedCents + variableCents;
  const fixedPct = total > 0 ? Math.round((fixedCents / total) * 100) : 0;
  const variablePct = total > 0 ? 100 - fixedPct : 0;

  return (
    <div className="card flex flex-col">
      <h3 className="text-lg font-semibold text-foreground mb-4">{t('dashboard.widgets.fixed-variable-title')}</h3>

      {isPending ? (
        <div className="flex flex-1 items-center justify-center py-10">
          <LoadingSpinner size="md" />
        </div>
      ) : isError ? (
        <ErrorState message={t('errors.load-transactions')} onRetry={() => refetch()} />
      ) : total === 0 ? (
        <EmptyState icon={Layers} title={t('dashboard.category-breakdown.empty')} />
      ) : (
        <div className="flex flex-1 flex-col gap-4">
          {/* Month total */}
          <div className="min-w-0">
            <p className="text-xs text-guard-muted">{t('dashboard.widgets.total-expenses')}</p>
            <OverflowTooltip content={formatCurrency(total)}>
              <p className="text-2xl font-bold text-foreground tabular-nums truncate">{formatCurrency(total)}</p>
            </OverflowTooltip>
          </div>

          {/* Stacked bar */}
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
            <div style={{ width: `${fixedPct}%`, backgroundColor: FIXED_COLOR }} />
            <div style={{ width: `${variablePct}%`, backgroundColor: VARIABLE_COLOR }} />
          </div>

          <div className="space-y-2">
            <LegendRow label={t('dashboard.widgets.fixed')} color={FIXED_COLOR} cents={fixedCents} pct={fixedPct} />
            <LegendRow
              label={t('dashboard.widgets.variable')}
              color={VARIABLE_COLOR}
              cents={variableCents}
              pct={variablePct}
            />
          </div>

          <p className="mt-auto text-xs text-guard-muted">{t('dashboard.widgets.fixed-insight', { pct: fixedPct })}</p>
        </div>
      )}
    </div>
  );
}
