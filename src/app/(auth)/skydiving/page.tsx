'use client';

/**
 * BudgetGuard Skydiving Page
 * Main page with tabs: Summary, Jump Log, Tunnel Sessions
 */

import { useCallback, useState } from 'react';
import { ImportPanel } from '@/components/skydiving/ImportPanel';
import { JumpForm } from '@/components/skydiving/JumpForm';
import { JumpLogTable } from '@/components/skydiving/JumpLogTable';
import { SkydiveStatsCards } from '@/components/skydiving/SkydiveStatsCards';
import { TunnelSessionForm } from '@/components/skydiving/TunnelSessionForm';
import { TunnelSessionTable } from '@/components/skydiving/TunnelSessionTable';
import { TabBar, type TabBarItem } from '@/components/ui/TabBar';
import { useIdSelection } from '@/hooks/useIdSelection';
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

  // Row selection lives here so an import can preselect the rows it just created.
  const jumpSelection = useIdSelection();
  const tunnelSelection = useIdSelection();
  const { replace: selectJumps } = jumpSelection;
  const { replace: selectTunnelSessions } = tunnelSelection;

  // Preload stats for summary tab
  useSkydiveStats();

  // Next jump number = max existing + 1
  const nextJumpNumber = jumps && jumps.length > 0 ? Math.max(...jumps.map((j) => j.jumpNumber)) + 1 : 1;

  const handleImportJumps = useCallback(
    async (rows: Record<string, unknown>[]) => {
      const result = await importJumps.mutateAsync(rows);
      // New jumps often come from a voucher: leave them selected, ready to assign.
      if (result.insertedIds.length > 0) selectJumps(result.insertedIds);
      return { inserted: result.inserted, skipped: result.skipped };
    },
    [importJumps, selectJumps],
  );

  const handleImportTunnel = useCallback(
    async (rows: Record<string, unknown>[]) => {
      const result = await importTunnelSessions.mutateAsync(rows);
      if (result.insertedIds.length > 0) selectTunnelSessions(result.insertedIds);
      return { inserted: result.inserted, skipped: result.skipped };
    },
    [importTunnelSessions, selectTunnelSessions],
  );

  const tabs: TabBarItem<TabId>[] = [
    { id: 'summary', label: t('skydiving.tabs.summary') },
    { id: 'jumps', label: t('skydiving.tabs.jumps') },
    { id: 'tunnel', label: t('skydiving.tabs.tunnel') },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('skydiving.title')}</h1>
        <p className="text-sm text-guard-muted mt-0.5">{t('skydiving.subtitle')}</p>
      </div>

      {/* Tabs */}
      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        onChange={setActiveTab}
        ariaLabel={t('skydiving.title')}
        idPrefix="skydiving"
        className="mb-6"
      />

      {/* Tab Content */}
      {activeTab === 'summary' && (
        <div id="skydiving-panel-summary" role="tabpanel" aria-labelledby="skydiving-tab-summary" className="space-y-6">
          <SkydiveStatsCards />
        </div>
      )}

      {activeTab === 'jumps' && (
        <div id="skydiving-panel-jumps" role="tabpanel" aria-labelledby="skydiving-tab-jumps">
          <JumpLogTable
            onNewJump={() => setShowJumpForm(true)}
            onEditJump={(jump) => {
              setEditingJump(jump);
              setShowJumpForm(true);
            }}
            onImport={() => setImportType('jumps')}
            selection={jumpSelection}
          />
        </div>
      )}

      {activeTab === 'tunnel' && (
        <div id="skydiving-panel-tunnel" role="tabpanel" aria-labelledby="skydiving-tab-tunnel">
          <TunnelSessionTable
            onNewSession={() => setShowTunnelForm(true)}
            onEditSession={(session) => {
              setEditingTunnelSession(session);
              setShowTunnelForm(true);
            }}
            onImport={() => setImportType('tunnel')}
            selection={tunnelSelection}
          />
        </div>
      )}

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
        <ImportPanel onImport={handleImportJumps} onClose={() => setImportType(null)} parseRow={parseJumpRow} />
      )}
      {importType === 'tunnel' && (
        <ImportPanel onImport={handleImportTunnel} onClose={() => setImportType(null)} parseRow={parseTunnelRow} />
      )}
    </div>
  );
}
