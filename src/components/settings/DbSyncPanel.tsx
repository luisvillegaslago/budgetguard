'use client';

/**
 * Database Sync Panel
 * Compares local and remote PostgreSQL databases and allows bidirectional sync.
 * Shows diff by table with expandable row details.
 */

import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { useState } from 'react';
import type { SyncDirection } from '@/constants/finance';
import { SYNC_DIRECTION } from '@/constants/finance';
import { useSyncCompare, useSyncExecute } from '@/hooks/useDbSync';
import { useTranslate } from '@/hooks/useTranslations';
import type { SyncExecutionResult, TableDiffSummary } from '@/types/sync';
import { cn } from '@/utils/helpers';

export function DbSyncPanel() {
  const { t } = useTranslate();
  const { data: compareResult, refetch, isFetching: isComparing } = useSyncCompare();
  const syncMutation = useSyncExecute();

  const [direction, setDirection] = useState<SyncDirection>(SYNC_DIRECTION.PUSH);
  const [includeDeletes, setIncludeDeletes] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [lastResult, setLastResult] = useState<SyncExecutionResult | null>(null);

  const handleCompare = () => {
    setLastResult(null);
    refetch();
  };

  const handleExecute = () => {
    setShowConfirm(false);
    syncMutation.mutate(
      { direction, includeDeletes },
      {
        onSuccess: (result) => {
          setLastResult(result);
        },
      },
    );
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
    (t) => t.onlyInLocal.length > 0 || t.onlyInRemote.length > 0 || t.modified.length > 0,
  );

  return (
    <div className="card space-y-6">
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
                {t('settings.sync.local-label')}: {compareResult.localUrl}
              </span>
              <span>
                {t('settings.sync.remote-label')}: {compareResult.remoteUrl}
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

      {/* Diff Table */}
      {compareResult && (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="text-left px-4 py-2 font-medium text-foreground">{t('settings.sync.table')}</th>
                <th className="text-right px-3 py-2 font-medium text-foreground">{t('settings.sync.local-count')}</th>
                <th className="text-right px-3 py-2 font-medium text-foreground">{t('settings.sync.remote-count')}</th>
                <th className="text-right px-3 py-2 font-medium text-guard-success">
                  <Plus className="h-3.5 w-3.5 inline" aria-hidden="true" /> {t('settings.sync.new')}
                </th>
                <th className="text-right px-3 py-2 font-medium text-guard-primary">
                  <RefreshCw className="h-3.5 w-3.5 inline" aria-hidden="true" /> {t('settings.sync.modified')}
                </th>
                <th className="text-right px-3 py-2 font-medium text-guard-danger">
                  <Minus className="h-3.5 w-3.5 inline" aria-hidden="true" /> {t('settings.sync.deleted')}
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

      {/* Sync Controls */}
      {compareResult && hasDifferences && (
        <div className="space-y-4 pt-2">
          {/* Direction */}
          <div>
            <span className="block text-sm font-medium text-foreground mb-2">{t('settings.sync.direction')}</span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDirection(SYNC_DIRECTION.PUSH)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all',
                  direction === SYNC_DIRECTION.PUSH
                    ? 'border-guard-primary bg-guard-primary/10 text-guard-primary'
                    : 'border-border text-guard-muted hover:text-foreground hover:border-foreground/30',
                )}
              >
                <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />
                {t('settings.sync.push')}
              </button>
              <button
                type="button"
                onClick={() => setDirection(SYNC_DIRECTION.PULL)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all',
                  direction === SYNC_DIRECTION.PULL
                    ? 'border-guard-primary bg-guard-primary/10 text-guard-primary'
                    : 'border-border text-guard-muted hover:text-foreground hover:border-foreground/30',
                )}
              >
                <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
                {t('settings.sync.pull')}
              </button>
            </div>
          </div>

          {/* Include Deletes */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDeletes}
              onChange={(e) => setIncludeDeletes(e.target.checked)}
              className="mt-0.5 rounded border-border text-guard-primary focus:ring-guard-primary"
            />
            <div>
              <span className="text-sm font-medium text-foreground">{t('settings.sync.include-deletes')}</span>
              <p className="text-xs text-guard-muted">{t('settings.sync.include-deletes-hint')}</p>
            </div>
          </label>

          {/* Execute Button */}
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={syncMutation.isPending}
            className="btn-primary flex items-center gap-2"
          >
            {syncMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Database className="h-4 w-4" aria-hidden="true" />
            )}
            {syncMutation.isPending ? t('settings.sync.executing') : t('settings.sync.execute')}
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
      {syncMutation.isError && (
        <div className="rounded-lg border border-guard-danger/30 bg-guard-danger/5 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-guard-danger" aria-hidden="true" />
            <span className="text-sm text-guard-danger">
              {t('settings.sync.error')}: {syncMutation.error?.message}
            </span>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirm && (
        <ConfirmModal
          direction={direction}
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
  const hasChanges = diff.onlyInLocal.length > 0 || diff.onlyInRemote.length > 0 || diff.modified.length > 0;

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
        <td className="text-right px-3 py-2.5 tabular-nums">{diff.localCount}</td>
        <td className="text-right px-3 py-2.5 tabular-nums">{diff.remoteCount}</td>
        <td
          className={cn(
            'text-right px-3 py-2.5 tabular-nums',
            diff.onlyInLocal.length > 0 && 'text-guard-success font-medium',
          )}
        >
          {diff.onlyInLocal.length > 0 ? `+${diff.onlyInLocal.length}` : '-'}
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
            diff.onlyInRemote.length > 0 && 'text-guard-danger font-medium',
          )}
        >
          {diff.onlyInRemote.length > 0 ? diff.onlyInRemote.length : '-'}
        </td>
      </tr>
      {isExpanded && hasChanges && (
        <tr>
          <td colSpan={6} className="px-4 py-3 bg-muted/30">
            <div className="space-y-3 text-xs">
              {diff.onlyInLocal.length > 0 && (
                <div>
                  <span className="font-medium text-guard-success">
                    {t('settings.sync.only-in-local')} ({diff.onlyInLocal.length})
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {diff.onlyInLocal.slice(0, 20).map((row) => (
                      <span key={row.pk} className="px-2 py-0.5 rounded bg-guard-success/10 text-guard-success">
                        #{row.pk} {row.description}
                      </span>
                    ))}
                    {diff.onlyInLocal.length > 20 && (
                      <span className="px-2 py-0.5 text-guard-muted">+{diff.onlyInLocal.length - 20} more</span>
                    )}
                  </div>
                </div>
              )}
              {diff.onlyInRemote.length > 0 && (
                <div>
                  <span className="font-medium text-guard-danger">
                    {t('settings.sync.only-in-remote')} ({diff.onlyInRemote.length})
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {diff.onlyInRemote.slice(0, 20).map((row) => (
                      <span key={row.pk} className="px-2 py-0.5 rounded bg-guard-danger/10 text-guard-danger">
                        #{row.pk} {row.description}
                      </span>
                    ))}
                    {diff.onlyInRemote.length > 20 && (
                      <span className="px-2 py-0.5 text-guard-muted">+{diff.onlyInRemote.length - 20} more</span>
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
// Confirmation Modal
// ============================================================

function ConfirmModal({
  direction,
  includeDeletes,
  onConfirm,
  onCancel,
}: {
  direction: SyncDirection;
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

        <p className="text-sm text-guard-muted">
          {direction === SYNC_DIRECTION.PUSH ? t('settings.sync.confirm-push') : t('settings.sync.confirm-pull')}
        </p>

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
