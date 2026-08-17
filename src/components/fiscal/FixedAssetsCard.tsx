'use client';

/**
 * BudgetGuard Fixed Assets Card
 * The inmovilizado of the user and the dotación each asset leaves in the fiscal year on screen.
 *
 * An asset is not consumed the year it is bought: its cost is spread over its useful life
 * (art. 30.2 RIRPF + tabla de amortización simplificada), and only the yearly dotación is
 * deductible — casilla 0208 for material, 0227 for intangible.
 *
 * The dotación is a fiscal figure, never a bank movement: no money leaves the account when a year
 * accrues, which is why nothing here creates a transaction and why the card says so out loud.
 *
 * The schedules are computed in the browser with the same pure functions the fiscal reports use
 * (src/utils/amortization.ts), so the table can never contradict what Modelo 100 will carry.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { Boxes, ChevronDown, ChevronUp, Info, Plus, X } from 'lucide-react';
import { Fragment, useState } from 'react';
import { useForm } from 'react-hook-form';
import { FiscalAmountRow as AmountRow } from '@/components/fiscal/FiscalAmountRow';
import { DeleteButton } from '@/components/ui/DeleteButton';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Select } from '@/components/ui/Select';
import {
  AMORTIZATION,
  AMORTIZATION_CASILLA_OPTIONS,
  AMORTIZATION_GROUP,
  AMORTIZATION_GROUP_OPTIONS,
  type AmortizationGroupNumber,
  MODELO_100_CASILLA,
  VAT_RATE,
} from '@/constants/finance';
import { useCreateFixedAsset, useDeleteFixedAsset, useFixedAssets } from '@/hooks/useFixedAssets';
import { useTranslate } from '@/hooks/useTranslations';
import { type CreateFixedAssetInput, CreateFixedAssetSchema } from '@/schemas/fixed-asset';
import type { AmortizationYear, FixedAsset } from '@/types/finance';
import { computeAmortizationSchedule } from '@/utils/amortization';
import { computeFiscalFields } from '@/utils/fiscal';
import { cn, formatDate, toDateString, toNullableNumber } from '@/utils/helpers';
import { centsToEuros, eurosToCents, formatCurrency } from '@/utils/money';

interface FixedAssetsCardProps {
  year: number;
}

/** Ties the collapse toggle to the region it controls (aria-controls) */
const CONTENT_ID = 'fixed-assets-content';

/** The whole base is amortizable: computeFiscalFields() splits by deduction, which does not apply here */
const FULL_DEDUCTION_PERCENT = 100;

const VAT_RATE_OPTIONS = Object.values(VAT_RATE);

/** The ERD doubling only reaches elementos nuevos del inmovilizado material, never the intangible */
const CASILLA_INTANGIBLE = MODELO_100_CASILLA.C0227;

const inputClasses = (hasError: boolean): string =>
  cn(
    'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground text-sm',
    'transition-colors duration-200 ease-out-quart',
    hasError ? 'border-guard-danger' : 'border-input',
  );

const SUBMIT_CLASSES = cn(
  'shrink-0 px-4 py-2.5 rounded-lg font-semibold text-white',
  'bg-guard-primary hover:bg-guard-primary/90',
  'transition-all duration-200 ease-out-quart active:scale-[0.98]',
  'disabled:opacity-50 disabled:cursor-not-allowed',
);

const CELL_CLASSES = 'px-3 py-2 text-right tabular-nums';
const HEADER_CLASSES = 'px-3 py-2 text-xs font-semibold text-guard-muted uppercase tracking-wider';

/** An asset together with what it leaves in the fiscal year on screen. */
interface AssetRow {
  asset: FixedAsset;
  schedule: AmortizationYear[];
  /** Dotación of the year being viewed */
  yearCents: number;
  /** Base still to amortize once that year is closed */
  remainingCents: number;
}

/**
 * Folds an asset into the figures of one fiscal year. A year outside the schedule is not an error:
 * before the asset entered service nothing has been amortized yet, and after it is exhausted the
 * last entry already says zero.
 */
