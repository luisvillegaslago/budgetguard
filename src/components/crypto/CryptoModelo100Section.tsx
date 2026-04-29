'use client';

/**
 * Modelo 100 crypto summary card. Renders the 4 boxes (1804-F, 1804-N,
 * 0304, 0033) computed from the user's TaxableEvents + CryptoDisposals
 * for the requested fiscal year.
 *
 * Used both as a tab inside /crypto and (later) as a section embedded
 * in the existing /fiscal Modelo100Card.
 */

import { AlertTriangle, Download, Loader2, RefreshCw } from 'lucide-react';
import { Select } from '@/components/ui/Select';
import { API_ENDPOINT } from '@/constants/finance';
import { useCryptoModelo100Summary, useRecomputeCryptoFiscal } from '@/hooks/useCryptoFiscal';
import { useTranslate } from '@/hooks/useTranslations';
import { formatCurrency } from '@/utils/money';

interface Props {
  year: number;
  onYearChange: (year: number) => void;
}

export function CryptoModelo100Section({ year, onYearChange }: Props) {
  const { t } = useTranslate();
  const summary = useCryptoModelo100Summary(year);
  const recompute = useRecomputeCryptoFiscal();

  // Recompute every year, not just the selected one — see endpoint docs.
  const handleRecompute = async () => {
    await recompute.mutateAsync(undefined);
  };

  if (summary.isLoading) {
    return <div className="bg-card rounded-xl border border-border p-6 h-64 animate-pulse" />;
  }

  const data = summary.data?.summary;
  const years = summary.data?.availableYears ?? [];

  if (!data) {
    return (
      <div className="bg-card rounded-xl border border-border p-6">
        <p className="text-sm text-guard-muted">{t('crypto.fiscal.no-data')}</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('crypto.fiscal.title')}</h2>
          <p className="text-sm text-guard-muted mt-1">{t('crypto.fiscal.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          {years.length > 0 && (
            <Select value={year} onChange={(e) => onYearChange(Number(e.target.value))} className="w-24 text-sm">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          )}
          <a
            href={`${API_ENDPOINT.CRYPTO_FISCAL_EXPORT}?year=${year}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
            title={t('crypto.fiscal.export-csv-hint')}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {t('crypto.fiscal.export-csv')}
          </a>
          <button
            type="button"
            onClick={handleRecompute}
            disabled={recompute.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('crypto.fiscal.recompute-hint')}
          >
            {recompute.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {t('crypto.fiscal.recompute')}
          </button>
        </div>
      </div>

      {recompute.errorMessage && <p className="text-sm text-guard-danger">{recompute.errorMessage}</p>}

      {data.incompleteCoverageCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-guard-warning/30 bg-guard-warning/10 p-3 text-xs">
          <AlertTriangle className="h-4 w-4 text-guard-warning mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-guard-warning">
            {t('crypto.fiscal.incomplete-warning', { count: data.incompleteCoverageCount })}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Casilla1804Card
          label={t('crypto.fiscal.casilla-1804-f')}
          subtitle={t('crypto.fiscal.casilla-1804-f-subtitle')}
          bucket={data.casilla1804F}
        />
        <Casilla1804Card
          label={t('crypto.fiscal.casilla-1804-n')}
          subtitle={t('crypto.fiscal.casilla-1804-n-subtitle')}
          bucket={data.casilla1804N}
        />
        <SimpleCasillaCard
          label={t('crypto.fiscal.casilla-0304')}
          subtitle={t('crypto.fiscal.casilla-0304-subtitle')}
          valueCents={data.casilla0304Cents}
        />
        <SimpleCasillaCard
          label={t('crypto.fiscal.casilla-0033')}
          subtitle={t('crypto.fiscal.casilla-0033-subtitle')}
          valueCents={data.casilla0033Cents}
        />
      </div>
    </div>
  );
}

// ============================================================
// Sub-cards
// ============================================================

interface BucketSummary {
  transmissionValueCents: number;
  transmissionFeeCents: number;
  acquisitionValueCents: number;
  acquisitionFeeCents: number;
  gainLossCents: number;
  rowCount: number;
}

function Casilla1804Card({ label, subtitle, bucket }: { label: string; subtitle: string; bucket: BucketSummary }) {
  const { t } = useTranslate();
  const isGain = bucket.gainLossCents >= 0;
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
      <div>
        <p className="text-xs font-mono uppercase text-guard-muted">{label}</p>
        <p className="text-xs text-guard-muted">{subtitle}</p>
      </div>
      <dl className="space-y-1 text-sm">
        <Row
          label={t('crypto.fiscal.fields.transmission-value')}
          value={formatCurrency(bucket.transmissionValueCents)}
        />
        <Row label={t('crypto.fiscal.fields.transmission-fee')} value={formatCurrency(bucket.transmissionFeeCents)} />
        <Row label={t('crypto.fiscal.fields.acquisition-value')} value={formatCurrency(bucket.acquisitionValueCents)} />
        <Row label={t('crypto.fiscal.fields.acquisition-fee')} value={formatCurrency(bucket.acquisitionFeeCents)} />
      </dl>
      <div className="pt-2 border-t border-border flex justify-between text-sm">
        <span className="text-guard-muted">{t('crypto.fiscal.fields.gain-loss')}</span>
        <span className={`font-semibold ${isGain ? 'text-guard-success' : 'text-guard-danger'}`}>
          {formatCurrency(bucket.gainLossCents)}
        </span>
      </div>
      <p className="text-xs text-guard-muted">{t('crypto.fiscal.row-count', { count: bucket.rowCount })}</p>
    </div>
  );
}

function SimpleCasillaCard({ label, subtitle, valueCents }: { label: string; subtitle: string; valueCents: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
      <div>
        <p className="text-xs font-mono uppercase text-guard-muted">{label}</p>
        <p className="text-xs text-guard-muted">{subtitle}</p>
      </div>
      <p className="text-2xl font-semibold text-foreground">{formatCurrency(valueCents)}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-guard-muted">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
