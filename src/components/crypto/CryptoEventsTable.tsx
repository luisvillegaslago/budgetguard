'use client';

/**
 * Paginated table of raw Binance events for the /crypto page.
 *
 * Phase 2: shows the raw payload preview only — no fiscal interpretation yet
 * (that lives in Phases 3-4). Filterable by event type.
 */

import { useState } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { CRYPTO_EVENT_TYPE, type CryptoEventType } from '@/constants/finance';
import { useCryptoEvents } from '@/hooks/useCryptoSync';
import { useTranslate } from '@/hooks/useTranslations';

const ALL_TYPES: CryptoEventType[] = Object.values(CRYPTO_EVENT_TYPE);

export function CryptoEventsTable() {
  const { t, locale } = useTranslate();
  const [typeFilter, setTypeFilter] = useState<CryptoEventType | ''>('');
  const [zeroBasedPage, setZeroBasedPage] = useState(0);

  const events = useCryptoEvents({
    type: typeFilter || undefined,
    page: zeroBasedPage + 1, // API is 1-based
  });

  const fmt = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC',
  });

  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-foreground">{t('crypto.events.title')}</h2>
        <Select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value as CryptoEventType | '');
            setZeroBasedPage(0);
          }}
          className="w-56"
        >
          <option value="">{t('crypto.events.filter-all')}</option>
          {ALL_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </Select>
      </div>

      {events.isLoading && <div className="h-32 bg-muted/50 rounded animate-pulse" />}

      {events.data && events.data.data.length === 0 && (
        <p className="text-sm text-guard-muted text-center py-8">{t('crypto.events.empty')}</p>
      )}

      {events.data && events.data.data.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase text-guard-muted">
                <tr>
                  <th className="py-2 pr-4">{t('crypto.events.col.date')}</th>
                  <th className="py-2 pr-4">{t('crypto.events.col.type')}</th>
                  <th className="py-2 pr-4">{t('crypto.events.col.external-id')}</th>
                  <th className="py-2 pr-4">{t('crypto.events.col.payload')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.data.data.map((event) => (
                  <tr key={event.eventId} className="hover:bg-muted/30">
                    <td className="py-2 pr-4 whitespace-nowrap font-mono text-xs">
                      {fmt.format(new Date(event.occurredAt))}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted">{event.eventType}</span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-guard-muted truncate max-w-xs">
                      {event.externalId}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-guard-muted truncate max-w-md">
                      {summarisePayload(event.rawPayload)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={zeroBasedPage}
            totalPages={events.data.meta.totalPages}
            totalItems={events.data.meta.total}
            pageSize={events.data.meta.pageSize}
            onPageChange={setZeroBasedPage}
          />
        </>
      )}
    </div>
  );
}

function summarisePayload(payload: Record<string, unknown>): string {
  const interesting = ['symbol', 'asset', 'amount', 'qty', 'rewards', 'amount', 'coin', 'fromAsset', 'toAsset'];
  const parts: string[] = [];
  interesting.forEach((key) => {
    if (payload[key] != null) parts.push(`${key}=${String(payload[key])}`);
  });
  return parts.length > 0 ? parts.join(' · ') : JSON.stringify(payload).slice(0, 80);
}
