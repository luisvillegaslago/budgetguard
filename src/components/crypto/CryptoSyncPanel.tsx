'use client';

/**
 * Sync control panel — top of the /crypto page.
 *
 * Recovers the currently active job (or the latest finished one) from
 * GET /api/crypto/sync on mount via useLatestCryptoSyncJob, so a user that
 * navigates away mid-sync sees the same progress when they come back.
 *
 * Buttons disable + animate the icon as long as the job is still running, and
 * the active job's status drives the polled JobStatus sub-view below.
 */

import { useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Select } from '@/components/ui/Select';
import {
  CRYPTO_EXCHANGE,
  CRYPTO_SYNC_MODE,
  CRYPTO_SYNC_STATUS,
  type CryptoEventType,
  QUERY_KEY,
} from '@/constants/finance';
import {
  type EndpointProgress,
  type SyncJob,
  useCancelCryptoSync,
  useCryptoSyncJob,
  useLatestCryptoSyncJob,
  useStartCryptoSync,
} from '@/hooks/useCryptoSync';
import { useTranslate } from '@/hooks/useTranslations';

type ScopePreset = 'current_year' | 'previous_year' | 'last_90_days' | 'all_time';

function presetToDate(preset: ScopePreset): string | undefined {
  const now = new Date();
  switch (preset) {
    case 'current_year':
      return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
    case 'previous_year':
      return new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1)).toISOString();
    case 'last_90_days':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    case 'all_time':
      return undefined; // server falls back to BINANCE_GENESIS_DATE
  }
}

export function CryptoSyncPanel() {
  const { t } = useTranslate();
  const queryClient = useQueryClient();
  const latest = useLatestCryptoSyncJob(CRYPTO_EXCHANGE.BINANCE);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [scopePreset, setScopePreset] = useState<ScopePreset>('previous_year');
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const start = useStartCryptoSync();
  const cancel = useCancelCryptoSync();
  const job = useCryptoSyncJob(activeJobId);

  // Re-attach to the most recent job when the page mounts. Keeps "Active job"
  // tracking consistent across tab navigation.
  useEffect(() => {
    if (latest.data?.jobId && activeJobId == null) {
      setActiveJobId(latest.data.jobId);
    }
  }, [latest.data?.jobId, activeJobId]);

  // When the active job transitions to a terminal state, refetch the events
  // table and mark the latest-job cache as stale so a future page mount picks
  // up the new "last completed" state.
  useEffect(() => {
    if (!job.data) return;
    const isTerminal =
      job.data.status === CRYPTO_SYNC_STATUS.COMPLETED ||
      job.data.status === CRYPTO_SYNC_STATUS.FAILED ||
      job.data.status === CRYPTO_SYNC_STATUS.CANCELLED;
    if (isTerminal) {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.CRYPTO_EVENTS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.CRYPTO_SYNC_STATUS, 'latest', CRYPTO_EXCHANGE.BINANCE] });
    }
  }, [job.data, queryClient]);

  const triggerSync = async (mode: typeof CRYPTO_SYNC_MODE.FULL | typeof CRYPTO_SYNC_MODE.INCREMENTAL) => {
    // Incremental sync ignores the preset (always picks up where last sync ended).
    const scopeFrom = mode === CRYPTO_SYNC_MODE.FULL ? presetToDate(scopePreset) : undefined;
    const result = await start.mutateAsync({ exchange: CRYPTO_EXCHANGE.BINANCE, mode, scopeFrom });
    setActiveJobId(result.jobId);
  };

  const handleStopRequest = () => {
    if (!job.data) return;
    setStopConfirmOpen(true);
  };

  const handleStopConfirm = async () => {
    if (!job.data) return;
    await cancel.mutateAsync(job.data.jobId);
    setStopConfirmOpen(false);
  };

  const isRunning = job.data?.status === CRYPTO_SYNC_STATUS.RUNNING || job.data?.status === CRYPTO_SYNC_STATUS.PENDING;
  const isBusy = start.isPending || isRunning;

  if (latest.isLoading) {
    return <div className="bg-card rounded-xl border border-border p-6 h-32 animate-pulse" />;
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('crypto.sync.title')}</h2>
          <p className="text-sm text-guard-muted mt-1">{t('crypto.sync.subtitle')}</p>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex items-center gap-2">
            <label htmlFor="scopePreset" className="text-xs text-guard-muted whitespace-nowrap">
              {t('crypto.sync.scope-label')}
            </label>
            <Select
              id="scopePreset"
              value={scopePreset}
              onChange={(e) => setScopePreset(e.target.value as ScopePreset)}
              disabled={isBusy}
              className="w-44"
            >
              <option value="current_year">{t('crypto.sync.scope.current-year')}</option>
              <option value="previous_year">{t('crypto.sync.scope.previous-year')}</option>
              <option value="last_90_days">{t('crypto.sync.scope.last-90-days')}</option>
              <option value="all_time">{t('crypto.sync.scope.all-time')}</option>
            </Select>
          </div>

          <div className="flex gap-2">
            {isRunning ? (
              <button
                type="button"
                onClick={handleStopRequest}
                disabled={cancel.isPending}
                className="btn-primary flex items-center gap-2 bg-guard-danger hover:bg-guard-danger/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancel.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Ban className="h-4 w-4" aria-hidden="true" />
                )}
                {t('crypto.sync.stop')}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => triggerSync(CRYPTO_SYNC_MODE.INCREMENTAL)}
                  disabled={isBusy}
                  className="btn-ghost flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={t('crypto.sync.incremental-hint')}
                >
                  <RefreshCw className={`h-4 w-4 ${isBusy ? 'animate-spin' : ''}`} aria-hidden="true" />
                  {t('crypto.sync.incremental')}
                </button>
                <button
                  type="button"
                  onClick={() => triggerSync(CRYPTO_SYNC_MODE.FULL)}
                  disabled={isBusy}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  )}
                  {isBusy ? t('crypto.sync.syncing') : t('crypto.sync.full')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {start.errorMessage && <p className="text-sm text-guard-danger">{start.errorMessage}</p>}

      {!job.data && !activeJobId && <p className="text-sm text-guard-muted">{t('crypto.sync.never-synced')}</p>}

      {job.data && <JobStatus job={job.data} />}

      <ConfirmDialog
        open={stopConfirmOpen}
        title={t('crypto.sync.stop')}
        message={t('crypto.sync.stop-confirm')}
        confirmLabel={t('crypto.sync.stop')}
        variant="danger"
        isLoading={cancel.isPending}
        onConfirm={handleStopConfirm}
        onCancel={() => setStopConfirmOpen(false)}
      />
    </div>
  );
}

