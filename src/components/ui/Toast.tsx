'use client';

/**
 * BudgetGuard in-house toast system (no external dependencies).
 *
 * Provides a `ToastProvider` (mounted once near the root, wrapping the app) and
 * a `useToast()` hook exposing `{ success, error, info }`. Each method receives
 * an ALREADY-translated string — translation happens at the call site.
 *
 * Toasts stack, auto-dismiss after ~4s and are accessible:
 * - container is an aria-live region (polite for success/info, assertive for error)
 * - each toast announces via role="status" (or role="alert" for errors)
 * - dismiss button has a translated aria-label
 * - entrance animation is skipped under prefers-reduced-motion (handled in global.css)
 *
 * Usage:
 *   const { success, error, info } = useToast();
 *   success(t('vouchers.toast.created'));
 */

import { AlertCircle, CheckCircle2, Info, type LucideIcon, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useTranslate } from '@/hooks/useTranslations';
import { cn } from '@/utils/helpers';

/** Toast severity. Drives icon, color token and ARIA role. */
const TOAST_VARIANT = {
  SUCCESS: 'success',
  ERROR: 'error',
  INFO: 'info',
} as const;

type ToastVariant = (typeof TOAST_VARIANT)[keyof typeof TOAST_VARIANT];

interface ToastItem {
  id: number;
  variant: ToastVariant;
  message: string;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

/** Auto-dismiss delay in milliseconds. */
const AUTO_DISMISS_MS = 4000;

const ToastContext = createContext<ToastContextValue | null>(null);

/** Per-variant icon and color token, faithful to DESIGN.md (icon as secondary cue to color). */
const VARIANT_CONFIG: Record<ToastVariant, { Icon: LucideIcon; accent: string; iconColor: string }> = {
  [TOAST_VARIANT.SUCCESS]: {
    Icon: CheckCircle2,
    accent: 'border-l-guard-success',
    iconColor: 'text-guard-success',
  },
  [TOAST_VARIANT.ERROR]: {
    Icon: AlertCircle,
    accent: 'border-l-guard-danger',
    iconColor: 'text-guard-danger',
  },
  [TOAST_VARIANT.INFO]: {
    Icon: Info,
    accent: 'border-l-guard-primary',
    iconColor: 'text-guard-primary',
  },
};

/**
 * Hook to enqueue toasts. Must be used within a `ToastProvider`.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

interface ToastViewProps {
  toast: ToastItem;
  closeLabel: string;
  onDismiss: (id: number) => void;
}

/** Single toast row. Errors are assertive (role="alert"); success/info are polite (role="status"). */
function ToastView({ toast, closeLabel, onDismiss }: ToastViewProps) {
  const { Icon, accent, iconColor } = VARIANT_CONFIG[toast.variant];
  const isError = toast.variant === TOAST_VARIANT.ERROR;

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-lg border border-border border-l-4 bg-card p-4 shadow-sm',
        'animate-slide-up transition-shadow hover:shadow-md',
        accent,
      )}
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', iconColor)} aria-hidden="true" />
      <p className="flex-1 text-sm text-foreground">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="-mr-1 -mt-1 shrink-0 rounded p-1 text-guard-muted transition-colors hover:bg-muted hover:text-foreground"
        aria-label={closeLabel}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Mounts the toast stack and provides the enqueue API to descendants.
 * Place once near the root, wrapping the app.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslate();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // Monotonic id generator; refs avoid re-renders and collisions across rapid calls.
  const nextIdRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = nextIdRef.current++;
      setToasts((current) => [...current, { id, variant, message }]);
      // Auto-dismiss; timer is self-contained per toast.
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (message: string) => push(TOAST_VARIANT.SUCCESS, message),
      error: (message: string) => push(TOAST_VARIANT.ERROR, message),
      info: (message: string) => push(TOAST_VARIANT.INFO, message),
    }),
    [push],
  );

  const closeLabel = t('common.toast.close');

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-3"
      >
        {toasts.map((toast) => (
          <ToastView key={toast.id} toast={toast} closeLabel={closeLabel} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
