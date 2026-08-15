'use client';

/**
 * BudgetGuard IRPF Provision Card
 * Shows the gap between the flat 20% paid through Modelo 130 and the progressive IRPF
 * the annual Renta will charge — the amount that lands in one payment the following June.
 *
 * Owns its own query (unlike Modelo303/130Card, which receive data) because the annual
 * billing override is card-local state that re-runs the projection.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, CalendarClock, ChevronDown, ChevronUp, PiggyBank } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FiscalAmountRow as AmountRow } from '@/components/fiscal/FiscalAmountRow';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { FILING_STATUS, MODELO_TYPE } from '@/constants/finance';
import { useIrpfProjection } from '@/hooks/useIrpfProjection';
import { useTranslate } from '@/hooks/useTranslations';
import type { IrpfProjectionOverrideInput } from '@/schemas/fiscal';
import { IrpfProjectionOverrideSchema } from '@/schemas/fiscal';
import type { FiscalDeadline, IrpfProjection } from '@/types/finance';
import { computeDeadlines } from '@/utils/fiscalDeadlines';
import { cn, formatDate } from '@/utils/helpers';
import { centsToEuros, eurosToCents, formatCurrency } from '@/utils/money';

interface IrpfProvisionCardProps {
  year: number;
}

interface ProjectedIncomeFormProps {
  defaultEuros: number;
  onApply: (cents: number) => void;
  /** Only provided while a manual override is active — clears it back to the run-rate. */
  onReset?: () => void;
}

const ERROR_ID = 'projectedIncome-error';
/** Ties the collapse toggle to the region it controls (aria-controls) */
const CONTENT_ID = 'irpf-provision-content';

/**
 * Annual billing override. The card keys this form on the override state, not on the
 * projected figure, so a background refetch never wipes what the user is typing.
 */
function ProjectedIncomeForm({ defaultEuros, onApply, onReset }: ProjectedIncomeFormProps) {
  const { t } = useTranslate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<IrpfProjectionOverrideInput>({
    resolver: zodResolver(IrpfProjectionOverrideSchema),
    defaultValues: { projectedIncome: defaultEuros },
  });

  return (
    <form onSubmit={handleSubmit((data) => onApply(eurosToCents(data.projectedIncome)))} className="space-y-1.5">
      <label htmlFor="projectedIncome" className="block text-sm font-medium text-foreground">
        {t('fiscal.irpf-projection.override.label')}
      </label>
      <div className="flex gap-2">
        <input
          id="projectedIncome"
          type="number"
          step="0.01"
          min="0"
          {...register('projectedIncome', { valueAsNumber: true })}
          onWheel={(e) => e.currentTarget.blur()}
          aria-invalid={!!errors.projectedIncome}
          aria-describedby={errors.projectedIncome ? ERROR_ID : undefined}
          className={cn(
            'w-full px-4 py-2 rounded-lg border bg-background text-foreground tabular-nums',
            'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
            'transition-colors duration-200 ease-out-quart',
            errors.projectedIncome ? 'border-guard-danger' : 'border-input',
          )}
        />
        <button
          type="submit"
          className={cn(
            'shrink-0 px-4 py-2 rounded-lg font-semibold text-white',
            'bg-guard-primary hover:bg-guard-primary/90',
            'transition-all duration-200 ease-out-quart active:scale-[0.98]',
          )}
        >
          {t('fiscal.irpf-projection.override.apply')}
        </button>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className={cn(
              'shrink-0 px-4 py-2 rounded-lg font-medium text-foreground',
              'bg-muted hover:bg-muted/80',
              'transition-all duration-200 ease-out-quart active:scale-[0.98]',
            )}
          >
            {t('fiscal.irpf-projection.override.reset')}
          </button>
        )}
      </div>
      {errors.projectedIncome && (
        <p id={ERROR_ID} role="alert" className="text-sm text-guard-danger">
          {t(errors.projectedIncome.message ?? '')}
        </p>
      )}
      <p className="text-xs text-guard-muted">{t('fiscal.irpf-projection.override.hint')}</p>
    </form>
  );
}

