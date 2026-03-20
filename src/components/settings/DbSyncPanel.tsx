'use client';

/**
 * Database Backup Panel
 * Compares primary and backup PostgreSQL databases and performs one-way backup.
 * Always copies from primary (DATABASE_URL) to backup (BACKUP_DATABASE_URL).
 * Shows diff by table with expandable row details.
 */

import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  HardDriveDownload,
  HardDriveUpload,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { QUERY_KEY } from '@/constants/finance';
import { useSyncCompare, useSyncExecute } from '@/hooks/useDbSync';
import { useTranslate } from '@/hooks/useTranslations';
import type { SyncProgressEvent, TableDiffSummary } from '@/types/sync';
import { cn } from '@/utils/helpers';

export function DbSyncPanel() {
  const { t } = useTranslate();
  const queryClient = useQueryClient();
  const { data: compareResult, refetch, isFetching: isComparing } = useSyncCompare();
  const {
    isExecuting: isSyncing,
    progress,
    result: lastResult,
    error: syncError,
    execute: executeSync,
    reset: resetSync,
  } = useSyncExecute();

  // Clear cached compare data on mount so the page always starts fresh
  useEffect(() => {
    queryClient.removeQueries({ queryKey: [QUERY_KEY.SYNC_COMPARE] });
  }, [queryClient]);

  const [includeDeletes, setIncludeDeletes] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  const handleCompare = () => {
    resetSync();
    refetch();
  };

  const handleExecute = async () => {
    setShowConfirm(false);
    await executeSync({ includeDeletes });
    refetch();
  };

  const toggleTable = (table: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(table)) {
        next.delete(table);
      } else {
        next.add(table);
      }
      return next;
    });
  };

  const hasDifferences = compareResult?.tables.some(
    (t) => t.onlyInPrimary.length > 0 || t.onlyInBackup.length > 0 || t.modified.length > 0,
  );

  return (
    <div className="card space-y-6">
      {/* Syncing progress — replaces header when active */}
      {isSyncing ? (
        <SyncProgress progress={progress} />
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-guard-primary/10 rounded-lg">
              <Database className="h-5 w-5 text-guard-primary" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t('settings.sync.title')}</h2>
              {compareResult && (
                <div className="flex items-center gap-4 text-xs text-guard-muted mt-1">
                  <span>
                    {t('settings.sync.primary-label')}: {compareResult.primaryUrl}
                  </span>
                  <span>
                    {t('settings.sync.backup-label')}: {compareResult.backupUrl}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Compare Button */}
          <button
            type="button"
            onClick={handleCompare}
            disabled={isComparing}
            className="btn-primary flex items-center gap-2"
          >
            {isComparing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            {isComparing ? t('settings.sync.comparing') : t('settings.sync.compare')}
          </button>
        </>
      )}

      {/* Diff Table */}
      {compareResult && !isSyncing && (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="text-left px-4 py-2 font-medium text-foreground">{t('settings.sync.table')}</th>
                <th className="text-right px-3 py-2 font-medium text-foreground">{t('settings.sync.primary-count')}</th>
                <th className="text-right px-3 py-2 font-medium text-foreground">{t('settings.sync.backup-count')}</th>
                <th className="text-right px-3 py-2 font-medium text-guard-success">
                  <HardDriveUpload className="h-3.5 w-3.5 inline" aria-hidden="true" />{' '}
                  {t('settings.sync.only-in-primary')}
                </th>
                <th className="text-right px-3 py-2 font-medium text-guard-primary">
                  <RefreshCw className="h-3.5 w-3.5 inline" aria-hidden="true" /> {t('settings.sync.modified')}
                </th>
                <th className="text-right px-3 py-2 font-medium text-guard-danger">
                  <HardDriveDownload className="h-3.5 w-3.5 inline" aria-hidden="true" />{' '}
                  {t('settings.sync.only-in-backup')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {compareResult.tables.map((tableDiff) => (
                <TableRow
                  key={tableDiff.table}
                  diff={tableDiff}
                  isExpanded={expandedTables.has(tableDiff.table)}
                  onToggle={() => toggleTable(tableDiff.table)}
                />
              ))}
            </tbody>
          </table>

          {!hasDifferences && (
            <div className="px-4 py-6 text-center text-guard-muted">
              <Check className="h-6 w-6 mx-auto mb-2 text-guard-success" aria-hidden="true" />
              {t('settings.sync.no-differences')}
            </div>
          )}
        </div>
      )}

      {/* Backup Controls */}
      {compareResult && hasDifferences && !isSyncing && (
        <div className="space-y-4 pt-2">
          {/* Direction info */}
          <div className="rounded-lg bg-muted/50 border border-border p-3">
            <p className="text-sm text-guard-muted">{t('settings.sync.backup-direction-hint')}</p>
          </div>

          {/* Include Deletes */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDeletes}
              onChange={(e) => setIncludeDeletes(e.target.checked)}
              className="rounded border-border text-guard-primary focus:ring-guard-primary"
            />
            <div>
              <span className="text-sm font-medium text-foreground">{t('settings.sync.include-deletes')}</span>
              <p className="text-xs text-guard-muted">{t('settings.sync.include-deletes-hint')}</p>
            </div>
          </label>

          {/* Execute Button */}
          <button type="button" onClick={() => setShowConfirm(true)} className="btn-primary flex items-center gap-2">
            <Database className="h-4 w-4" aria-hidden="true" />
            {t('settings.sync.execute')}
          </button>
        </div>
      )}

      {/* Success Result */}
      {lastResult && (
        <div className="rounded-lg border border-guard-success/30 bg-guard-success/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Check className="h-5 w-5 text-guard-success" aria-hidden="true" />
            <span className="text-sm font-medium text-guard-success">{t('settings.sync.success')}</span>
          </div>
          <div className="space-y-1">
            {lastResult.tables
              .filter((t) => t.inserted > 0 || t.updated > 0 || t.deleted > 0)
              .map((tableResult) => (
                <div key={tableResult.table} className="flex items-center gap-3 text-sm">
                  <span className="font-medium text-foreground w-48">{tableResult.table}</span>
                  {tableResult.inserted > 0 && (
                    <span className="text-guard-success">
                      {t('settings.sync.result-inserted', { count: tableResult.inserted })}
                    </span>
                  )}
                  {tableResult.updated > 0 && (
                    <span className="text-guard-primary">
                      {t('settings.sync.result-updated', { count: tableResult.updated })}
                    </span>
                  )}
                  {tableResult.deleted > 0 && (
                    <span className="text-guard-danger">
                      {t('settings.sync.result-deleted', { count: tableResult.deleted })}
                    </span>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Error */}
      {syncError && (
        <div className="rounded-lg border border-guard-danger/30 bg-guard-danger/5 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-guard-danger" aria-hidden="true" />
            <span className="text-sm text-guard-danger">
              {t('settings.sync.error')}: {syncError}
            </span>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirm && (
        <ConfirmModal
          includeDeletes={includeDeletes}
          onConfirm={handleExecute}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// Table Row (expandable)
// ============================================================

function TableRow({
  diff,
  isExpanded,
  onToggle,
}: {
  diff: TableDiffSummary;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslate();
  const hasChanges = diff.onlyInPrimary.length > 0 || diff.onlyInBackup.length > 0 || diff.modified.length > 0;

  return (
    <>
      <tr
        className={cn('transition-colors', hasChanges ? 'hover:bg-muted/50 cursor-pointer' : 'text-guard-muted')}
        onClick={hasChanges ? onToggle : undefined}
      >
        <td className="px-4 py-2.5 font-medium">
          <div className="flex items-center gap-2">
            {hasChanges ? (
              isExpanded ? (
                <ChevronDown className="h-4 w-4 text-guard-muted" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-4 w-4 text-guard-muted" aria-hidden="true" />
              )
            ) : (
              <span className="w-4" />
            )}
            {diff.table}
          </div>
        </td>
        <td className="text-right px-3 py-2.5 tabular-nums">{diff.primaryCount}</td>
        <td className="text-right px-3 py-2.5 tabular-nums">{diff.backupCount}</td>
        <td
          className={cn(
            'text-right px-3 py-2.5 tabular-nums',
            diff.onlyInPrimary.length > 0 && 'text-guard-success font-medium',
          )}
        >
          {diff.onlyInPrimary.length > 0 ? `+${diff.onlyInPrimary.length}` : '-'}
        </td>
        <td
          className={cn(
            'text-right px-3 py-2.5 tabular-nums',
            diff.modified.length > 0 && 'text-guard-primary font-medium',
          )}
        >
          {diff.modified.length > 0 ? diff.modified.length : '-'}
        </td>
        <td
          className={cn(
            'text-right px-3 py-2.5 tabular-nums',
            diff.onlyInBackup.length > 0 && 'text-guard-danger font-medium',
          )}
        >
          {diff.onlyInBackup.length > 0 ? diff.onlyInBackup.length : '-'}
        </td>
      </tr>
      {isExpanded && hasChanges && (
        <tr>
          <td colSpan={6} className="px-4 py-3 bg-muted/30">
            <div className="space-y-3 text-xs">
              {diff.onlyInPrimary.length > 0 && (
                <div>
                  <span className="font-medium text-guard-success">
                    {t('settings.sync.only-in-primary')} ({diff.onlyInPrimary.length})
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {diff.onlyInPrimary.slice(0, 20).map((row) => (
                      <span key={row.pk} className="px-2 py-0.5 rounded bg-guard-success/10 text-guard-success">
                        #{row.pk} {row.description}
                      </span>
                    ))}
                    {diff.onlyInPrimary.length > 20 && (
                      <span className="px-2 py-0.5 text-guard-muted">+{diff.onlyInPrimary.length - 20} more</span>
                    )}
                  </div>
                </div>
              )}
              {diff.onlyInBackup.length > 0 && (
                <div>
                  <span className="font-medium text-guard-danger">
                    {t('settings.sync.only-in-backup')} ({diff.onlyInBackup.length})
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {diff.onlyInBackup.slice(0, 20).map((row) => (
                      <span key={row.pk} className="px-2 py-0.5 rounded bg-guard-danger/10 text-guard-danger">
                        #{row.pk} {row.description}
                      </span>
                    ))}
                    {diff.onlyInBackup.length > 20 && (
                      <span className="px-2 py-0.5 text-guard-muted">+{diff.onlyInBackup.length - 20} more</span>
                    )}
                  </div>
                </div>
              )}
              {diff.modified.length > 0 && (
                <div>
                  <span className="font-medium text-guard-primary">
                    {t('settings.sync.modified')} ({diff.modified.length})
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {diff.modified.slice(0, 20).map((row) => (
                      <span key={row.pk} className="px-2 py-0.5 rounded bg-guard-primary/10 text-guard-primary">
                        #{row.pk} {row.description}
                      </span>
                    ))}
                    {diff.modified.length > 20 && (
                      <span className="px-2 py-0.5 text-guard-muted">+{diff.modified.length - 20} more</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ============================================================
// Sync Progress
// ============================================================

function SyncProgress({ progress }: { progress: SyncProgressEvent | null }) {
  const { t } = useTranslate();

  const phaseLabel =
    progress?.phase === 'setup'
      ? t('settings.sync.progress-setup')
      : progress?.phase === 'delete'
        ? t('settings.sync.progress-deleting')
        : t('settings.sync.progress-syncing');

  const percentage =
    progress?.tableIndex && progress?.tableCount ? Math.round((progress.tableIndex / progress.tableCount) * 100) : 0;

  return (
    <div className="border border-border rounded-lg p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-guard-primary shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-foreground">{phaseLabel}</span>
            {progress?.table && <span className="text-xs text-guard-muted tabular-nums">{percentage}%</span>}
          </div>
          {progress?.table && (
            <p className="text-xs text-guard-muted">
              {progress.table}
              {progress.inserted != null && ` — ${progress.inserted} inserted, ${progress.updated ?? 0} updated`}
              {progress.deleted != null && ` — ${progress.deleted} deleted`}
            </p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {progress?.tableCount && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-guard-primary transition-all duration-300 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// Confirmation Modal
// ============================================================

function ConfirmModal({
  includeDeletes,
  onConfirm,
  onCancel,
}: {
  includeDeletes: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslate();

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Modal backdrop dismissal
    // biome-ignore lint/a11y/noStaticElementInteractions: Modal backdrop
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onCancel}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Prevents backdrop click propagation */}
      <div
        className="bg-card rounded-xl border border-border shadow-lg max-w-md w-full mx-4 p-6 space-y-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-guard-primary/10 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-guard-primary" aria-hidden="true" />
          </div>
          <h3 id="sync-confirm-title" className="text-lg font-semibold text-foreground">
            {t('settings.sync.confirm-title')}
          </h3>
        </div>

        <p className="text-sm text-guard-muted">{t('settings.sync.confirm-backup')}</p>

        {includeDeletes && (
          <div className="rounded-lg bg-guard-danger/5 border border-guard-danger/20 p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-guard-danger shrink-0" aria-hidden="true" />
              <p className="text-xs text-guard-danger">{t('settings.sync.confirm-deletes-warning')}</p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onCancel} className="btn-secondary">
            {t('common.buttons.cancel')}
          </button>
          <button type="button" onClick={onConfirm} className="btn-primary">
            {t('common.buttons.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
