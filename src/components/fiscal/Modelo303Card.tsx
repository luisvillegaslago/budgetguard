'use client';

/**
 * BudgetGuard Modelo 303 Card
 * Displays IVA (VAT) summary: Devengado vs Deducible in a two-column grid
 * Includes C60 for exempt/export operations when applicable
 * Mimics the Agencia Tributaria PDF layout
 */

import { Tooltip } from '@/components/ui/Tooltip';
import { useTranslate } from '@/hooks/useTranslations';
import type { Modelo303Summary } from '@/types/finance';
import { cn } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface Modelo303CardProps {
  data: Modelo303Summary;
}

interface CasillaRowProps {
  number: string;
  label: string;
  cents: number;
  isTotal?: boolean;
}

function CasillaRow({ number, label, cents, isTotal = false }: CasillaRowProps) {
  return (
    <div className={cn('flex items-baseline justify-between gap-2 py-1.5', isTotal && 'border-t border-border pt-2')}>
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-xs text-guard-muted tabular-nums shrink-0">[{number}]</span>
        <Tooltip content={label} side="bottom">
          <span className={cn('text-sm truncate', isTotal ? 'font-semibold text-foreground' : 'text-foreground/80')}>
            {label}
          </span>
        </Tooltip>
      </div>
      <span className={cn('text-sm tabular-nums shrink-0', isTotal ? 'font-bold text-foreground' : 'font-medium')}>
        {formatCurrency(cents)}
      </span>
    </div>
  );
}

export function Modelo303Card({ data }: Modelo303CardProps) {
  const { t } = useTranslate();

  const isPositiveResult = data.resultCents > 0;
  const resultLabel = isPositiveResult ? t('fiscal.modelo303.to-pay') : t('fiscal.modelo303.to-compensate');
  const hasDevengado = data.casilla07Cents > 0 || data.casilla09Cents > 0;
  const hasExempt = data.casilla60Cents > 0;

  return (
    <div className="card border-l-4 border-l-guard-primary">
      <h3 className="text-lg font-bold text-foreground mb-4">{t('fiscal.modelo303.title')}</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* IVA Devengado (Income) */}
        <div>
          <h4 className="text-sm font-semibold text-guard-muted uppercase tracking-wider mb-2">
            {t('fiscal.modelo303.devengado')}
          </h4>
          <div className="space-y-0.5">
            {hasDevengado && (
              <>
                <CasillaRow number="07" label={t('fiscal.modelo303.casilla07')} cents={data.casilla07Cents} />
                <CasillaRow number="09" label={t('fiscal.modelo303.casilla09')} cents={data.casilla09Cents} />
              </>
            )}
            <CasillaRow number="27" label={t('fiscal.modelo303.casilla27')} cents={data.casilla27Cents} isTotal />
          </div>
        </div>

        {/* IVA Deducible (Expenses) */}
        <div>
          <h4 className="text-sm font-semibold text-guard-muted uppercase tracking-wider mb-2">
            {t('fiscal.modelo303.deducible')}
          </h4>
          <div className="space-y-0.5">
            <CasillaRow number="28" label={t('fiscal.modelo303.casilla28')} cents={data.casilla28Cents} />
            <CasillaRow number="29" label={t('fiscal.modelo303.casilla29')} cents={data.casilla29Cents} />
            <CasillaRow number="45" label={t('fiscal.modelo303.casilla45')} cents={data.casilla45Cents} isTotal />
          </div>
        </div>
      </div>

      {/* C60 — Exempt/export operations */}
      {hasExempt && (
        <div className="mt-4 pt-4 border-t border-border">
          <CasillaRow number="60" label={t('fiscal.modelo303.casilla60')} cents={data.casilla60Cents} />
        </div>
      )}

      {/* Result */}
      <div className="mt-4 pt-4 border-t border-border flex items-baseline justify-between">
        <span className="text-sm font-semibold text-foreground">
          {t('fiscal.modelo303.result')} <span className="text-xs font-normal text-guard-muted">([27] − [45])</span>
        </span>
        <div className="text-right">
          <span
            className={cn(
              'text-lg font-bold tabular-nums',
              isPositiveResult ? 'text-guard-danger' : 'text-guard-success',
            )}
          >
            {formatCurrency(data.resultCents)}
          </span>
          <p className={cn('text-xs mt-0.5', isPositiveResult ? 'text-guard-danger/70' : 'text-guard-success/70')}>
            {resultLabel}
          </p>
        </div>
      </div>
    </div>
  );
}
