'use client';

import { AlertTriangle, RefreshCw, Shield } from 'lucide-react';
import { detectLocale, getErrorTranslations } from '@/utils/staticTranslations';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// Global error boundary - catches errors in the root layout
// Uses inline styles since global CSS may not be loaded
// Uses static translations since React providers are not available
export default function GlobalError({ reset }: GlobalErrorProps) {
  const locale = detectLocale();
  const { appName, global: t } = getErrorTranslations(locale);

  return (
    <html lang={locale}>
      <head>
        <title>{`${t.title} - ${appName}`}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          padding: '1rem',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          {/* Logo and icon */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              marginBottom: '2rem',
            }}
          >
            <Shield style={{ width: '2rem', height: '2rem', color: '#4F46E5' }} />
            <span
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: '#F8FAFC',
                letterSpacing: '-0.025em',
              }}
            >
              {appName}
            </span>
          </div>

          {/* Error icon */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.5rem',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              borderRadius: '9999px',
              marginBottom: '1.5rem',
            }}
          >
            <AlertTriangle style={{ width: '3rem', height: '3rem', color: '#EF4444' }} />
          </div>

          {/* Error message */}
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#F8FAFC',
              marginBottom: '0.5rem',
            }}
          >
            {t.title}
          </h1>
          <p
            style={{
              color: '#64748B',
              marginBottom: '2rem',
              lineHeight: 1.6,
            }}
          >
            {t.description}
          </p>

          {/* Reset button */}
          <button
            type="button"
            onClick={reset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#4F46E5',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#4338CA';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#4F46E5';
            }}
            onFocus={(e) => {
              e.currentTarget.style.backgroundColor = '#4338CA';
            }}
            onBlur={(e) => {
              e.currentTarget.style.backgroundColor = '#4F46E5';
            }}
          >
            <RefreshCw style={{ width: '1rem', height: '1rem' }} />
            {t.reload}
          </button>

          {/* Footer hint */}
          <p
            style={{
              marginTop: '2rem',
              fontSize: '0.75rem',
              color: '#475569',
            }}
          >
            {t['support-hint']}
          </p>
        </div>
      </body>
    </html>
  );
}
