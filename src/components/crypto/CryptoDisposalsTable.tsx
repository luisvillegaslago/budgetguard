'use client';

/**
 * Audit table of FIFO disposals: one row per `disposal` taxable event,
 * with the cost basis breakdown (AcquisitionLotsJson) hidden behind a
 * disclosure for verification when needed.
 */

import { ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { CRYPTO_CONTRAPRESTACION, type CryptoContraprestacion } from '@/constants/finance';
import { useCryptoDisposals } from '@/hooks/useCryptoFiscal';
import { useTranslate } from '@/hooks/useTranslations';
import { formatCurrency } from '@/utils/money';

export function CryptoDisposalsTable({ year }: { year: number }) {
  const { t, locale } = useTranslate();
  const [contraprestacion, setContraprestacion] = useState<CryptoContraprestacion | ''>('');
  const [zeroBasedPage, setZeroBasedPage] = useState(0);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const disposals = useCryptoDisposals({
    year,
    contraprestacion: contraprestacion || undefined,
    page: zeroBasedPage + 1,
  });

  const fmt = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', {
    dateStyle: 'short',
    timeZone: 'UTC',
  });

  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground">{t('crypto.fiscal.disposals-title')}</h3>
        <Select
          value={contraprestacion}
          onChange={(e) => {
            setContraprestacion(e.target.value as CryptoContraprestacion | '');
            setZeroBasedPage(0);
          }}
          className="w-44 text-sm"
        >
          <option value="">{t('crypto.fiscal.contraprestacion-all')}</option>
          <option value={CRYPTO_CONTRAPRESTACION.FIAT}>{t('crypto.fiscal.contraprestacion-f')}</option>
          <option value={CRYPTO_CONTRAPRESTACION.NON_FIAT}>{t('crypto.fiscal.contraprestacion-n')}</option>
        </Select>
      </div>

      {disposals.isLoading && <div className="h-32 bg-muted/50 rounded animate-pulse" />}

      {disposals.data && disposals.data.data.length === 0 && (
        <p className="text-sm text-guard-muted text-center py-8">{t('crypto.fiscal.no-disposals')}</p>
      )}

      {disposals.data && disposals.data.data.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase text-guard-muted">
                <tr>
                  <th className="py-2 pr-3" />
                  <th className="py-2 pr-3">{t('crypto.fiscal.col.date')}</th>
                  <th className="py-2 pr-3">{t('crypto.fiscal.col.asset')}</th>
                  <th className="py-2 pr-3">{t('crypto.fiscal.col.contraprestacion')}</th>
                  <th className="py-2 pr-3 text-right">{t('crypto.fiscal.col.transmission')}</th>
                  <th className="py-2 pr-3 text-right">{t('crypto.fiscal.col.acquisition')}</th>
                  <th className="py-2 pr-3 text-right">{t('crypto.fiscal.col.gain-loss')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {disposals.data.data.map((d) => {
                  const isExpanded = expandedRow === d.disposalId;
                  const isGain = d.gainLossCents >= 0;
                  return (
                    <Fragment key={d.disposalId}>
                      <tr className="hover:bg-muted/30">
                        <td className="py-2 pr-3">
                          <button
                            type="button"
                            onClick={() => setExpandedRow(isExpanded ? null : d.disposalId)}
                            className="text-guard-muted hover:text-foreground"
                            aria-label={isExpanded ? t('crypto.fiscal.lots-collapse') : t('crypto.fiscal.lots-expand')}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="h-4 w-4" aria-hidden="true" />
                            )}
                          </button>
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap font-mono text-xs">
                          {fmt.format(new Date(d.occurredAt))}
                        </td>
                        <td className="py-2 pr-3">
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted">{d.asset}</span>
                        </td>
                        <td className="py-2 pr-3">
                          <span className="font-mono text-xs">{d.contraprestacion}</span>
                        </td>
                        <td className="py-2 pr-3 text-right font-mono">{formatCurrency(d.transmissionValueCents)}</td>
                        <td className="py-2 pr-3 text-right font-mono">{formatCurrency(d.acquisitionValueCents)}</td>
                        <td
                          className={`py-2 pr-3 text-right font-mono ${isGain ? 'text-guard-success' : 'text-guard-danger'}`}
                        >
                          {formatCurrency(d.gainLossCents)}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-muted/20">
                          <td />
                          <td colSpan={6} className="py-3 pr-3">
                            <p className="text-xs text-guard-muted mb-2">
                              {t('crypto.fiscal.lots-title', { count: d.acquisitionLots.length })}
                            </p>
                            <ul className="space-y-1 text-xs font-mono">
                              {d.acquisitionLots.map((lot, idx) => (
                                <li key={`${lot.sourceEventId}-${idx}`} className="flex justify-between gap-3">
                                  <span className="text-guard-muted">
                                    {fmt.format(new Date(lot.sourceDate))} · {lot.quantityConsumed}
                                  </span>
                                  <span className="text-foreground">{formatCurrency(lot.acquisitionValueCents)}</span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={zeroBasedPage}
            totalPages={disposals.data.meta.totalPages}
            totalItems={disposals.data.meta.total}
            pageSize={disposals.data.meta.pageSize}
            onPageChange={setZeroBasedPage}
          />
        </>
      )}
    </div>
  );
}
