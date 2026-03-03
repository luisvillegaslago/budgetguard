'use client';

import type { Session } from 'next-auth';
import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

interface SessionProviderProps {
  children: ReactNode;
  session?: Session;
}

/**
 * NextAuth Session Provider Wrapper
 *
 * Provides session context to all client components.
 * Wraps the NextAuth SessionProvider with optimized settings.
 *
 * Usage: Wrap your layout with this provider when authentication is needed.
 * Currently optional until auth system is fully implemented.
 */
export function SessionProvider({ children, session }: SessionProviderProps) {
  return (
    <NextAuthSessionProvider session={session} refetchOnWindowFocus={false}>
      {children}
    </NextAuthSessionProvider>
  );
}
