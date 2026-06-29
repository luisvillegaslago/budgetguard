'use client';

/**
 * /crypto — top-level crypto module page (Phase 2 scope: Sync + Movements).
 *
 * Tabs (Phase 2):
 *  - resumen     — sync panel + last-job summary
 *  - movimientos — paginated raw events table
 *
 * Phase 3-5 will add:
 *  - fiscal      — Modelo 100 casillas + AEAT guide
 *  - config      — quick link to Settings → Crypto
 */

import { Bitcoin, Calculator, ListChecks, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { CryptoAeatGuide } from '@/components/crypto/CryptoAeatGuide';
import { CryptoCsvUploader } from '@/components/crypto/CryptoCsvUploader';
import { CryptoDisposalsTable } from '@/components/crypto/CryptoDisposalsTable';
import { CryptoEventsTable } from '@/components/crypto/CryptoEventsTable';
import { CryptoModelo100Section } from '@/components/crypto/CryptoModelo100Section';
import { CryptoPriceChart } from '@/components/crypto/CryptoPriceChart';
import { CryptoSyncPanel } from '@/components/crypto/CryptoSyncPanel';
import { CRYPTO_EXCHANGE } from '@/constants/finance';
import { useCryptoCredentialStatus } from '@/hooks/useCryptoCredentials';
import { useTranslate } from '@/hooks/useTranslations';
import { cn } from '@/utils/helpers';

type TabId = 'summary' | 'events' | 'prices' | 'fiscal';

export default function CryptoPage() {
  const { t } = useTranslate();
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [fiscalYear, setFiscalYear] = useState<number>(new Date().getUTCFullYear() - 1);
  const status = useCryptoCredentialStatus(CRYPTO_EXCHANGE.BINANCE);
  // CSV import + price normalization use Binance's public endpoints, so the
  // whole page stays usable without API credentials — only the live API sync
  // panel is gated behind a connected exchange.
  const connected = status.data?.connected ?? false;

  const tabs: { id: TabId; label: string; icon: typeof Bitcoin }[] = [
    { id: 'summary', label: t('crypto.tabs.summary'), icon: Bitcoin },
    { id: 'events', label: t('crypto.tabs.events'), icon: ListChecks },
    { id: 'prices', label: t('crypto.tabs.prices'), icon: TrendingUp },
    { id: 'fiscal', label: t('crypto.tabs.fiscal'), icon: Calculator },
  ];

  if (status.isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="h-48 bg-muted/50 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <Bitcoin className="h-5 w-5 text-guard-primary" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-foreground">{t('crypto.title')}</h1>
        </div>
        <p className="text-sm text-guard-muted mt-1">{t('crypto.subtitle')}</p>
      </header>

      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
                activeTab === tab.id
                  ? 'border-guard-primary text-guard-primary'
                  : 'border-transparent text-guard-muted hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'summary' && (
        <div className="space-y-6">
          {connected ? <CryptoSyncPanel /> : <ApiSyncDisabledNotice />}
          <CryptoCsvUploader />
        </div>
      )}
      {activeTab === 'events' && <CryptoEventsTable />}
      {activeTab === 'prices' && <CryptoPriceChart />}
      {activeTab === 'fiscal' && (
        <div className="space-y-6">
          <CryptoModelo100Section year={fiscalYear} onYearChange={setFiscalYear} />
          <CryptoAeatGuide year={fiscalYear} />
          <CryptoDisposalsTable year={fiscalYear} />
        </div>
      )}
    </div>
  );
}

/**
 * Inline notice shown in place of the live API sync panel when no exchange
 * credentials are connected. CSV import below still works, so this only nudges
 * the user toward automatic sync rather than blocking the page.
 */
function ApiSyncDisabledNotice() {
  const { t } = useTranslate();
  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-3">
      <div className="flex items-center gap-2">
        <Bitcoin className="h-5 w-5 text-guard-muted" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-foreground">{t('crypto.not-connected.title')}</h2>
      </div>
      <p className="text-sm text-guard-muted">{t('crypto.not-connected.body')}</p>
      <Link href="/settings?tab=crypto" className="btn-primary inline-flex items-center gap-2">
        {t('crypto.empty.cta')}
      </Link>
    </div>
  );
}