/** Modelo 130 quarters and the Renta still ahead, from the shared AEAT deadline rules. */
function remainingDeadlines(year: number): FiscalDeadline[] {
  return computeDeadlines(year, new Set()).filter(
    (deadline) =>
      (deadline.modeloType === MODELO_TYPE.M130 || deadline.modeloType === MODELO_TYPE.M100) &&
      deadline.status !== FILING_STATUS.OVERDUE,
  );
}

function DeadlineSchedule({ year }: { year: number }) {
  const { t, locale } = useTranslate();
  const deadlines = remainingDeadlines(year);

  if (deadlines.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-guard-muted" aria-hidden="true" />
        <h4 className="text-sm font-semibold text-foreground">{t('fiscal.irpf-projection.schedule.title')}</h4>
      </div>
      <ul className="space-y-1">
        {deadlines.map((deadline) => (
          <li
            key={`${deadline.modeloType}-${deadline.fiscalQuarter ?? 'annual'}`}
            className="flex items-baseline justify-between gap-2 text-sm"
          >
            <span className="text-foreground/80 truncate">
              {deadline.fiscalQuarter === null
                ? t('fiscal.irpf-projection.schedule.renta', { year: deadline.fiscalYear })
                : t('fiscal.irpf-projection.schedule.modelo130', { quarter: deadline.fiscalQuarter })}
            </span>
            <span className="text-xs text-guard-muted whitespace-nowrap shrink-0">
              {/* Numeric format, not 'short': the Q4 and Renta windows fall in the following year */}
              {formatDate(deadline.startDate, 'numeric', locale)} — {formatDate(deadline.endDate, 'numeric', locale)}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-guard-muted">{t('fiscal.irpf-projection.schedule.renta-split')}</p>
    </div>
  );
}

/** The headline figure, kept visible even when the card is collapsed. */
function GapRow({ data }: { data: IrpfProjection }) {
  const { t } = useTranslate();

  return (
    <AmountRow
      label={t('fiscal.irpf-projection.gap')}
      cents={data.provisionGapCents}
      highlight
      alert={data.provisionGapCents > 0}
    />
  );
}

function ProvisionBreakdown({ data }: { data: IrpfProjection }) {
  const { t, locale } = useTranslate();
  const formatRate = (rate: number): string =>
    new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
      rate,
    );

  return (
    <>
      <div className="space-y-0.5">
        <AmountRow label={t('fiscal.irpf-projection.projected-income')} cents={data.projectedIncomeCents} />
        <AmountRow
          label={t('fiscal.irpf-projection.projected-expenses')}
          cents={data.projectedExpensesCents}
          indent
          muted
        />
        <AmountRow label={t('fiscal.irpf-projection.gastos-dificil')} cents={data.gastosDificilCents} indent muted />
        <AmountRow label={t('fiscal.irpf-projection.net-income')} cents={data.projectedNetIncomeCents} />

        <div className="border-t border-border my-2" />

        <AmountRow label={t('fiscal.irpf-projection.modelo130-total')} cents={data.modelo130TotalCents} />
        <AmountRow label={t('fiscal.irpf-projection.modelo130-paid')} cents={data.modelo130PaidCents} indent muted />
        {/* Withholdings already in the Treasury's hands — together with paid + remaining they add up to the total */}
        {data.retencionesCents > 0 && (
          <AmountRow label={t('fiscal.irpf-projection.retenciones')} cents={data.retencionesCents} indent muted />
        )}
        <AmountRow
          label={t('fiscal.irpf-projection.modelo130-remaining')}
          cents={data.modelo130RemainingCents}
          indent
          muted
        />
        <AmountRow label={t('fiscal.irpf-projection.estimated-irpf')} cents={data.estimatedIrpfCents} />
      </div>

      {/* Monthly provision + marginal and effective rates */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
        <div className="rounded-lg bg-muted p-3">
          <div className="flex items-center gap-2 mb-1">
            <PiggyBank className="h-4 w-4 text-guard-primary" aria-hidden="true" />
            <span className="text-xs text-guard-muted">{t('fiscal.irpf-projection.monthly-provision')}</span>
          </div>
          <p className="text-lg font-bold text-foreground tabular-nums">{formatCurrency(data.monthlyProvisionCents)}</p>
        </div>
        <div className="rounded-lg bg-muted p-3">
          <span className="text-xs text-guard-muted">{t('fiscal.irpf-projection.marginal-rate')}</span>
          <p className="text-lg font-bold text-foreground tabular-nums">{formatRate(data.marginalRate)}</p>
        </div>
        <div className="rounded-lg bg-muted p-3">
          <span className="text-xs text-guard-muted">{t('fiscal.irpf-projection.effective-rate')}</span>
          <p className="text-lg font-bold text-foreground tabular-nums">{formatRate(data.effectiveRate)}</p>
        </div>
      </div>
    </>
  );
}

export function IrpfProvisionCard({ year }: IrpfProvisionCardProps) {
  const { t } = useTranslate();
  const [overrideCents, setOverrideCents] = useState<number | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { data, isLoading, isError } = useIrpfProjection(year, overrideCents);

  const hasActivity = !!data && (data.ytdIncomeCents !== 0 || data.ytdExpensesCents !== 0);
  const showBreakdown = !!data && (hasActivity || overrideCents !== null);
  const isGapPositive = !!data && data.provisionGapCents > 0;

  return (
    <div className={cn('card border-l-4', isGapPositive ? 'border-l-guard-warning' : 'border-l-guard-primary')}>
      {/* Collapsing keeps the header and the headline gap; everything else slides away */}
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        aria-expanded={!isCollapsed}
        aria-controls={CONTENT_ID}
        className="flex w-full items-baseline justify-between gap-2 text-left"
      >
        <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
          {isGapPositive && <AlertTriangle className="h-4 w-4 text-guard-warning" aria-hidden="true" />}
          {t('fiscal.irpf-projection.title')}
        </h3>
        <span className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-guard-muted">{t('fiscal.irpf-projection.subtitle', { year })}</span>
          {isCollapsed ? (
            <ChevronDown className="h-4 w-4 text-guard-muted" aria-hidden="true" />
          ) : (
            <ChevronUp className="h-4 w-4 text-guard-muted" aria-hidden="true" />
          )}
        </span>
      </button>

      {isLoading && (
        <div className="flex items-center justify-center py-10">
          <LoadingSpinner size="md" label={t('common.loading')} />
        </div>
      )}

      {isError && <p className="text-sm text-guard-danger py-4">{t('fiscal.errors.load')}</p>}

      {showBreakdown && (
        <div className="mt-4">
          <GapRow data={data} />
        </div>
      )}

      {data && (
        <div
          id={CONTENT_ID}
          className={cn('grid', isCollapsed ? 'animate-collapse-close' : 'animate-collapse-open')}
          style={{ gridTemplateRows: isCollapsed ? '0fr' : '1fr' }}
        >
          <div className="overflow-hidden">
            <div className="space-y-4 pt-4">
              {!hasActivity && <p className="text-xs text-guard-muted">{t('fiscal.irpf-projection.no-activity')}</p>}

              {showBreakdown && <ProvisionBreakdown data={data} />}

              {/* Keyed on the override, not on the projection: a refetch must not wipe what is typed */}
              <ProjectedIncomeForm
                key={overrideCents ?? 'run-rate'}
                defaultEuros={centsToEuros(data.projectedIncomeCents)}
                onApply={setOverrideCents}
                onReset={overrideCents !== null ? () => setOverrideCents(null) : undefined}
              />

              {/* Too few days elapsed for the run-rate to mean anything — ask for the expected annual
                  billing. <output> is the semantic live-status element (Biome a11y rule). */}
              {!data.isProjectionReliable && (
                <output className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-guard-warning/10 border border-guard-warning/20">
                  <AlertTriangle className="h-4 w-4 text-guard-warning mt-0.5 shrink-0" aria-hidden="true" />
                  <p className="text-sm text-guard-warning">{t('fiscal.irpf-projection.unreliable-projection')}</p>
                </output>
              )}

              <DeadlineSchedule year={year} />

              <p className="text-xs text-guard-muted border-t border-border pt-3">
                {t('fiscal.irpf-projection.disclaimer')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
