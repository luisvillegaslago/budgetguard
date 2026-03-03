import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { QueryProvider } from '@/providers/QueryProvider';
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

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={cn('min-h-screen bg-background font-sans text-foreground antialiased')}>
        <QueryProvider>
          <TranslationProvider>
            <div className="relative min-h-screen">{children}</div>
          </TranslationProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
