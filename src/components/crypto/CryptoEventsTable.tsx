'use client';

/**
 * Paginated table of Binance movements for the /crypto page.
 *
 * Each raw event is run through `presentCryptoEvent` so the user sees a
 * human-readable concept (Buy / Reward / Convert…) and signed, colour-coded
 * amounts — closer to Binance's own history — instead of the raw event type
 * and JSON payload. The original technical data (external ID + full payload)
 * stays available behind an expandable row for debugging/reconciliation.
 */

import { useState } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { StringSuggestionCombobox } from '@/components/ui/StringSuggestionCombobox';
import { CRYPTO_EVENT_TYPE, type CryptoEventType } from '@/constants/finance';
import { useCryptoAssets, useCryptoEvents } from '@/hooks/useCryptoSync';
import { useTranslate } from '@/hooks/useTranslations';
import { AMOUNT_DIRECTION, type AmountLeg, formatCryptoAmount, presentCryptoEvent } from '@/utils/cryptoEventPresenter';

const ALL_TYPES: CryptoEventType[] = Object.values(CRYPTO_EVENT_TYPE);

export function CryptoEventsTable() {
  const { t, locale } = useTranslate();
  const [typeFilter, setTypeFilter] = useState<CryptoEventType | ''>('');
  const [assetFilter, setAssetFilter] = useState<string | null>(null);
  const [zeroBasedPage, setZeroBasedPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const assets = useCryptoAssets();
  const events = useCryptoEvents({
    type: typeFilter || undefined,
    asset: assetFilter || undefined,
    page: zeroBasedPage + 1, // API is 1-based
  });

  const fmt = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC',
  });

  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-foreground">{t('crypto.events.title')}</h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-48">
            <StringSuggestionCombobox
              value={assetFilter}
              onChange={(value) => {
                setAssetFilter(value);
                setZeroBasedPage(0);
              }}
              suggestions={assets.data ?? []}
              allowCreate={false}
              placeholder={t('crypto.events.filter-asset-all')}
              searchPlaceholder={t('crypto.events.filter-asset-search')}
            />
          </div>
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
                {t(`crypto.events.type.${type}`)}
              </option>
            ))}
          </Select>
        </div>
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
                  <th className="py-2 pr-4 font-medium">{t('crypto.events.col.date')}</th>
                  <th className="py-2 pr-4 font-medium">{t('crypto.events.col.concept')}</th>
                  <th className="py-2 pr-4 font-medium text-right">{t('crypto.events.col.amount')}</th>
                  <th className="py-2 w-8" aria-hidden />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.data.data.map((event) => {
                  const presentation = presentCryptoEvent(event.eventType, event.rawPayload);
                  const isExpanded = expandedId === event.eventId;
                  const subParts: string[] = [];
                  if (presentation.avgPrice) {
                    subParts.push(
                      t('crypto.events.avg-price', {
                        price: `${formatCryptoAmount(presentation.avgPrice.amount, locale)} ${presentation.avgPrice.asset}`,
                      }),
                    );
                  }
                  if (presentation.fills) {
                    subParts.push(t('crypto.events.fills', { count: presentation.fills }));
                  }
                  return (
                    <FragmentRow
                      key={event.eventId}
                      date={fmt.format(new Date(event.occurredAt))}
                      concept={t(presentation.conceptKey)}
                      pair={presentation.pair}
                      note={presentation.note}
                      detail={subParts.length > 0 ? subParts.join(' · ') : undefined}
                      legs={presentation.legs}
                      locale={locale}
                      isExpanded={isExpanded}
                      onToggle={() => setExpandedId(isExpanded ? null : event.eventId)}
                      externalId={event.externalId}
                      rawType={event.eventType}
                      rawPayload={event.rawPayload}
                      labels={{
                        externalId: t('crypto.events.col.external-id'),
                        rawType: t('crypto.events.col.type'),
                        payload: t('crypto.events.col.payload'),
                      }}
                    />
                  );
                })}
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

interface FragmentRowProps {
  date: string;
  concept: string;
  pair?: string;
  note?: string;
  detail?: string;
  legs: AmountLeg[];
  locale: string;
  isExpanded: boolean;
  onToggle: () => void;
  externalId: string;
  rawType: string;
  rawPayload: Record<string, unknown>;
  labels: { externalId: string; rawType: string; payload: string };
}

function FragmentRow({
  date,
  concept,
  pair,
  note,
  detail,
  legs,
  locale,
  isExpanded,
  onToggle,
  externalId,
  rawType,
  rawPayload,
  labels,
}: FragmentRowProps) {
  return (
    <>
      <tr className="hover:bg-muted/30 cursor-pointer" onClick={onToggle}>
        <td className="py-3 pr-4 whitespace-nowrap text-xs text-guard-muted align-top">{date}</td>
        <td className="py-3 pr-4 align-top">
          <div className="font-medium text-foreground">{concept}</div>
          {pair && <div className="text-xs text-guard-muted font-mono">{pair}</div>}
          {detail && <div className="text-xs text-guard-muted">{detail}</div>}
          {note && <div className="text-xs text-guard-muted">{note}</div>}
        </td>
        <td className="py-3 pr-4 align-top">
          <div className="flex flex-col items-end gap-0.5 font-mono text-xs">
            {legs.length === 0 ? (
              <span className="text-guard-muted">—</span>
            ) : (
              legs.map((amountLeg) => (
                <AmountLegCell key={`${amountLeg.direction}-${amountLeg.asset}`} leg={amountLeg} locale={locale} />
              ))
            )}
          </div>
        </td>
        <td className="py-3 text-guard-muted align-top">
          <span className={`inline-block transition-transform ${isExpanded ? 'rotate-90' : ''}`}>›</span>
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-muted/20">
          <td colSpan={4} className="px-4 py-3">
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-xs">
              <dt className="text-guard-muted">{labels.rawType}</dt>
              <dd className="font-mono">{rawType}</dd>
              <dt className="text-guard-muted">{labels.externalId}</dt>
              <dd className="font-mono break-all">{externalId}</dd>
              <dt className="text-guard-muted">{labels.payload}</dt>
              <dd>
                <pre className="font-mono text-[11px] whitespace-pre-wrap break-all text-guard-muted">
                  {JSON.stringify(rawPayload, null, 2)}
                </pre>
              </dd>
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}

function AmountLegCell({ leg, locale }: { leg: AmountLeg; locale: string }) {
  const sign = leg.direction === AMOUNT_DIRECTION.IN ? '+' : leg.direction === AMOUNT_DIRECTION.OUT ? '−' : '';
  const colour =
    leg.direction === AMOUNT_DIRECTION.IN
      ? 'text-guard-success'
      : leg.direction === AMOUNT_DIRECTION.OUT
        ? 'text-guard-danger'
        : 'text-foreground';
  return (
    <span className={colour}>
      {sign}
      {formatCryptoAmount(leg.amount, locale)} {leg.asset}
    </span>
  );
}
