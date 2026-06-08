'use client';

/**
 * BudgetGuard Modelo 303 Card
 * Displays IVA (VAT) summary: Devengado vs Deducible in a two-column grid
 * Includes C120 for non-subject operations by localization rules when applicable
 * Mimics the Agencia Tributaria PDF layout
 */

import { Tooltip } from '@/components/ui/Tooltip';
import { useTranslate } from '@/hooks/useTranslations';
import type { Modelo303Summary } from '@/types/finance';
import { cn } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';
import { classifyFiscalResult, FISCAL_RESULT_KIND } from './fiscalResult';

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
        <Tooltip content={label} side="bottom" triggerClassName="min-w-0 overflow-hidden">
          <span
            className={cn('text-sm truncate block', isTotal ? 'font-semibold text-foreground' : 'text-foreground/80')}
          >
            {label}
          </span>
        </Tooltip>
      </div>
      <span className={cn('text-sm tabular-nums shrink-0', isTotal ? 'font-bold text-foreground' : 'font-medium')}>
        {formatCurrency(cents, false)}
        <span className="ml-1">€</span>
      </span>
    </div>
  );
}

export function Modelo303Card({ data }: Modelo303CardProps) {
  const { t } = useTranslate();

  const result = classifyFiscalResult(data.resultCents);
  const resultLabel =
    result.kind === FISCAL_RESULT_KIND.TO_PAY
      ? t('fiscal.modelo303.to-pay')
      : result.kind === FISCAL_RESULT_KIND.TO_COMPENSATE
        ? t('fiscal.modelo303.to-compensate')
        : t('fiscal.result.neutral');
  const hasDevengado = data.casilla07Cents > 0 || data.casilla09Cents > 0;
  const hasExempt = data.casilla120Cents > 0;
  const hasActivity = data.casilla27Cents !== 0 || data.casilla45Cents !== 0 || hasExempt;

  return (
    <div className="card border-l-4 border-l-guard-primary">
      <h3 className="text-lg font-bold text-foreground mb-4">{t('fiscal.modelo303.title')}</h3>

      {!hasActivity && <p className="text-xs text-guard-muted mb-4 -mt-2">{t('fiscal.no-activity')}</p>}

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

      {/* C120 — Operations not subject by localization rules */}
      {hasExempt && (
        <div className="mt-4 pt-4 border-t border-border">
          <CasillaRow number="120" label={t('fiscal.modelo303.casilla120')} cents={data.casilla120Cents} />
        </div>
      )}

      {/* Result */}
      <div className="mt-4 pt-4 border-t border-border flex items-baseline justify-between">
        <span className="text-sm font-semibold text-foreground">
          {t('fiscal.modelo303.result')} <span className="text-xs font-normal text-guard-muted">([27] − [45])</span>
        </span>
        <div className="text-right">
          <span className={cn('text-lg font-bold tabular-nums', result.amountClassName)}>
            {formatCurrency(data.resultCents, false)}
            <span className="ml-1">€</span>
          </span>
          <p className={cn('text-xs mt-0.5', result.labelClassName)}>{resultLabel}</p>
        </div>
      </div>
    </div>
  );
}
