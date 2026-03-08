'use client';

/**
 * Skydiving KPI stats cards
 * Displays aggregated skydiving statistics from SQL views,
 * split into Skydive and Tunnel sections.
 */

import type { LucideIcon } from 'lucide-react';
import { Cloud, MapPin, Timer, Wallet, Wind } from 'lucide-react';
import { useSkydiveStats } from '@/hooks/useSkydiveStats';
import { useTranslate } from '@/hooks/useTranslations';
import { formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

function formatDuration(totalSec: number): string {
  if (totalSec === 0) return '0s';
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

interface StatCard {
  label: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  color: string;
}

function StatsGrid({ title, cards }: { title: string; cards: StatCard[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-guard-muted uppercase tracking-wide mb-3">{title}</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-guard-muted">
              <card.icon className={`h-4 w-4 ${card.color}`} aria-hidden="true" />
              <span className="text-xs font-medium uppercase tracking-wide">{card.label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{card.value}</p>
            {card.subtitle && <p className="text-xs text-guard-muted">{card.subtitle}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkydiveStatsCards() {
  const { t } = useTranslate();
  const { data: stats, isLoading } = useSkydiveStats();

  if (isLoading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 2 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
          <div key={i}>
            <div className="h-4 w-32 bg-muted rounded animate-pulse mb-3" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 3 }).map((__, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
                <div key={j} className="bg-card border border-border rounded-lg p-4 animate-pulse h-24" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const skydiveCards: StatCard[] = [
    {
      label: t('skydiving.stats.total-jumps'),
      value: String(stats.totalJumps),
      icon: Cloud,
      color: 'text-guard-primary',
    },
    {
      label: t('skydiving.stats.freefall-time'),
      value: formatDuration(stats.totalFreefallSec),
      icon: Timer,
      color: 'text-guard-success',
    },
    {
      label: t('skydiving.stats.dropzones'),
      value: String(stats.uniqueDropzones),
      subtitle: stats.lastJumpDate ? formatDate(stats.lastJumpDate, 'long') : undefined,
      icon: MapPin,
      color: 'text-amber-500',
    },
  ];

  const tunnelCards: StatCard[] = [
    {
      label: t('skydiving.stats.tunnel-time'),
      value: formatDuration(stats.totalTunnelSec),
      icon: Wind,
      color: 'text-cyan-500',
    },
    {
      label: t('skydiving.stats.tunnel-sessions'),
      value: String(stats.totalTunnelSessions),
      icon: Wind,
      color: 'text-cyan-400',
    },
    {
      label: t('skydiving.stats.total-cost'),
      value: formatCurrency(stats.totalCostCents),
      icon: Wallet,
      color: 'text-guard-danger',
    },
  ];

  return (
    <div className="space-y-6">
      <StatsGrid title={t('skydiving.stats.section-skydive')} cards={skydiveCards} />
      <StatsGrid title={t('skydiving.stats.section-tunnel')} cards={tunnelCards} />
    </div>
  );
}
