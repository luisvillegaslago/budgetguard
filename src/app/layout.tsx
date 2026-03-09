import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { DEFAULT_LOCALE, isValidLocale, type Locale } from '@/libs/i18n';
import { QueryProvider } from '@/providers/QueryProvider';
import { SessionProvider } from '@/providers/SessionProvider';
import { TooltipProvider } from '@/providers/TooltipProvider';
import { TranslationProvider } from '@/providers/TranslationProvider';
import '@/styles/global.css';
import '@fontsource/inter/latin.css';
import { cn } from '@/utils/helpers';

export const metadata: Metadata = {
  title: 'BudgetGuard - Control de Gastos Familiar',
  description: 'Sistema de control de gastos e ingresos familiares. Gestiona tu economia de forma simple y efectiva.',
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0F172A',
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('locale')?.value;
  const locale: Locale = localeCookie && isValidLocale(localeCookie) ? localeCookie : DEFAULT_LOCALE;

  return (
    <html lang={locale} className="dark" suppressHydrationWarning>
      <body className={cn('min-h-screen bg-background font-sans text-foreground antialiased')} suppressHydrationWarning>
        <SessionProvider>
          <QueryProvider>
            <TranslationProvider>
              <TooltipProvider>
                <div className="relative min-h-screen">{children}</div>
              </TooltipProvider>
            </TranslationProvider>
          </QueryProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
