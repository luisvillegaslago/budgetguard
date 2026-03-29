'use client';

/**
 * Authenticated Layout
 * Shared layout with persistent sidebar navigation and top bar
 */

import type { ReactNode } from 'react';
import { AppSidebar } from '@/components/navigation/AppSidebar';
import { AppTopBar } from '@/components/navigation/AppTopBar';
import { useThemeSync } from '@/stores/themeStore';
import { useSidebarExpanded } from '@/stores/useFinanceStore';
import { cn } from '@/utils/helpers';

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  const isExpanded = useSidebarExpanded();
  useThemeSync();

  return (
    <div className="min-h-screen bg-guard-light dark:bg-guard-dark overflow-x-hidden" suppressHydrationWarning>
      <AppSidebar />

      {/* Main content area - shifts right for sidebar */}
      <div
        className={cn(
          'flex flex-col min-h-screen transition-all duration-200 ease-out',
          isExpanded ? 'lg:ml-56' : 'lg:ml-16',
        )}
      >
        <AppTopBar />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
