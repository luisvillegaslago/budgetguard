'use client';

/**
 * BudgetGuard Balance Cards
 * Three cards showing Income, Expenses, and Net Balance
 */

import { ArrowDownLeft, ArrowUpRight, Scale } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { CARD_VARIANT, type CardVariant } from '@/constants/finance';
import { useFormattedSummary } from '@/hooks/useFormattedSummary';
import { useTranslate } from '@/hooks/useTranslations';
import { useSelectedMonth } from '@/stores/useFinanceStore';
import { cn } from '@/utils/helpers';

interface BalanceCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  variant: CardVariant;
  isPositive?: boolean;
}

function BalanceCard({ title, value, icon, variant, isPositive }: BalanceCardProps) {
  const variantStyles: Record<CardVariant, string> = {
    [CARD_VARIANT.INCOME]: 'balance-card-income',
    [CARD_VARIANT.EXPENSE]: 'balance-card-expense',
    [CARD_VARIANT.BALANCE]: 'balance-card-total',
  };

  const iconBgStyles: Record<CardVariant, string> = {
    [CARD_VARIANT.INCOME]: 'bg-guard-success/10 text-guard-success',
    [CARD_VARIANT.EXPENSE]: 'bg-guard-danger/10 text-guard-danger',
    [CARD_VARIANT.BALANCE]: 'bg-guard-primary/10 text-guard-primary',
  };

  return (
    <div className={cn('balance-card animate-fade-in', variantStyles[variant])}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-guard-muted">{title}</p>
          <p
            className={cn('text-2xl font-bold mt-1', {
              'text-guard-success': variant === CARD_VARIANT.INCOME || (variant === CARD_VARIANT.BALANCE && isPositive),
              'text-guard-danger':
                variant === CARD_VARIANT.EXPENSE || (variant === CARD_VARIANT.BALANCE && !isPositive),
            })}
          >
            {value}
          </p>
        </div>
        <div className={cn('p-2.5 rounded-xl', iconBgStyles[variant])}>{icon}</div>
      </div>
    </div>
  );
}

export function BalanceCards() {
  const { t } = useTranslate();
  const selectedMonth = useSelectedMonth();
  const { formatted, isLoading, isError } = useFormattedSummary(selectedMonth);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card flex items-center justify-center py-8">
            <LoadingSpinner size="sm" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="card bg-guard-danger/5 border-guard-danger/20 text-center py-8">
        <p className="text-guard-danger">{t('errors.load-summary')}</p>
      </div>
    );
  }

  const isBalancePositive = (formatted?.balanceValue ?? 0) >= 0;
  const defaultCurrency = t('dashboard.default-currency');

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <BalanceCard
        title={t('dashboard.balance-cards.income')}
        value={formatted?.income ?? defaultCurrency}
        icon={<ArrowDownLeft className="h-5 w-5" />}
        variant={CARD_VARIANT.INCOME}
      />

      <BalanceCard
        title={t('dashboard.balance-cards.expenses')}
        value={formatted?.expense ?? defaultCurrency}
        icon={<ArrowUpRight className="h-5 w-5" />}
        variant={CARD_VARIANT.EXPENSE}
      />

      <BalanceCard
        title={t('dashboard.balance-cards.balance')}
        value={formatted?.balance ?? defaultCurrency}
        icon={<Scale className="h-5 w-5" />}
        variant={CARD_VARIANT.BALANCE}
        isPositive={isBalancePositive}
      />
    </div>
  );
}