function toAssetRow(asset: FixedAsset, year: number): AssetRow {
  const schedule = computeAmortizationSchedule(asset);
  const closedYears = schedule.filter((entry) => entry.fiscalYear <= year);

  return {
    asset,
    schedule,
    yearCents: schedule.find((entry) => entry.fiscalYear === year)?.cents ?? 0,
    remainingCents: closedYears.at(-1)?.remainingCents ?? asset.baseCents,
  };
}

/** Maximum linear rate of a grupo, doubled when the ERD acceleration is claimed (art. 103 LIS). */
function rateForGroup(group: AmortizationGroupNumber, accelerated: boolean): number {
  return AMORTIZATION_GROUP[group].coefficientPercent * (accelerated ? AMORTIZATION.ERD_MULTIPLIER : 1);
}

/** Year-by-year table of an asset. The cents always add up to its base — the last year takes the remainder. */
function AmortizationScheduleTable({ years, currentYear }: { years: AmortizationYear[]; currentYear: number }) {
  const { t } = useTranslate();
  const totalCents = years.reduce((sum, entry) => sum + entry.cents, 0);

  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <h4 className="text-sm font-semibold text-foreground mb-2">{t('fiscal.fixed-assets.schedule.title')}</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className={cn(HEADER_CLASSES, 'text-left')}>{t('fiscal.fixed-assets.schedule.year')}</th>
              <th className={cn(HEADER_CLASSES, 'text-right')}>{t('fiscal.fixed-assets.schedule.amount')}</th>
              <th className={cn(HEADER_CLASSES, 'text-right')}>{t('fiscal.fixed-assets.schedule.remaining')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {years.map((entry) => (
              <tr key={entry.fiscalYear} className={cn(entry.fiscalYear === currentYear && 'bg-guard-primary/5')}>
                <td
                  className={cn(
                    'px-3 py-1.5 tabular-nums',
                    entry.fiscalYear === currentYear ? 'font-semibold text-foreground' : 'text-foreground/80',
                  )}
                >
                  {entry.fiscalYear}
                </td>
                <td className={cn(CELL_CLASSES, 'py-1.5 font-medium')}>{formatCurrency(entry.cents)}</td>
                <td className={cn(CELL_CLASSES, 'py-1.5 text-guard-muted')}>
                  {entry.remainingCents === 0
                    ? t('fiscal.fixed-assets.schedule.fully-amortized')
                    : formatCurrency(entry.remainingCents)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border">
              <td className="px-3 py-1.5 text-sm font-semibold text-foreground">
                {t('fiscal.fixed-assets.schedule.total')}
              </td>
              <td className={cn(CELL_CLASSES, 'py-1.5 font-bold')}>{formatCurrency(totalCents)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

interface AssetActionsProps {
  assetId: number;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

/** Expand toggle + delete, shared by the desktop table and the mobile list. */
function AssetActions({ assetId, isExpanded, onToggle, onDelete, isDeleting }: AssetActionsProps) {
  const { t } = useTranslate();

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={`asset-schedule-${assetId}`}
        aria-label={t('fiscal.fixed-assets.schedule.title')}
        className="tap-target lg:min-h-8 lg:min-w-8 p-2 rounded-lg text-guard-muted hover:bg-muted hover:text-foreground transition-colors duration-200"
      >
        {isExpanded ? (
          <ChevronUp className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
      <DeleteButton
        onDelete={onDelete}
        isDeleting={isDeleting}
        defaultLabel={t('fiscal.fixed-assets.delete')}
        confirmLabel={t('fiscal.fixed-assets.delete-confirm')}
      />
    </div>
  );
}

interface AssetListProps {
  rows: AssetRow[];
  year: number;
  expandedId: number | null;
  onToggle: (assetId: number) => void;
  onDelete: (assetId: number) => void;
  deletingId: number | null;
}

/** Desktop table. The schedule of the expanded asset takes a full-width row under it. */
function AssetTable({ rows, year, expandedId, onToggle, onDelete, deletingId }: AssetListProps) {
  const { t, locale } = useTranslate();

  return (
    <div className="hidden lg:block overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className={cn(HEADER_CLASSES, 'text-left')}>{t('fiscal.fixed-assets.columns.description')}</th>
            <th className={cn(HEADER_CLASSES, 'text-left')}>{t('fiscal.fixed-assets.columns.in-service-date')}</th>
            <th className={cn(HEADER_CLASSES, 'text-right')}>{t('fiscal.fixed-assets.columns.base')}</th>
            <th className={cn(HEADER_CLASSES, 'text-right')}>{t('fiscal.fixed-assets.columns.coefficient')}</th>
            <th className={cn(HEADER_CLASSES, 'text-left')}>{t('fiscal.fixed-assets.columns.casilla')}</th>
            <th className={cn(HEADER_CLASSES, 'text-right')}>{t('fiscal.fixed-assets.columns.year-amount')}</th>
            <th className={cn(HEADER_CLASSES, 'text-right')}>{t('fiscal.fixed-assets.columns.remaining')}</th>
            <th className={cn(HEADER_CLASSES, 'text-right')}>{t('fiscal.fixed-assets.columns.actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {rows.map((row) => (
            <Fragment key={row.asset.assetId}>
              <tr className="group hover:bg-muted/50 transition-colors">
                <td className="px-3 py-2 text-foreground max-w-[220px] truncate">{row.asset.description}</td>
                <td className="px-3 py-2 text-guard-muted tabular-nums whitespace-nowrap">
                  {formatDate(row.asset.inServiceDate, 'numeric', locale)}
                </td>
                <td className={CELL_CLASSES}>{formatCurrency(row.asset.baseCents)}</td>
                <td className={cn(CELL_CLASSES, 'text-guard-muted')}>{row.asset.coefficientPercent} %</td>
                <td className="px-3 py-2 text-guard-muted whitespace-nowrap">{row.asset.modelo100CasillaCode}</td>
                <td className={cn(CELL_CLASSES, 'font-semibold text-guard-primary')}>
                  {formatCurrency(row.yearCents)}
                </td>
                <td className={cn(CELL_CLASSES, 'text-guard-muted')}>{formatCurrency(row.remainingCents)}</td>
                <td className="px-3 py-2">
                  <AssetActions
                    assetId={row.asset.assetId}
                    isExpanded={expandedId === row.asset.assetId}
                    onToggle={() => onToggle(row.asset.assetId)}
                    onDelete={() => onDelete(row.asset.assetId)}
                    isDeleting={deletingId === row.asset.assetId}
                  />
                </td>
              </tr>
              {expandedId === row.asset.assetId && (
                <tr>
                  <td colSpan={8} className="px-3 pb-3" id={`asset-schedule-${row.asset.assetId}`}>
                    <AmortizationScheduleTable years={row.schedule} currentYear={year} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Mobile/tablet list: the same figures as the table, stacked. */
function AssetCards({ rows, year, expandedId, onToggle, onDelete, deletingId }: AssetListProps) {
  const { t, locale } = useTranslate();

  return (
    <div className="lg:hidden divide-y divide-border">
      {rows.map((row) => (
        <div key={row.asset.assetId} className="group py-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{row.asset.description}</p>
              <p className="text-xs text-guard-muted tabular-nums">
                {formatDate(row.asset.inServiceDate, 'numeric', locale)} · {row.asset.coefficientPercent} % ·{' '}
                {row.asset.modelo100CasillaCode}
              </p>
            </div>
            <AssetActions
              assetId={row.asset.assetId}
              isExpanded={expandedId === row.asset.assetId}
              onToggle={() => onToggle(row.asset.assetId)}
              onDelete={() => onDelete(row.asset.assetId)}
              isDeleting={deletingId === row.asset.assetId}
            />
          </div>

          <div className="grid grid-cols-3 gap-x-3 text-xs">
            <div>
              <span className="text-guard-muted">{t('fiscal.fixed-assets.columns.base')}</span>
              <p className="tabular-nums">{formatCurrency(row.asset.baseCents)}</p>
            </div>
            <div>
              <span className="text-guard-muted">{t('fiscal.fixed-assets.columns.year-amount')}</span>
              <p className="tabular-nums font-semibold text-guard-primary">{formatCurrency(row.yearCents)}</p>
            </div>
            <div>
              <span className="text-guard-muted">{t('fiscal.fixed-assets.columns.remaining')}</span>
              <p className="tabular-nums">{formatCurrency(row.remainingCents)}</p>
            </div>
          </div>

          {expandedId === row.asset.assetId && (
            <div id={`asset-schedule-${row.asset.assetId}`}>
              <AmortizationScheduleTable years={row.schedule} currentYear={year} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface FieldErrorProps {
  id: string;
  /** Translation key produced by the Zod resolver, not a ready-made sentence */
  errorKey?: string;
}

function FieldError({ id, errorKey }: FieldErrorProps) {
  const { t } = useTranslate();
  if (!errorKey) return null;

  return (
    <p id={id} role="alert" className="mt-1 text-sm text-guard-danger">
      {t(errorKey)}
    </p>
  );
}

/**
 * Registers a new asset.
 *
 * The user types what he paid and the VAT he already deducted through Modelo 303; the amortizable
 * base is derived from those with computeFiscalFields(), the same rounding the fiscal repository
 * applies to every expense, so an asset and its purchase expense can never disagree by a cent.
 *
 * Picking a grupo fills the rate with the tabla maximum, and the acelerada toggle doubles it. Both
 * only *seed* the field: amortising slower than the maximum is legal, so the rate stays editable.
 */
function FixedAssetForm({ onSaved }: { onSaved: () => void }) {
  const { t } = useTranslate();
  const createAsset = useCreateFixedAsset();

  // Purchase price and VAT are only the road to the base: neither is stored on the asset
  const [grossAmount, setGrossAmount] = useState('');
  const [vatPercent, setVatPercent] = useState<number>(VAT_RATE.STANDARD);
  const [isAccelerated, setIsAccelerated] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateFixedAssetInput>({
    resolver: zodResolver(CreateFixedAssetSchema),
    defaultValues: {
      description: '',
      // The DATE column is a calendar day; the string is coerced by the schema at the edge
      inServiceDate: toDateString(new Date()) as unknown as Date,
      modelo100CasillaCode: MODELO_100_CASILLA.C0208,
      amortizationGroup: null,
      transactionId: null,
      notes: null,
    },
  });

  const selectedGroup = watch('amortizationGroup') ?? null;
  const isIntangible = watch('modelo100CasillaCode') === CASILLA_INTANGIBLE;

  const applyDerivedBase = (gross: string, vat: number) => {
    const grossValue = Number(gross);
    if (gross === '' || Number.isNaN(grossValue) || grossValue <= 0) return;

    const { baseCents } = computeFiscalFields(eurosToCents(grossValue), vat, FULL_DEDUCTION_PERCENT);
    setValue('baseAmount', centsToEuros(baseCents), { shouldValidate: true });
  };

  // A custom rate belongs to no grupo: with none selected, whatever is typed is left alone
  const applyGroupRate = (group: AmortizationGroupNumber | null, accelerated: boolean) => {
    if (group === null) return;
    setValue('coefficientPercent', rateForGroup(group, accelerated), { shouldValidate: true });
  };

  const handleGrossChange = (value: string) => {
    setGrossAmount(value);
    applyDerivedBase(value, vatPercent);
  };

  const handleVatChange = (value: number) => {
    setVatPercent(value);
    applyDerivedBase(grossAmount, value);
  };

  const handleAcceleratedChange = (accelerated: boolean) => {
    setIsAccelerated(accelerated);
    applyGroupRate(selectedGroup, accelerated);
  };

  // Switching to the intangible box withdraws the ERD acceleration: art. 103 LIS does not reach it
  const handleCasillaChange = (casilla: string) => {
    if (casilla !== CASILLA_INTANGIBLE || !isAccelerated) return;
    setIsAccelerated(false);
    applyGroupRate(selectedGroup, false);
  };

  const groupRegistration = register('amortizationGroup', { setValueAs: toNullableNumber });
  const casillaRegistration = register('modelo100CasillaCode');

  const onSubmit = async (values: CreateFixedAssetInput) => {
    try {
      await createAsset.mutateAsync(values);
      onSaved();
    } catch (_error) {
      // Surfaced through createAsset.errorMessage
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 border-t border-border pt-4">
      <div>
        <label htmlFor="asset-description" className="block text-sm font-medium text-foreground mb-1.5">
          {t('fiscal.fixed-assets.fields.description')}
        </label>
        <input
          id="asset-description"
          type="text"
          autoComplete="off"
          placeholder={t('fiscal.fixed-assets.fields.description-placeholder')}
          {...register('description')}
          aria-invalid={!!errors.description}
          aria-describedby={errors.description ? 'asset-description-error' : undefined}
          className={inputClasses(!!errors.description)}
        />
        <FieldError id="asset-description-error" errorKey={errors.description?.message} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="asset-gross" className="block text-sm font-medium text-foreground mb-1.5">
            {t('fiscal.fixed-assets.fields.gross-amount')}
          </label>
          <input
            id="asset-gross"
            type="number"
            step="0.01"
            min="0"
            autoComplete="off"
            value={grossAmount}
            onChange={(e) => handleGrossChange(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
            className={inputClasses(false)}
          />
          <p className="mt-1 text-xs text-guard-muted">{t('fiscal.fixed-assets.fields.gross-amount-hint')}</p>
        </div>

        <div>
          <label htmlFor="asset-vat" className="block text-sm font-medium text-foreground mb-1.5">
            {t('fiscal.form.vat-percent')}
          </label>
          <Select id="asset-vat" value={vatPercent} onChange={(e) => handleVatChange(Number(e.target.value))}>
            {VAT_RATE_OPTIONS.map((rate) => (
              <option key={rate} value={rate}>
                {`${rate} %`}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label htmlFor="asset-base" className="block text-sm font-medium text-foreground mb-1.5">
            {t('fiscal.fixed-assets.fields.base-amount')}
          </label>
          <input
            id="asset-base"
            type="number"
            step="0.01"
            min="0"
            autoComplete="off"
            {...register('baseAmount', { valueAsNumber: true })}
            onWheel={(e) => e.currentTarget.blur()}
            aria-invalid={!!errors.baseAmount}
            aria-describedby={errors.baseAmount ? 'asset-base-error' : undefined}
            className={cn(inputClasses(!!errors.baseAmount), 'tabular-nums')}
          />
          <p className="mt-1 text-xs text-guard-muted">{t('fiscal.fixed-assets.fields.base-amount-hint')}</p>
          <FieldError id="asset-base-error" errorKey={errors.baseAmount?.message} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="asset-in-service-date" className="block text-sm font-medium text-foreground mb-1.5">
            {t('fiscal.fixed-assets.fields.in-service-date')}
          </label>
          <input
            id="asset-in-service-date"
            type="date"
            {...register('inServiceDate')}
            aria-invalid={!!errors.inServiceDate}
            aria-describedby={errors.inServiceDate ? 'asset-in-service-date-error' : undefined}
            className={inputClasses(!!errors.inServiceDate)}
          />
          <p className="mt-1 text-xs text-guard-muted">{t('fiscal.fixed-assets.fields.in-service-date-hint')}</p>
          <FieldError id="asset-in-service-date-error" errorKey={errors.inServiceDate?.message} />
        </div>

        <div>
          <label htmlFor="asset-casilla" className="block text-sm font-medium text-foreground mb-1.5">
            {t('fiscal.fixed-assets.fields.casilla')}
          </label>
          <Select
            id="asset-casilla"
            {...casillaRegistration}
            onChange={(e) => {
              casillaRegistration.onChange(e);
              handleCasillaChange(e.target.value);
            }}
          >
            {AMORTIZATION_CASILLA_OPTIONS.map((casilla) => (
              <option key={casilla} value={casilla}>
                {t(`fiscal.fixed-assets.casillas.${casilla}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="asset-group" className="block text-sm font-medium text-foreground mb-1.5">
            {t('fiscal.fixed-assets.fields.group')}
          </label>
          <Select
            id="asset-group"
            {...groupRegistration}
            onChange={(e) => {
              groupRegistration.onChange(e);
              applyGroupRate(toNullableNumber(e.target.value) as AmortizationGroupNumber | null, isAccelerated);
            }}
          >
            <option value="">{t('fiscal.fixed-assets.fields.group-none')}</option>
            {AMORTIZATION_GROUP_OPTIONS.map((option) => (
              <option key={option.group} value={option.group}>
                {t('fiscal.fixed-assets.group-option', {
                  group: option.group,
                  name: t(`fiscal.fixed-assets.groups.${option.group}`),
                  percent: option.coefficientPercent,
                })}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-guard-muted">{t('fiscal.fixed-assets.fields.group-none-hint')}</p>
        </div>

        <div>
          <label htmlFor="asset-coefficient" className="block text-sm font-medium text-foreground mb-1.5">
            {t('fiscal.fixed-assets.fields.coefficient')}
          </label>
          <input
            id="asset-coefficient"
            type="number"
            step="0.01"
            min="0"
            max="100"
            autoComplete="off"
            {...register('coefficientPercent', { valueAsNumber: true })}
            onWheel={(e) => e.currentTarget.blur()}
            aria-invalid={!!errors.coefficientPercent}
            aria-describedby={errors.coefficientPercent ? 'asset-coefficient-error' : undefined}
            className={cn(inputClasses(!!errors.coefficientPercent), 'tabular-nums')}
          />
          <p className="mt-1 text-xs text-guard-muted">{t('fiscal.fixed-assets.fields.coefficient-hint')}</p>
          <FieldError id="asset-coefficient-error" errorKey={errors.coefficientPercent?.message} />
        </div>
      </div>

      {/* Amortización acelerada: only offered where art. 103 LIS reaches, and only next to a grupo */}
      <div className="flex items-start gap-3">
        <input
          id="asset-accelerated"
          type="checkbox"
          checked={isAccelerated}
          disabled={isIntangible || selectedGroup === null}
          onChange={(e) => handleAcceleratedChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-input text-guard-primary disabled:opacity-50"
        />
        <div>
          <label htmlFor="asset-accelerated" className="text-sm font-medium text-foreground">
            {t('fiscal.fixed-assets.fields.accelerated')}
          </label>
          {selectedGroup !== null && (
            <p className="text-xs text-guard-muted">
              {t('fiscal.fixed-assets.fields.accelerated-hint', {
                base: rateForGroup(selectedGroup, false),
                doubled: rateForGroup(selectedGroup, true),
              })}
            </p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="asset-notes" className="block text-sm font-medium text-foreground mb-1.5">
          {t('fiscal.fixed-assets.fields.notes')} ({t('common.labels.optional')})
        </label>
        <input
          id="asset-notes"
          type="text"
          autoComplete="off"
          {...register('notes', { setValueAs: (value) => (value === '' || value == null ? null : String(value)) })}
          className={inputClasses(false)}
        />
      </div>

      {createAsset.errorMessage && (
        <p role="alert" className="text-sm text-guard-danger">
          {createAsset.errorMessage}
        </p>
      )}

      <button type="submit" disabled={isSubmitting || createAsset.isPending} className={SUBMIT_CLASSES}>
        {isSubmitting || createAsset.isPending ? (
          <span className="flex items-center justify-center gap-2">
            <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
            {t('common.loading')}
          </span>
        ) : (
          t('fiscal.fixed-assets.add')
        )}
      </button>
    </form>
  );
}

export function FixedAssetsCard({ year }: FixedAssetsCardProps) {
  const { t } = useTranslate();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // Confirmation of the last save. Lives here and not in the form, which unmounts on success
  const [justSaved, setJustSaved] = useState(false);

  const { data, isLoading, isError } = useFixedAssets(year);
  const deleteAsset = useDeleteFixedAsset();

  const rows = (data ?? []).map((asset) => toAssetRow(asset, year));
  const yearTotalCents = rows.reduce((sum, row) => sum + row.yearCents, 0);

  // Reopening the form clears the previous confirmation: it belongs to the asset already saved
  const handleOpenForm = () => {
    setJustSaved(false);
    setIsFormOpen(true);
  };

  const handleSaved = () => {
    setIsFormOpen(false);
    setJustSaved(true);
  };

  const handleDelete = (assetId: number) => {
    setDeletingId(assetId);
    deleteAsset.mutate(assetId, { onSettled: () => setDeletingId(null) });
  };

  const listProps = {
    rows,
    year,
    expandedId,
    onToggle: (assetId: number) => setExpandedId(expandedId === assetId ? null : assetId),
    onDelete: handleDelete,
    deletingId,
  };

  return (
    <div className="card border-l-4 border-l-guard-primary">
      {/* Collapsing keeps the header and the dotación of the year; everything else slides away */}
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        aria-expanded={!isCollapsed}
        aria-controls={CONTENT_ID}
        className="flex w-full items-baseline justify-between gap-2 text-left"
      >
        <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <Boxes className="h-4 w-4 text-guard-primary" aria-hidden="true" />
          {t('fiscal.fixed-assets.title')}
        </h3>
        {isCollapsed ? (
          <ChevronDown className="h-4 w-4 text-guard-muted shrink-0" aria-hidden="true" />
        ) : (
          <ChevronUp className="h-4 w-4 text-guard-muted shrink-0" aria-hidden="true" />
        )}
      </button>

      {isLoading && (
        <div className="flex items-center justify-center py-10">
          <LoadingSpinner size="md" label={t('common.loading')} />
        </div>
      )}

      {isError && <p className="text-sm text-guard-danger py-4">{t('fiscal.fixed-assets.errors.load-failed')}</p>}

      {data && (
        <div className="mt-4">
          <AmountRow label={t('fiscal.fixed-assets.year-total', { year })} cents={yearTotalCents} highlight />
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
              <p className="text-xs text-guard-muted">{t('fiscal.fixed-assets.subtitle')}</p>

              {/* The whole point of the card: a dotación is deducted, but no money moves */}
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-guard-primary/5 border border-guard-primary/20">
                <Info className="h-4 w-4 text-guard-primary mt-0.5 shrink-0" aria-hidden="true" />
                <p className="text-sm text-foreground/80">{t('fiscal.fixed-assets.dotacion-note')}</p>
              </div>

              {rows.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-guard-muted">{t('fiscal.fixed-assets.empty')}</p>
                  <p className="text-xs text-guard-muted mt-1">{t('fiscal.fixed-assets.empty-hint')}</p>
                </div>
              ) : (
                <>
                  <AssetTable {...listProps} />
                  <AssetCards {...listProps} />
                </>
              )}

              {deleteAsset.errorMessage && (
                <p role="alert" className="text-sm text-guard-danger">
                  {deleteAsset.errorMessage}
                </p>
              )}

              {deleteAsset.isSuccess && (
                <output className="block text-sm text-guard-success animate-fade-in">
                  {t('fiscal.fixed-assets.deleted')}
                </output>
              )}

              {justSaved && (
                <output className="block text-sm text-guard-success animate-fade-in">
                  {t('fiscal.fixed-assets.saved')}
                </output>
              )}

              {isFormOpen ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-foreground">{t('fiscal.fixed-assets.add')}</h4>
                    <button
                      type="button"
                      onClick={() => setIsFormOpen(false)}
                      aria-label={t('common.buttons.cancel')}
                      className="p-2 rounded-lg text-guard-muted hover:bg-muted hover:text-foreground transition-colors duration-200"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <FixedAssetForm onSaved={handleSaved} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenForm}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
                    'text-guard-primary bg-guard-primary/10 hover:bg-guard-primary/20',
                    'transition-all duration-200 ease-out-quart active:scale-[0.98]',
                  )}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t('fiscal.fixed-assets.add')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
