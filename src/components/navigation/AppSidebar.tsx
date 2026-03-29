'use client';

/**
 * App Sidebar
 * Collapsible sidebar navigation for desktop, overlay for mobile.
 * Desktop: collapsed (icons only, 64px) by default, expanded (224px) when open.
 * Mobile: hidden by default, slides in as overlay when open.
 */

import { X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tooltip } from '@/components/ui/Tooltip';
import { useUpcomingDeadlines } from '@/hooks/useFiscalDeadlines';
import { useTranslate } from '@/hooks/useTranslations';
import { useSidebarExpanded, useSidebarOpen, useToggleSidebar } from '@/stores/useFinanceStore';
import { cn } from '@/utils/helpers';
import { NAV_GROUPS, type NavGroup, type NavItem, SETTINGS_NAV } from './navConfig';

function SidebarBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-auto bg-guard-danger text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
      {count}
    </span>
  );
}

function useBadgeCount(badgeQueryKey?: string): number {
  const { data: deadlines } = useUpcomingDeadlines();
  if (badgeQueryKey === 'fiscal-deadlines' && deadlines) return deadlines.length;
  return 0;
}

function SidebarNavItem({ item }: { item: NavItem }) {
  const { t } = useTranslate();
  const pathname = usePathname();
  const isExpanded = useSidebarExpanded();
  const toggleSidebar = useToggleSidebar();
  const isActive = pathname === item.path || (item.path !== '/dashboard' && pathname.startsWith(item.path));
  const Icon = item.icon;
  const label = t(item.i18nKey);
  const badgeCount = useBadgeCount(item.badgeQueryKey);

  const link = (
    <Link
      href={item.path}
      onClick={() => {
        // Close sidebar on mobile after navigation
        if (window.innerWidth < 1024) toggleSidebar();
      }}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors relative',
        isActive ? 'bg-guard-primary/10 text-guard-primary' : 'text-guard-muted hover:text-foreground hover:bg-muted',
        // Collapsed state on desktop: center icon, hide text via CSS
        !isExpanded && 'lg:justify-center lg:w-10 lg:h-10 lg:p-0 lg:mx-auto',
      )}
    >
      <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
      <span className={cn('truncate', !isExpanded && 'lg:hidden')}>{label}</span>
      {isExpanded && <SidebarBadge count={badgeCount} />}
      {!isExpanded && badgeCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 hidden lg:flex bg-guard-danger text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] items-center justify-center px-0.5">
          {badgeCount}
        </span>
      )}
    </Link>
  );

  // Show tooltip only when sidebar is collapsed (desktop icons-only mode)
  if (!isExpanded) {
    return (
      <Tooltip content={label} side="right" triggerClassName="w-full">
        {link}
      </Tooltip>
    );
  }

  return link;
}

function SidebarGroup({ group }: { group: NavGroup }) {
  const { t } = useTranslate();
  const isExpanded = useSidebarExpanded();

  return (
    <div className="space-y-1">
      {/* Group label: shown only when expanded, hidden via CSS on desktop when collapsed */}
      <p
        className={cn(
          'px-3 py-1 text-xs font-semibold text-guard-muted uppercase tracking-wider',
          !isExpanded && 'lg:hidden',
        )}
      >
        {t(group.i18nKey)}
      </p>
      {/* Separator line shown only when collapsed on desktop */}
      {!isExpanded && <div className="hidden lg:block border-t border-border mx-2 !my-1.5" />}
      {group.items.map((item) => (
        <SidebarNavItem key={item.path} item={item} />
      ))}
    </div>
  );
}

export function AppSidebar() {
  const { t } = useTranslate();
  const isSidebarOpen = useSidebarOpen();
  const isExpanded = useSidebarExpanded();
  const toggleSidebar = useToggleSidebar();

  return (
    <>
      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={toggleSidebar}
          onKeyDown={(e) => {
            if (e.key === 'Escape') toggleSidebar();
          }}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full bg-card border-r border-border flex flex-col transition-all duration-200 ease-out',
          // Mobile: slide in/out
          'lg:translate-x-0',
          isExpanded ? 'translate-x-0 w-56' : '-translate-x-full w-56 lg:w-16',
        )}
      >
        {/* Sidebar header */}
        <div
          className={cn(
            'flex items-center h-16 border-b border-border px-3',
            isExpanded ? 'justify-between' : 'lg:justify-center justify-between',
          )}
        >
          <span className={cn('text-lg font-bold text-foreground truncate', !isExpanded && 'lg:hidden')}>
            {t('common.app-name')}
          </span>
          {/* Close button - visible on mobile when open, hidden on xl+ where sidebar is always expanded */}
          <button
            type="button"
            onClick={toggleSidebar}
            className={cn(
              'p-2 text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors xl:hidden',
              !isSidebarOpen && 'hidden',
            )}
            aria-label={t('navigation.close-menu')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Navigation groups */}
        <nav
          className={cn('flex-1 overflow-y-auto py-4 px-2', isExpanded && 'space-y-6')}
          aria-label={t('navigation.main')}
        >
          {NAV_GROUPS.map((group) => (
            <SidebarGroup key={group.i18nKey} group={group} />
          ))}
        </nav>

        {/* Settings (always at bottom) */}
        <div className="border-t border-border p-2">
          <SidebarNavItem item={SETTINGS_NAV} />
        </div>
      </aside>
    </>
  );
}
