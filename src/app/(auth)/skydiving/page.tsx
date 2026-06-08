'use client';

/**
 * BudgetGuard Skydiving Page
 * Main page with tabs: Summary, Jump Log, Tunnel Sessions
 */

import { useCallback, useMemo, useRef, useState } from 'react';
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

  const tabs: Array<{ id: TabId; label: string }> = useMemo(
    () => [
      { id: 'summary', label: t('skydiving.tabs.summary') },
      { id: 'jumps', label: t('skydiving.tabs.jumps') },
      { id: 'tunnel', label: t('skydiving.tabs.tunnel') },
    ],
    [t],
  );

  // Refs to move DOM focus when navigating tabs with arrow keys (ARIA Tabs pattern).
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const lastIndex = tabs.length - 1;
      let nextIndex: number | null = null;
      if (event.key === 'ArrowRight') nextIndex = index === lastIndex ? 0 : index + 1;
      else if (event.key === 'ArrowLeft') nextIndex = index === 0 ? lastIndex : index - 1;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = lastIndex;

      if (nextIndex !== null) {
        event.preventDefault();
        const nextTab = tabs[nextIndex];
        if (nextTab) {
          setActiveTab(nextTab.id);
          tabRefs.current[nextIndex]?.focus();
        }
      }
    },
    [tabs],
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('skydiving.title')}</h1>
        <p className="text-sm text-guard-muted mt-0.5">{t('skydiving.subtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border" role="tablist" aria-label={t('skydiving.title')}>
        {tabs.map((tab, index) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`skydiving-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`skydiving-panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                isActive
                  ? 'border-guard-primary text-guard-primary'
                  : 'border-transparent text-guard-muted hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

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
