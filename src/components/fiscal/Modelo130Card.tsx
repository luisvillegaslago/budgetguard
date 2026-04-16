'use client';

/**
 * BudgetGuard Modelo 130 Card
 * Displays IRPF (Income Tax) quarterly payment summary
 * Shows breakdown of documented expenses + 5% gastos difícil justificación
 * Casilla 7 (amount to pay) is highlighted as the key figure
 */

import { Tooltip } from '@/components/ui/Tooltip';
import { useTranslate } from '@/hooks/useTranslations';
import type { Modelo130Summary } from '@/types/finance';
import { cn } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface Modelo130CardProps {
  data: Modelo130Summary;
}

interface CasillaRowProps {
  number: string;
  label: string;
  cents: number;
  highlight?: boolean;
  indent?: boolean;
  muted?: boolean;
}

function CasillaRow({ number, label, cents, highlight = false, indent = false, muted = false }: CasillaRowProps) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-2 py-1.5',
        highlight && 'bg-guard-primary/5 -mx-3 px-3 rounded-lg',
        indent && 'pl-6',
      )}
    >
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-xs text-guard-muted tabular-nums shrink-0">[{number}]</span>
        <Tooltip content={label} side="bottom" triggerClassName="min-w-0 overflow-hidden">
          <span
            className={cn(
              'text-sm truncate block',
              highlight ? 'font-semibold text-foreground' : muted ? 'text-guard-muted' : 'text-foreground/80',
            )}
          >
            {label}
          </span>
        </Tooltip>
      </div>
      <span
        className={cn(
          'tabular-nums shrink-0',
          highlight
            ? 'text-lg font-bold text-guard-primary'
            : muted
              ? 'text-sm text-guard-muted'
              : 'text-sm font-medium',
        )}
      >
        {formatCurrency(cents, false)}
        <span className="ml-1">€</span>
      </span>
    </div>
  );
}

export function Modelo130Card({ data }: Modelo130CardProps) {
  const { t } = useTranslate();

  const hasGastosDificil = data.gastosDificilCents > 0;

  return (
    <div className="card border-l-4 border-l-guard-primary">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-lg font-bold text-foreground">{t('fiscal.modelo130.title')}</h3>
        <span className="text-xs text-guard-muted">{t('fiscal.modelo130.cumulative-note')}</span>
      </div>

      <div className="space-y-0.5">
        <CasillaRow number="01" label={t('fiscal.modelo130.casilla1')} cents={data.casilla1Cents} />

        {/* Gastos breakdown: documented + difícil justificación */}
        {hasGastosDificil ? (
          <>
            <CasillaRow number="02" label={t('fiscal.modelo130.casilla2')} cents={data.casilla2Cents} />
            <CasillaRow
              number="02a"
              label={t('fiscal.modelo130.gastos-documentados')}
              cents={data.gastosDocumentadosCents}
              indent
              muted
            />
            <CasillaRow
              number="02b"
              label={t('fiscal.modelo130.gastos-dificil')}
              cents={data.gastosDificilCents}
              indent
              muted
            />
          </>
        ) : (
          <CasillaRow number="02" label={t('fiscal.modelo130.casilla2')} cents={data.casilla2Cents} />
        )}

        <div className="border-t border-border my-2" />

        <CasillaRow number="03" label={t('fiscal.modelo130.casilla3')} cents={data.casilla3Cents} />
        <CasillaRow number="04" label={t('fiscal.modelo130.casilla4')} cents={data.casilla4Cents} />
        <CasillaRow number="05" label={t('fiscal.modelo130.casilla5')} cents={data.casilla5Cents} />

        <div className="border-t border-border my-2" />

        <CasillaRow number="07" label={t('fiscal.modelo130.casilla7')} cents={data.casilla7Cents} highlight />
      </div>
    </div>
  );
}