// ============================================================
// Job status sub-view
// ============================================================

function JobStatus({ job }: { job: SyncJob }) {
  const { t, locale } = useTranslate();

  const statusKey = `crypto.sync.status.${job.status}` as const;
  const statusIcon = {
    [CRYPTO_SYNC_STATUS.PENDING]: <Loader2 className="h-4 w-4 animate-spin text-guard-muted" aria-hidden="true" />,
    [CRYPTO_SYNC_STATUS.RUNNING]: <Loader2 className="h-4 w-4 animate-spin text-guard-primary" aria-hidden="true" />,
    [CRYPTO_SYNC_STATUS.COMPLETED]: <CheckCircle2 className="h-4 w-4 text-guard-success" aria-hidden="true" />,
    [CRYPTO_SYNC_STATUS.FAILED]: <XCircle className="h-4 w-4 text-guard-danger" aria-hidden="true" />,
    [CRYPTO_SYNC_STATUS.CANCELLED]: <Ban className="h-4 w-4 text-guard-muted" aria-hidden="true" />,
  }[job.status];

  const totalWindows = Object.values(job.progress).reduce((sum, p) => sum + p.totalWindows, 0);
  const completedWindows = Object.values(job.progress).reduce((sum, p) => sum + p.completedWindows, 0);
  const overallPct = totalWindows > 0 ? Math.round((completedWindows / totalWindows) * 100) : 0;

  const fmt = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        {statusIcon}
        <span className="font-medium text-foreground">{t(statusKey)}</span>
        <span className="text-guard-muted">
          — {job.eventsIngested} {t('crypto.sync.events-ingested')}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-guard-muted">
          <span>{t('crypto.sync.overall-progress')}</span>
          <span>
            {overallPct}% ({completedWindows}/{totalWindows})
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-guard-primary transition-all duration-500"
            style={{ width: `${overallPct}%` }}
            aria-valuenow={overallPct}
            aria-valuemin={0}
            aria-valuemax={100}
            role="progressbar"
          />
        </div>
      </div>

      {Object.keys(job.progress).length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-guard-muted hover:text-foreground">
            {t('crypto.sync.per-endpoint')}
          </summary>
          <div className="mt-2 space-y-1 pl-2">
            {Object.entries(job.progress).map(([eventType, progress]) => (
              <EndpointRow key={eventType} eventType={eventType as CryptoEventType} progress={progress} />
            ))}
          </div>
        </details>
      )}

      {(job.errorCode || job.errorMessage) && (
        <div className="rounded-lg border border-guard-danger/30 bg-guard-danger/10 p-3 text-xs text-guard-danger space-y-2">
          <p>{translateErrorCode(job.errorCode, t)}</p>
          {job.errorMessage && job.errorMessage !== job.errorCode && (
            <details className="text-[11px] opacity-80">
              <summary className="cursor-pointer">{t('crypto.sync.error-details')}</summary>
              <p className="mt-1 font-mono whitespace-pre-wrap">{job.errorMessage}</p>
            </details>
          )}
        </div>
      )}

      {job.finishedAt && (
        <p className="text-xs text-guard-muted">
          {t('crypto.sync.finished-at', { at: fmt.format(new Date(job.finishedAt)) })}
        </p>
      )}
    </div>
  );
}

/**
 * Translate a stored ErrorCode (which is either an i18n key like
 * "api-error.crypto.exchange-unavailable" OR a free-form code like
 * "cancelled" / "no_credentials") into a human-readable string. Falls back
 * to the raw code when no translation is registered.
 */
function translateErrorCode(code: string | null, t: (key: string) => string): string {
  if (!code) return '';
  // i18n keys in this project are dot-separated.
  if (!code.includes('.')) return code;
  const translated = t(code);
  // useTranslate returns the key itself when no entry matches; treat that as
  // a missing translation and fall back to the raw code.
  return translated === code ? code : translated;
}

function EndpointRow({ eventType, progress }: { eventType: CryptoEventType; progress: EndpointProgress }) {
  const pct = progress.totalWindows > 0 ? Math.round((progress.completedWindows / progress.totalWindows) * 100) : 0;
  return (
    <div className="flex items-center justify-between text-foreground">
      <span className="font-mono">{eventType}</span>
      <span className="text-guard-muted">
        {progress.fetched} ev · {pct}%
      </span>
    </div>
  );
}
