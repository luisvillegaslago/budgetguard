'use client';

/**
 * Sortable table displaying skydive jump log with search and pagination
 */

import { Cloud, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { EmptyState } from '@/components/ui/EmptyState';
import { OverflowTooltip } from '@/components/ui/OverflowTooltip';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { SortableHeader } from '@/components/ui/SortableHeader';
import { useToast } from '@/components/ui/Toast';
import { Tooltip } from '@/components/ui/Tooltip';
import { SORT_DIRECTION } from '@/constants/finance';
import { useDeleteJump, useSkydiveJumps } from '@/hooks/useSkydiveJumps';
import { type SortableField, useSortableData } from '@/hooks/useSortableData';
import { useTranslate } from '@/hooks/useTranslations';
import type { SkydiveJump } from '@/types/skydive';
import { formatDate } from '@/utils/helpers';

const PAGE_SIZE = 20;

// Stable field definitions for sortable jump log columns.
const SORT_FIELDS: SortableField<SkydiveJump>[] = [
  { key: 'number', accessor: (jump) => jump.jumpNumber },
  { key: 'date', accessor: (jump) => jump.jumpDate },
  { key: 'type', accessor: (jump) => jump.jumpType ?? '' },
  { key: 'freefall-time', accessor: (jump) => jump.freefallTimeSec },
];

interface JumpLogTableProps {
  onNewJump: () => void;
  onEditJump: (jump: SkydiveJump) => void;
  onImport: () => void;
  filters?: { year?: number; dropzone?: string };
}

function formatFreefall(sec: number | null): string {
  if (sec === null) return '—';
  return `${sec}s`;
}

// Exit altitude is stored in feet (DB column ExitAltitudeFt); keep label/suffix consistent with the unit.
function formatAltitude(feet: number | null, locale: string): string {
  if (feet === null) return '—';
  return `${feet.toLocaleString(locale)} ft`;
}

const PLACEHOLDER_DATE = '1900-01-01';

function matchesSearch(jump: SkydiveJump, query: string): boolean {
  const q = query.toLowerCase();
  return (
    String(jump.jumpNumber).includes(q) ||
    (jump.dropzone?.toLowerCase().includes(q) ?? false) ||
    (jump.jumpType?.toLowerCase().includes(q) ?? false) ||
    (jump.aircraft?.toLowerCase().includes(q) ?? false) ||
    (jump.canopy?.toLowerCase().includes(q) ?? false) ||
    (jump.comment?.toLowerCase().includes(q) ?? false)
  );
}

export function JumpLogTable({ onNewJump, onEditJump, onImport, filters }: JumpLogTableProps) {
  const { t, locale } = useTranslate();
  const toast = useToast();
  const { data: jumps, isLoading, isError, refetch } = useSkydiveJumps(filters);
  const deleteJump = useDeleteJump();
  // Jump pending deletion confirmation (drives the ConfirmDialog).
  const [jumpToDelete, setJumpToDelete] = useState<SkydiveJump | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!jumps) return [];
    if (!search.trim()) return jumps;
    return jumps.filter((j) => matchesSearch(j, search.trim()));
  }, [jumps, search]);

  // Sort the full filtered dataset before paginating so ordering spans all pages.
  const { sorted, sort, toggleSort } = useSortableData<SkydiveJump>(filtered, SORT_FIELDS, {
    initial: { key: 'date', direction: SORT_DIRECTION.DESC },
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageItems = sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(0);
  };

  const handleConfirmDelete = async () => {
    if (!jumpToDelete) return;
    try {
      await deleteJump.mutateAsync(jumpToDelete.jumpId);
      toast.success(t('skydiving.jumps.delete.success'));
      setJumpToDelete(null);
    } catch {
      // useApiMutation exposes the translated message; surface it as a toast.
      toast.error(deleteJump.errorMessage ?? t('skydiving.jumps.form.errors.delete'));
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{t('skydiving.jumps.title')}</h3>
        <div className="flex items-center gap-2">
          <Tooltip content={t('skydiving.jumps.import')}>
            <button
              type="button"
              onClick={onImport}
              className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              aria-label={t('skydiving.jumps.import')}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
            </button>
          </Tooltip>
          <button
            type="button"
            onClick={onNewJump}
            className="btn-primary text-sm flex items-center gap-1.5 py-1.5 px-3"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t('skydiving.jumps.new')}
          </button>
        </div>
      </div>

      {/* Search */}
      {jumps && jumps.length > 0 && (
        <SearchInput
          value={search}
          onChange={handleSearchChange}
          placeholder={t('skydiving.jumps.search-placeholder')}
          className="px-4 py-2 border-b border-border"
        />
      )}

      {/* Data states: loading / error / empty / ready */}
      <DataState
        isLoading={isLoading}
        isError={isError}
        isEmpty={!jumps || jumps.length === 0}
        onRetry={() => refetch()}
        errorMessage={t('skydiving.jumps.errors.load')}
        loadingFallback={<div className="p-8 animate-pulse h-48 md:h-64" />}
        emptyState={
          <EmptyState
            icon={Cloud}
            title={t('skydiving.jumps.empty.title')}
            subtitle={t('skydiving.jumps.empty.subtitle')}
          />
        }
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-guard-muted">
            <p className="font-medium">{t('skydiving.jumps.search-empty')}</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-guard-muted uppercase tracking-wider border-b border-border">
                      <th className="px-4 py-2 font-semibold">
                        <SortableHeader
                          label={t('skydiving.jumps.columns.number')}
                          sortKey="number"
                          sort={sort}
                          onToggle={toggleSort}
                        />
                      </th>
                      <th className="px-4 py-2 font-semibold">
                        <SortableHeader
                          label={t('skydiving.jumps.columns.date')}
                          sortKey="date"
                          sort={sort}
                          onToggle={toggleSort}
                        />
                      </th>
                      <th className="px-4 py-2 font-semibold">{t('skydiving.jumps.columns.dropzone')}</th>
                      <th className="px-4 py-2 font-semibold">
                        <SortableHeader
                          label={t('skydiving.jumps.columns.type')}
                          sortKey="type"
                          sort={sort}
                          onToggle={toggleSort}
                        />
                      </th>
                      <th className="px-4 py-2 font-semibold">
                        <SortableHeader
                          label={t('skydiving.jumps.columns.freefall')}
                          sortKey="freefall-time"
                          sort={sort}
                          onToggle={toggleSort}
                          align="right"
                        />
                      </th>
                      <th className="px-4 py-2 font-semibold">{t('skydiving.jumps.columns.altitude')}</th>
                      <th className="px-4 py-2 font-semibold">{t('skydiving.jumps.columns.aircraft')}</th>
                      <th className="px-4 py-2 font-semibold w-20" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pageItems.map((jump) => (
                      <tr key={jump.jumpId} className="hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-2.5 font-mono font-semibold text-foreground">{jump.jumpNumber}</td>
                        <td className="px-4 py-2.5 text-foreground whitespace-nowrap">
                          {String(jump.jumpDate).startsWith(PLACEHOLDER_DATE) ? (
                            <span className="text-guard-muted italic">{t('skydiving.jumps.prior-jump')}</span>
                          ) : (
                            formatDate(jump.jumpDate, 'long')
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-foreground max-w-[12rem]">
                          <OverflowTooltip content={jump.dropzone ?? ''}>
                            <p className="truncate">{jump.dropzone ?? '—'}</p>
                          </OverflowTooltip>
                        </td>
                        <td className="px-4 py-2.5 text-guard-muted max-w-[10rem]">
                          <OverflowTooltip content={jump.jumpType ?? ''}>
                            <p className="truncate">{jump.jumpType ?? '—'}</p>
                          </OverflowTooltip>
                        </td>
                        <td className="px-4 py-2.5 text-guard-muted">{formatFreefall(jump.freefallTimeSec)}</td>
                        <td className="px-4 py-2.5 text-guard-muted whitespace-nowrap">
                          {formatAltitude(jump.exitAltitudeFt, locale)}
                        </td>
                        <td className="px-4 py-2.5 text-guard-muted max-w-[10rem]">
                          <OverflowTooltip content={jump.aircraft ?? ''}>
                            <p className="truncate">{jump.aircraft ?? '—'}</p>
                          </OverflowTooltip>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onEditJump(jump)}
                              className="p-1.5 text-guard-muted hover:text-foreground rounded transition-colors"
                              aria-label={t('category-management.actions.edit')}
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setJumpToDelete(jump)}
                              className="p-1.5 rounded transition-colors text-guard-muted hover:text-guard-danger"
                              aria-label={t('skydiving.jumps.delete.button')}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border">
              {pageItems.map((jump) => (
                <div key={jump.jumpId} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-foreground">#{jump.jumpNumber}</span>
                      <span className="text-sm text-guard-muted">
                        {String(jump.jumpDate).startsWith(PLACEHOLDER_DATE) ? (
                          <span className="italic">{t('skydiving.jumps.prior-jump')}</span>
                        ) : (
                          formatDate(jump.jumpDate, 'long')
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEditJump(jump)}
                        className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-guard-muted hover:text-foreground rounded-lg transition-colors"
                        aria-label={t('category-management.actions.edit')}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setJumpToDelete(jump)}
                        className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors text-guard-muted hover:text-guard-danger"
                        aria-label={t('skydiving.jumps.delete.button')}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    {jump.dropzone && (
                      <div className="min-w-0">
                        <span className="text-xs text-guard-muted">{t('skydiving.jumps.columns.dropzone')}</span>
                        <OverflowTooltip content={jump.dropzone}>
                          <p className="text-foreground truncate">{jump.dropzone}</p>
                        </OverflowTooltip>
                      </div>
                    )}
                    {jump.jumpType && (
                      <div className="min-w-0">
                        <span className="text-xs text-guard-muted">{t('skydiving.jumps.columns.type')}</span>
                        <OverflowTooltip content={jump.jumpType}>
                          <p className="text-guard-muted truncate">{jump.jumpType}</p>
                        </OverflowTooltip>
                      </div>
                    )}
                    <div>
                      <span className="text-xs text-guard-muted">{t('skydiving.jumps.columns.freefall')}</span>
                      <p className="text-guard-muted">{formatFreefall(jump.freefallTimeSec)}</p>
                    </div>
                    <div>
                      <span className="text-xs text-guard-muted">{t('skydiving.jumps.columns.altitude')}</span>
                      <p className="text-guard-muted">{formatAltitude(jump.exitAltitudeFt, locale)}</p>
                    </div>
                    {jump.aircraft && (
                      <div className="min-w-0">
                        <span className="text-xs text-guard-muted">{t('skydiving.jumps.columns.aircraft')}</span>
                        <OverflowTooltip content={jump.aircraft}>
                          <p className="text-guard-muted truncate">{jump.aircraft}</p>
                        </OverflowTooltip>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={sorted.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </DataState>

      {/* Destructive confirmation */}
      <ConfirmDialog
        open={jumpToDelete !== null}
        title={t('skydiving.jumps.delete.title')}
        message={t('skydiving.jumps.delete.confirm')}
        confirmLabel={t('skydiving.jumps.delete.button')}
        variant="danger"
        isLoading={deleteJump.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setJumpToDelete(null)}
      />
    </div>
  );
}
