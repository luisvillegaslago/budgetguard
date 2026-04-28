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

import { Bitcoin, Calculator, ListChecks } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { CryptoAeatGuide } from '@/components/crypto/CryptoAeatGuide';
import { CryptoCsvUploader } from '@/components/crypto/CryptoCsvUploader';
import { CryptoDisposalsTable } from '@/components/crypto/CryptoDisposalsTable';
import { CryptoEventsTable } from '@/components/crypto/CryptoEventsTable';
import { CryptoModelo100Section } from '@/components/crypto/CryptoModelo100Section';
import { CryptoSyncPanel } from '@/components/crypto/CryptoSyncPanel';
import { CRYPTO_EXCHANGE } from '@/constants/finance';
import { useCryptoCredentialStatus } from '@/hooks/useCryptoCredentials';
import { useTranslate } from '@/hooks/useTranslations';
import { cn } from '@/utils/helpers';

type TabId = 'summary' | 'events' | 'fiscal';

export default function CryptoPage() {
  const { t } = useTranslate();
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [fiscalYear, setFiscalYear] = useState<number>(new Date().getUTCFullYear() - 1);
  const status = useCryptoCredentialStatus(CRYPTO_EXCHANGE.BINANCE);

  const tabs: { id: TabId; label: string; icon: typeof Bitcoin }[] = [
    { id: 'summary', label: t('crypto.tabs.summary'), icon: Bitcoin },
    { id: 'events', label: t('crypto.tabs.events'), icon: ListChecks },
    { id: 'fiscal', label: t('crypto.tabs.fiscal'), icon: Calculator },
  ];

  if (status.isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="h-48 bg-muted/50 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!status.data?.connected) {
    return <NotConnectedState />;
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
          <CryptoSyncPanel />
          <CryptoCsvUploader />
        </div>
      )}
      {activeTab === 'events' && <CryptoEventsTable />}
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

function NotConnectedState() {
  const { t } = useTranslate();
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center space-y-4">
      <Bitcoin className="h-12 w-12 text-guard-muted mx-auto" aria-hidden="true" />
      <h1 className="text-2xl font-bold text-foreground">{t('crypto.empty.title')}</h1>
      <p className="text-sm text-guard-muted">{t('crypto.empty.body')}</p>
      <Link href="/settings?tab=crypto" className="btn-primary inline-flex items-center gap-2">
        {t('crypto.empty.cta')}
      </Link>
    </div>
  );
}
