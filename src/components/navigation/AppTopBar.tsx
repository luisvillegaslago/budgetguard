'use client';

/**
 * App Top Bar
 * Persistent top bar with hamburger, page title, and user menu
 */

import { LogOut, Menu, Shield } from 'lucide-react';
import Image from 'next/image';
import { signOut, useSession } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import { useAppVersion } from '@/hooks/useAppVersion';
import { useTranslate } from '@/hooks/useTranslations';
import { useToggleSidebar } from '@/stores/useFinanceStore';

export function AppTopBar() {
  const { t } = useTranslate();
  const { data: session } = useSession();
  const toggleSidebar = useToggleSidebar();
  const version = useAppVersion();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="bg-card border-b border-border sticky top-0 z-30 h-16">
      <div className="flex items-center justify-between h-full px-4 sm:px-6">
        {/* Left: Hamburger + Logo */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleSidebar}
            className="p-2 text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors xl:hidden"
            aria-label={t('navigation.toggle-menu')}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-guard-primary rounded-lg">
              <Shield className="h-4 w-4 text-white" aria-hidden="true" />
            </div>
            <span className="text-lg font-bold text-foreground hidden sm:inline">{t('common.app-name')}</span>
          </div>
        </div>

        {/* Right: User menu + version */}
        <div className="flex items-center">
          {session?.user?.image && (
            <div className="relative flex flex-col items-center" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="rounded-full focus:outline-none focus:ring-2 focus:ring-guard-primary focus:ring-offset-2 focus:ring-offset-card"
                aria-label={session.user.name ?? 'User menu'}
                aria-expanded={showUserMenu}
                aria-haspopup="true"
              >
                <Image
                  src={session.user.image}
                  alt={session.user.name ?? ''}
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full border border-border transition-opacity hover:opacity-80"
                  referrerPolicy="no-referrer"
                />
              </button>
              {version && <span className="text-[10px] text-guard-muted leading-none mt-1.5">v{version}</span>}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 rounded-lg border border-border bg-card shadow-md z-50 animate-fade-in overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-border">
                    <p className="text-sm font-medium text-foreground truncate">{session.user.name}</p>
                    <p className="text-xs text-guard-muted truncate">{session.user.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-guard-danger hover:bg-muted transition-colors"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    {t('auth.sign-out')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
