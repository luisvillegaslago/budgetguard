'use client';

/**
 * Table displaying tunnel sessions with search and pagination
 */

import { Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Tooltip } from '@/components/ui/Tooltip';
import { useTranslate } from '@/hooks/useTranslations';
import { useDeleteTunnelSession, useTunnelSessions } from '@/hooks/useTunnelSessions';
import type { TunnelSession } from '@/types/skydive';
import { formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

const PAGE_SIZE = 20;

interface TunnelSessionTableProps {
  onNewSession: () => void;
  onEditSession: (session: TunnelSession) => void;
  onImport: () => void;
  filters?: { year?: number; location?: string };
}

function formatDuration(sec: number): string {
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  if (min === 0) return `${s}s`;
  return `${min}m ${s > 0 ? `${s}s` : ''}`.trim();
}

function matchesSearch(session: TunnelSession, query: string): boolean {
  const q = query.toLowerCase();
  return (
    (session.location?.toLowerCase().includes(q) ?? false) ||
    (session.sessionType?.toLowerCase().includes(q) ?? false) ||
    (session.notes?.toLowerCase().includes(q) ?? false)
  );
}

export function TunnelSessionTable({ onNewSession, onEditSession, onImport, filters }: TunnelSessionTableProps) {
  const { t } = useTranslate();
  const { data: sessions, isLoading } = useTunnelSessions(filters);
  const deleteSession = useDeleteTunnelSession();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!sessions) return [];
    if (!search.trim()) return sessions;
    return sessions.filter((s) => matchesSearch(s, search.trim()));
  }, [sessions, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(0);
  };

  const handleDelete = async (sessionId: number) => {
    if (deletingId === sessionId) {
      await deleteSession.mutateAsync(sessionId);
      setDeletingId(null);
    } else {
      setDeletingId(sessionId);
    }
  };

  if (isLoading) {
    return <div className="bg-card border border-border rounded-lg p-8 animate-pulse h-48 md:h-64" />;
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{t('skydiving.tunnel.title')}</h3>
        <div className="flex items-center gap-2">
          <Tooltip content={t('skydiving.tunnel.import')}>
            <button
              type="button"
              onClick={onImport}
              className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              aria-label={t('skydiving.tunnel.import')}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
            </button>
          </Tooltip>
          <button
            type="button"
            onClick={onNewSession}
            className="btn-primary text-sm flex items-center gap-1.5 py-1.5 px-3"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t('skydiving.tunnel.new')}
          </button>
        </div>
      </div>

      {/* Search */}
      {sessions && sessions.length > 0 && (
        <SearchInput
          value={search}
          onChange={handleSearchChange}
          placeholder={t('skydiving.tunnel.search-placeholder')}
          className="px-4 py-2 border-b border-border"
        />
      )}

      {/* Table */}
      {!sessions || sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-guard-muted">
          <p className="font-medium">{t('skydiving.tunnel.empty.title')}</p>
          <p className="text-sm mt-1">{t('skydiving.tunnel.empty.subtitle')}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-guard-muted">
          <p className="font-medium">{t('skydiving.tunnel.search-empty')}</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-guard-muted uppercase tracking-wider border-b border-border">
                    <th className="px-4 py-2 font-semibold">{t('skydiving.tunnel.columns.date')}</th>
                    <th className="px-4 py-2 font-semibold">{t('skydiving.tunnel.columns.location')}</th>
                    <th className="px-4 py-2 font-semibold">{t('skydiving.tunnel.columns.type')}</th>
                    <th className="px-4 py-2 font-semibold">{t('skydiving.tunnel.columns.duration')}</th>
                    <th className="px-4 py-2 font-semibold">{t('skydiving.tunnel.columns.price')}</th>
                    <th className="px-4 py-2 font-semibold w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageItems.map((session) => (
                    <tr key={session.sessionId} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-2.5 text-foreground">{formatDate(session.sessionDate, 'long')}</td>
                      <td className="px-4 py-2.5 text-foreground">{session.location ?? '—'}</td>
                      <td className="px-4 py-2.5 text-guard-muted">{session.sessionType ?? '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-foreground">{formatDuration(session.durationSec)}</td>
                      <td className="px-4 py-2.5 text-guard-danger">
                        {session.priceCents ? formatCurrency(session.priceCents) : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onEditSession(session)}
                            className="p-1.5 text-guard-muted hover:text-foreground rounded transition-colors"
                            aria-label={t('category-management.actions.edit')}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(session.sessionId)}
                            className={`p-1.5 rounded transition-colors ${
                              deletingId === session.sessionId
                                ? 'text-guard-danger bg-guard-danger/10'
                                : 'text-guard-muted hover:text-guard-danger'
                            }`}
                            aria-label={
                              deletingId === session.sessionId
                                ? t('skydiving.tunnel.delete.confirm')
                                : t('skydiving.tunnel.delete.button')
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
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-border">
            {pageItems.map((session) => (
              <div key={session.sessionId} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{formatDate(session.sessionDate, 'long')}</p>
                    <p className="text-xs text-guard-muted">{session.location ?? '—'}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onEditSession(session)}
                      className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-guard-muted hover:text-foreground rounded-lg transition-colors"
                      aria-label={t('category-management.actions.edit')}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(session.sessionId)}
                      className={`p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors ${
                        deletingId === session.sessionId
                          ? 'text-guard-danger bg-guard-danger/10'
                          : 'text-guard-muted hover:text-guard-danger'
                      }`}
                      aria-label={
                        deletingId === session.sessionId
                          ? t('skydiving.tunnel.delete.confirm')
                          : t('skydiving.tunnel.delete.button')
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  {session.sessionType && <span className="text-guard-muted">{session.sessionType}</span>}
                  <span className="font-mono text-foreground">{formatDuration(session.durationSec)}</span>
                  {session.priceCents ? (
                    <span className="text-guard-danger">{formatCurrency(session.priceCents)}</span>
                  ) : null}
                </div>
              </div>
            ))}
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
