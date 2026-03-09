'use client';

/**
 * BudgetGuard Modelo 100 Card
 * Displays annual IRPF — economic activities section (estimación directa simplificada)
 * Only the professional activities section; user completes the rest in Renta Web
 */

import { ExternalLink } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { useTranslate } from '@/hooks/useTranslations';
import type { Modelo100Section } from '@/types/finance';
import { cn } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface Modelo100CardProps {
  data: Modelo100Section;
}

interface CasillaRowProps {
  number: string;
  label: string;
  cents: number;
  isTotal?: boolean;
  highlight?: boolean;
}

function CasillaRow({ number, label, cents, isTotal = false, highlight = false }: CasillaRowProps) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-2 py-1.5',
        isTotal && 'border-t border-border pt-2',
        highlight && 'bg-guard-primary/5 -mx-3 px-3 rounded-lg',
      )}
    >
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-xs text-guard-muted tabular-nums shrink-0">[{number}]</span>
        <Tooltip content={label} side="bottom">
          <span
            className={cn(
              'text-sm truncate',
              highlight
                ? 'font-semibold text-foreground'
                : isTotal
                  ? 'font-semibold text-foreground'
                  : 'text-foreground/80',
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
            : isTotal
              ? 'text-sm font-bold text-foreground'
              : 'text-sm font-medium',
        )}
      >
        {formatCurrency(cents)}
      </span>
    </div>
  );
}

export function Modelo100Card({ data }: Modelo100CardProps) {
  const { t } = useTranslate();

  return (
    <div className="card border-l-4 border-l-guard-primary">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-foreground">{t('fiscal.modelo100.title')}</h3>
        <p className="text-xs text-guard-muted mt-0.5">{t('fiscal.modelo100.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Income */}
        <div>
          <h4 className="text-sm font-semibold text-guard-muted uppercase tracking-wider mb-2">
            {t('fiscal.modelo100.ingresos')}
          </h4>
          <div className="space-y-0.5">
            <CasillaRow number="0171" label={t('fiscal.modelo100.casilla0171')} cents={data.casilla0171Cents} />
            <CasillaRow number="0180" label={t('fiscal.modelo100.casilla0180')} cents={data.casilla0180Cents} isTotal />
          </div>
        </div>

        {/* Expenses */}
        <div>
          <h4 className="text-sm font-semibold text-guard-muted uppercase tracking-wider mb-2">
            {t('fiscal.modelo100.gastos')}
          </h4>
          <div className="space-y-0.5">
            <CasillaRow number="0218" label={t('fiscal.modelo100.casilla0218')} cents={data.casilla0218Cents} />
            <CasillaRow number="0221" label={t('fiscal.modelo100.casilla0221')} cents={data.casilla0221Cents} isTotal />
            <CasillaRow number="0222" label={t('fiscal.modelo100.casilla0222')} cents={data.casilla0222Cents} />
            <CasillaRow number="0223" label={t('fiscal.modelo100.casilla0223')} cents={data.casilla0223Cents} isTotal />
          </div>
        </div>
      </div>

      {/* Net Result */}
      <div className="mt-4 pt-4 border-t border-border">
        <CasillaRow number="0224" label={t('fiscal.modelo100.casilla0224')} cents={data.casilla0224Cents} highlight />
      </div>

      {/* Renta Web note */}
      <div className="mt-4 pt-3 border-t border-border">
        <p className="text-xs text-guard-muted flex items-center gap-1.5">
          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
          {t('fiscal.modelo100.renta-web-note')}
        </p>
      </div>
    </div>
  );
}
