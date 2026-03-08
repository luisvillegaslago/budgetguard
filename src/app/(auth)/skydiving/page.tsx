'use client';

/**
 * BudgetGuard Skydiving Page
 * Main page with tabs: Summary, Jump Log, Tunnel Sessions
 */

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { ImportPanel } from '@/components/skydiving/ImportPanel';
import { JumpForm } from '@/components/skydiving/JumpForm';
import { JumpLogTable } from '@/components/skydiving/JumpLogTable';
import { SkydiveStatsCards } from '@/components/skydiving/SkydiveStatsCards';
import { TunnelSessionForm } from '@/components/skydiving/TunnelSessionForm';
import { TunnelSessionTable } from '@/components/skydiving/TunnelSessionTable';
import { useImportJumps, useSkydiveJumps } from '@/hooks/useSkydiveJumps';
import { useSkydiveStats } from '@/hooks/useSkydiveStats';
import { useTranslate } from '@/hooks/useTranslations';
import { useImportTunnelSessions } from '@/hooks/useTunnelSessions';
import type { SkydiveJump, TunnelSession } from '@/types/skydive';
import { parseJumpRow, parseTunnelRow } from '@/utils/skydiveParsers';

type TabId = 'summary' | 'jumps' | 'tunnel';

export default function SkydivingPage() {
  const { t } = useTranslate();
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [showJumpForm, setShowJumpForm] = useState(false);
  const [editingJump, setEditingJump] = useState<SkydiveJump | null>(null);
  const [showTunnelForm, setShowTunnelForm] = useState(false);
  const [editingTunnelSession, setEditingTunnelSession] = useState<TunnelSession | null>(null);
  const [importType, setImportType] = useState<'jumps' | 'tunnel' | null>(null);

  const importJumps = useImportJumps();
  const importTunnelSessions = useImportTunnelSessions();
  const { data: jumps } = useSkydiveJumps();

  // Preload stats for summary tab
  useSkydiveStats();

  // Next jump number = max existing + 1
  const nextJumpNumber = jumps && jumps.length > 0 ? Math.max(...jumps.map((j) => j.jumpNumber)) + 1 : 1;

  const handleImportJumps = useCallback(
    async (rows: Record<string, unknown>[]) => {
      const result = await importJumps.mutateAsync(rows);
      return { inserted: result.inserted, skipped: result.skipped };
    },
    [importJumps],
  );

  const handleImportTunnel = useCallback(
    async (rows: Record<string, unknown>[]) => {
      const result = await importTunnelSessions.mutateAsync(rows);
      return { inserted: result.inserted, skipped: result.skipped };
    },
    [importTunnelSessions],
  );

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'summary', label: t('skydiving.tabs.summary') },
    { id: 'jumps', label: t('skydiving.tabs.jumps') },
    { id: 'tunnel', label: t('skydiving.tabs.tunnel') },
  ];

  return (
    <div className="min-h-screen bg-guard-light dark:bg-guard-dark">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/dashboard"
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            aria-label={t('skydiving.back')}
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('skydiving.title')}</h1>
            <p className="text-sm text-guard-muted mt-0.5">{t('skydiving.subtitle')}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-guard-primary text-guard-primary'
                  : 'border-transparent text-guard-muted hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'summary' && (
          <div className="space-y-6">
            <SkydiveStatsCards />
          </div>
        )}

        {activeTab === 'jumps' && (
          <JumpLogTable
            onNewJump={() => setShowJumpForm(true)}
            onEditJump={(jump) => {
              setEditingJump(jump);
              setShowJumpForm(true);
            }}
            onImport={() => setImportType('jumps')}
          />
        )}

        {activeTab === 'tunnel' && (
          <TunnelSessionTable
            onNewSession={() => setShowTunnelForm(true)}
            onEditSession={(session) => {
              setEditingTunnelSession(session);
              setShowTunnelForm(true);
            }}
            onImport={() => setImportType('tunnel')}
          />
        )}
      </div>

      {/* Jump Form Modal */}
      {showJumpForm && (
        <JumpForm
          jump={editingJump}
          nextJumpNumber={nextJumpNumber}
          onClose={() => {
            setShowJumpForm(false);
            setEditingJump(null);
          }}
        />
      )}

      {/* Tunnel Session Form Modal */}
      {showTunnelForm && (
        <TunnelSessionForm
          session={editingTunnelSession}
          onClose={() => {
            setShowTunnelForm(false);
            setEditingTunnelSession(null);
          }}
        />
      )}

      {/* Import Panel */}
      {importType === 'jumps' && (
        <ImportPanel
          type="jumps"
          onImport={handleImportJumps}
          onClose={() => setImportType(null)}
          parseRow={parseJumpRow}
        />
      )}
      {importType === 'tunnel' && (
        <ImportPanel
          type="tunnel"
          onImport={handleImportTunnel}
          onClose={() => setImportType(null)}
          parseRow={parseTunnelRow}
        />
      )}
    </div>
  );
}
