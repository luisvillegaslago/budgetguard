'use client';

/**
 * Sortable table displaying skydive jump log with search and pagination
 */

import { Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { useDeleteJump, useSkydiveJumps } from '@/hooks/useSkydiveJumps';
import { useTranslate } from '@/hooks/useTranslations';
import type { SkydiveJump } from '@/types/skydive';
import { formatDate } from '@/utils/helpers';

const PAGE_SIZE = 20;

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

function formatAltitude(meters: number | null): string {
  if (meters === null) return '—';
  return `${meters.toLocaleString()} m`;
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
  const { t } = useTranslate();
  const { data: jumps, isLoading } = useSkydiveJumps(filters);
  const deleteJump = useDeleteJump();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!jumps) return [];
    if (!search.trim()) return jumps;
    return jumps.filter((j) => matchesSearch(j, search.trim()));
  }, [jumps, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(0);
  };

  const handleDelete = async (jumpId: number) => {
    if (deletingId === jumpId) {
      await deleteJump.mutateAsync(jumpId);
      setDeletingId(null);
    } else {
      setDeletingId(jumpId);
    }
  };

  if (isLoading) {
    return <div className="bg-card border border-border rounded-lg p-8 animate-pulse h-64" />;
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{t('skydiving.jumps.title')}</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onImport}
            className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            aria-label={t('skydiving.jumps.import')}
            title={t('skydiving.jumps.import')}
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
          </button>
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
        <div className="px-4 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-guard-muted" aria-hidden="true" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={t('skydiving.jumps.search-placeholder')}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground placeholder:text-guard-muted focus:ring-2 focus:ring-guard-primary focus:border-transparent transition-colors"
            />
          </div>
        </div>
      )}

      {/* Table */}
      {!jumps || jumps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-guard-muted">
          <p className="font-medium">{t('skydiving.jumps.empty.title')}</p>
          <p className="text-sm mt-1">{t('skydiving.jumps.empty.subtitle')}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-guard-muted">
          <p className="font-medium">{t('skydiving.jumps.search-empty')}</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-guard-muted uppercase tracking-wide border-b border-border">
                  <th className="px-4 py-2 font-medium">{t('skydiving.jumps.columns.number')}</th>
                  <th className="px-4 py-2 font-medium">{t('skydiving.jumps.columns.date')}</th>
                  <th className="px-4 py-2 font-medium">{t('skydiving.jumps.columns.dropzone')}</th>
                  <th className="px-4 py-2 font-medium">{t('skydiving.jumps.columns.type')}</th>
                  <th className="px-4 py-2 font-medium">{t('skydiving.jumps.columns.freefall')}</th>
                  <th className="px-4 py-2 font-medium">{t('skydiving.jumps.columns.altitude')}</th>
                  <th className="px-4 py-2 font-medium">{t('skydiving.jumps.columns.aircraft')}</th>
                  <th className="px-4 py-2 font-medium w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageItems.map((jump) => (
                  <tr key={jump.jumpId} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-2.5 font-mono font-semibold text-foreground">{jump.jumpNumber}</td>
                    <td className="px-4 py-2.5 text-foreground">
                      {String(jump.jumpDate).startsWith(PLACEHOLDER_DATE) ? (
                        <span className="text-guard-muted italic">{t('skydiving.jumps.prior-jump')}</span>
                      ) : (
                        formatDate(jump.jumpDate, 'long')
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-foreground">{jump.dropzone ?? '—'}</td>
                    <td className="px-4 py-2.5 text-guard-muted">{jump.jumpType ?? '—'}</td>
                    <td className="px-4 py-2.5 text-guard-muted">{formatFreefall(jump.freefallTimeSec)}</td>
                    <td className="px-4 py-2.5 text-guard-muted">{formatAltitude(jump.exitAltitudeFt)}</td>
                    <td className="px-4 py-2.5 text-guard-muted">{jump.aircraft ?? '—'}</td>
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
                          onClick={() => handleDelete(jump.jumpId)}
                          className={`p-1.5 rounded transition-colors ${
                            deletingId === jump.jumpId
                              ? 'text-guard-danger bg-guard-danger/10'
                              : 'text-guard-muted hover:text-guard-danger'
                          }`}
                          aria-label={
                            deletingId === jump.jumpId
                              ? t('skydiving.jumps.delete.confirm')
                              : t('skydiving.jumps.delete.button')
                          }
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

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filtered.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
