'use client';

/**
 * BudgetGuard Alert Panel
 * Shared shell for the collapsible alert banners shown at the top of the dashboard
 * and the movements page (pending transactions, fiscal deadlines, recurring expenses).
 *
 * Owns the two cross-cutting behaviours so every alert stays consistent:
 * - collapse/expand (state lives in the caller, so each panel keeps its own key)
 * - dismiss, which hides the panel for the current session only (see useFinanceStore)
 */

import { ChevronDown, ChevronUp, type LucideIcon, X } from 'lucide-react';
import { type AnimationEvent, type ReactNode, useState } from 'react';
import { Tooltip } from '@/components/ui/Tooltip';
import { ALERT_TONE, type AlertPanelId, type AlertTone } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import { useDismissAlert, useIsAlertDismissed } from '@/stores/useFinanceStore';
import { cn } from '@/utils/helpers';

const TONE_STYLES: Record<AlertTone, { container: string; icon: string }> = {
  [ALERT_TONE.WARNING]: { container: 'bg-guard-warning/5 border-guard-warning/20', icon: 'text-guard-warning' },
  [ALERT_TONE.DANGER]: { container: 'bg-guard-danger/5 border-guard-danger/20', icon: 'text-guard-danger' },
};

interface AlertPanelProps {
  id: AlertPanelId;
  icon: LucideIcon;
  title: string;
  /** Optional chip rendered next to the title (e.g. a total amount) */
  badge?: ReactNode;
  tone?: AlertTone;
  isCollapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
}

export function AlertPanel({
  id,
  icon: Icon,
  title,
  badge,
  tone = ALERT_TONE.WARNING,
  isCollapsed,
  onToggle,
  children,
  className,
}: AlertPanelProps) {
  const { t } = useTranslate();
  const isDismissed = useIsAlertDismissed(id);
  const dismissAlert = useDismissAlert();
  const [isLeaving, setIsLeaving] = useState(false);

  // The panel unmounts only once the slide-up animation has finished. The guard
  // ignores animation events bubbling up from the collapsible content.
  const handleAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (isLeaving && event.target === event.currentTarget) dismissAlert(id);
  };

  if (isDismissed) return null;

  const toneStyle = TONE_STYLES[tone];

  return (
    // Wrapper animates the row height so the panels below slide up smoothly on dismiss
    <div className={cn(isLeaving && 'grid animate-alert-dismiss')} onAnimationEnd={handleAnimationEnd}>
      <div
        className={cn(
          'rounded-[var(--radius)] border transition-colors duration-200',
          isLeaving && 'overflow-hidden',
          toneStyle.container,
          className,
        )}
      >
        {/* Header: toggle + dismiss are siblings (a button cannot nest inside a button) */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={onToggle}
            className="flex-1 min-w-0 flex items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4 text-left"
            aria-expanded={!isCollapsed}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Icon className={cn('h-5 w-5 shrink-0', toneStyle.icon)} aria-hidden="true" />
              <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
              {badge}
            </div>
            {isCollapsed ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-guard-muted" />
            ) : (
              <ChevronUp className="h-4 w-4 shrink-0 text-guard-muted" />
            )}
          </button>

          <Tooltip content={t('common.alerts.dismiss-hint')} triggerClassName="shrink-0 mr-2 sm:mr-3">
            <button
              type="button"
              onClick={() => setIsLeaving(true)}
              className="p-1.5 rounded-md text-guard-muted hover:text-foreground hover:bg-muted transition-colors"
              aria-label={t('common.buttons.dismiss')}
            >
              <X className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>

        {/* Collapsible content */}
        <div
          className={cn('grid', isCollapsed ? 'animate-collapse-close' : 'animate-collapse-open')}
          style={{ gridTemplateRows: isCollapsed ? '0fr' : '1fr' }}
        >
          <div className="overflow-hidden">
            <div className="px-4 pb-3 sm:px-5 sm:pb-4 pl-12 sm:pl-14">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
