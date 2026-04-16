'use client';

/**
 * BudgetGuard Modelo 390 Card
 * Displays annual VAT summary — sum of 4 quarterly 303s
 * Three sections: Devengado, Deducible, Volumen de Operaciones
 */

import { Tooltip } from '@/components/ui/Tooltip';
import { useTranslate } from '@/hooks/useTranslations';
import type { Modelo390Summary } from '@/types/finance';
import { cn } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface Modelo390CardProps {
  data: Modelo390Summary;
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

export function Modelo390Card({ data }: Modelo390CardProps) {
  const { t } = useTranslate();

  const isNegativeResult = data.casilla65Cents < 0;

  return (
    <div className="card border-l-4 border-l-guard-primary">
      <h3 className="text-lg font-bold text-foreground mb-4">{t('fiscal.modelo390.title')}</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* IVA Devengado */}
        <div>
          <h4 className="text-sm font-semibold text-guard-muted uppercase tracking-wider mb-2">
            {t('fiscal.modelo390.devengado')}
          </h4>
          <div className="space-y-0.5">
            <CasillaRow number="47" label={t('fiscal.modelo390.casilla47')} cents={data.casilla47Cents} isTotal />
          </div>
        </div>

        {/* IVA Deducible */}
        <div>
          <h4 className="text-sm font-semibold text-guard-muted uppercase tracking-wider mb-2">
            {t('fiscal.modelo390.deducible')}
          </h4>
          <div className="space-y-0.5">
            <CasillaRow number="605" label={t('fiscal.modelo390.casilla605')} cents={data.casilla605Cents} />
            <CasillaRow number="606" label={t('fiscal.modelo390.casilla606')} cents={data.casilla606Cents} />
            <CasillaRow number="48" label={t('fiscal.modelo390.casilla48')} cents={data.casilla48Cents} />
            <CasillaRow number="49" label={t('fiscal.modelo390.casilla49')} cents={data.casilla49Cents} isTotal />
            <CasillaRow number="64" label={t('fiscal.modelo390.casilla64')} cents={data.casilla64Cents} isTotal />
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="mt-4 pt-4 border-t border-border flex items-baseline justify-between">
        <span className="text-sm font-semibold text-foreground">
          {t('fiscal.modelo390.casilla65')} <span className="text-xs font-normal text-guard-muted">([47] − [64])</span>
        </span>
        <div className="text-right">
          <span
            className={cn(
              'text-lg font-bold tabular-nums',
              isNegativeResult ? 'text-guard-success' : 'text-guard-danger',
            )}
          >
            {formatCurrency(data.casilla65Cents)}
          </span>
          {isNegativeResult && (
            <p className="text-xs mt-0.5 text-guard-success/70">
              {t('fiscal.modelo390.casilla97')}: {formatCurrency(data.casilla97Cents)}
            </p>
          )}
        </div>
      </div>

      {/* Volume of Operations */}
      <div className="mt-4 pt-4 border-t border-border">
        <h4 className="text-sm font-semibold text-guard-muted uppercase tracking-wider mb-2">
          {t('fiscal.modelo390.operaciones')}
        </h4>
        <div className="space-y-0.5">
          <CasillaRow number="110" label={t('fiscal.modelo390.casilla110')} cents={data.casilla110Cents} />
          <CasillaRow number="108" label={t('fiscal.modelo390.casilla108')} cents={data.casilla108Cents} isTotal />
        </div>
      </div>
    </div>
  );
}
