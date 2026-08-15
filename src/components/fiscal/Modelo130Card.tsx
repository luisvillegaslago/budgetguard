'use client';

/**
 * BudgetGuard Modelo 130 Card
 * Displays IRPF (Income Tax) quarterly payment summary
 * Shows breakdown of documented expenses + 5% gastos difícil justificación
 * Casilla 7 (amount to pay) is highlighted as the key figure
 */

import { FiscalAmountRow as CasillaRow } from '@/components/fiscal/FiscalAmountRow';
import { useTranslate } from '@/hooks/useTranslations';
import type { Modelo130Summary } from '@/types/finance';

interface Modelo130CardProps {
  data: Modelo130Summary;
}

export function Modelo130Card({ data }: Modelo130CardProps) {
  const { t } = useTranslate();

  const hasGastosDificil = data.gastosDificilCents > 0;
  const hasActivity = data.casilla1Cents !== 0 || data.casilla2Cents !== 0;

  return (
    <div className="card border-l-4 border-l-guard-primary">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-lg font-bold text-foreground">{t('fiscal.modelo130.title')}</h3>
        <span className="text-xs text-guard-muted">{t('fiscal.modelo130.cumulative-note')}</span>
      </div>

      {!hasActivity && <p className="text-xs text-guard-muted mb-3 -mt-1">{t('fiscal.no-activity')}</p>}

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
        <CasillaRow number="06" label={t('fiscal.modelo130.casilla6')} cents={data.casilla6Cents} />

        <div className="border-t border-border my-2" />

        <CasillaRow number="07" label={t('fiscal.modelo130.casilla7')} cents={data.casilla7Cents} highlight />
      </div>
    </div>
  );
}
