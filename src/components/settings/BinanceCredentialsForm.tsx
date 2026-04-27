'use client';

/**
 * Settings → Crypto form for connecting a Binance account.
 *
 * Renders one of three states based on the credentials status:
 *  - Loading skeleton
 *  - Connected: shows masked api key, permissions snapshot, and "Disconnect"
 *  - Not connected: form with API key + secret + "Validate and connect"
 *
 * The submit handler calls POST /api/crypto/credentials, which validates the
 * key against Binance's apiRestrictions endpoint BEFORE persisting anything.
 * Errors are shown as already-translated strings via useApiMutation.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, Plug, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { CRYPTO_EXCHANGE } from '@/constants/finance';
import {
  type CryptoCredentialPermissions,
  useConnectCryptoCredential,
  useCryptoCredentialStatus,
  useDisconnectCryptoCredential,
} from '@/hooks/useCryptoCredentials';
import { useTranslate } from '@/hooks/useTranslations';
import { type CreateCryptoCredentialInput, CreateCryptoCredentialSchema } from '@/schemas/crypto';

export function BinanceCredentialsForm() {
  const { t } = useTranslate();
  const status = useCryptoCredentialStatus(CRYPTO_EXCHANGE.BINANCE);
  const connect = useConnectCryptoCredential();
  const disconnect = useDisconnectCryptoCredential();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<CreateCryptoCredentialInput>({
    resolver: zodResolver(CreateCryptoCredentialSchema),
    defaultValues: { exchange: CRYPTO_EXCHANGE.BINANCE, apiKey: '', apiSecret: '' },
    mode: 'onChange',
  });

  const [showSecret, setShowSecret] = useState(false);

  const onSubmit = async (data: CreateCryptoCredentialInput) => {
    await connect.mutateAsync(data);
    reset({ exchange: CRYPTO_EXCHANGE.BINANCE, apiKey: '', apiSecret: '' });
  };

  const handleDisconnect = async () => {
    if (!window.confirm(t('settings.crypto.actions.disconnect-confirm'))) return;
    await disconnect.mutateAsync(CRYPTO_EXCHANGE.BINANCE);
  };

  if (status.isLoading) {
    return <div className="h-48 bg-muted/50 rounded-lg animate-pulse" />;
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">{t('settings.crypto.title')}</h3>
        <p className="text-sm text-guard-muted mt-1">{t('settings.crypto.subtitle')}</p>
      </div>

      {status.data?.connected ? (
        <ConnectedView
          last4={status.data.apiKeyLast4 ?? '????'}
          permissions={status.data.permissions}
          lastValidatedAt={status.data.lastValidatedAt}
          onDisconnect={handleDisconnect}
          isDisconnecting={disconnect.isPending}
          errorMessage={disconnect.errorMessage}
        />
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-foreground">
            <KeyRound className="h-4 w-4 inline mr-2 text-guard-primary" aria-hidden="true" />
            {t('settings.crypto.form.instructions')}
          </div>

          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-foreground mb-1">
              {t('settings.crypto.fields.api-key')}
            </label>
            <input
              id="apiKey"
              type="text"
              autoComplete="off"
              spellCheck={false}
              {...register('apiKey')}
              className="w-full input-sm font-mono"
            />
            {errors.apiKey && <p className="text-xs text-guard-danger mt-1">{errors.apiKey.message}</p>}
          </div>

          <div>
            <label htmlFor="apiSecret" className="block text-sm font-medium text-foreground mb-1">
              {t('settings.crypto.fields.api-secret')}
            </label>
            <div className="flex gap-2">
              <input
                id="apiSecret"
                type={showSecret ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                {...register('apiSecret')}
                className="w-full input-sm font-mono"
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="btn-ghost px-3 text-xs"
                aria-pressed={showSecret}
              >
                {showSecret ? '••••' : 'abc'}
              </button>
            </div>
            {errors.apiSecret && <p className="text-xs text-guard-danger mt-1">{errors.apiSecret.message}</p>}
            <p className="text-xs text-guard-muted mt-2 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-guard-warning mt-0.5 shrink-0" aria-hidden="true" />
              <span>{t('settings.crypto.form.secret-warning')}</span>
            </p>
          </div>

          {connect.errorMessage && <p className="text-sm text-guard-danger">{connect.errorMessage}</p>}
          {connect.isSuccess && <p className="text-sm text-guard-success">{t('settings.crypto.form.success')}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={connect.isPending || !isValid}
              className="btn-primary flex items-center gap-2"
            >
              {connect.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plug className="h-4 w-4" aria-hidden="true" />
              )}
              {connect.isPending ? t('settings.crypto.form.submitting') : t('settings.crypto.form.submit')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ============================================================
// Connected sub-view
// ============================================================

interface ConnectedViewProps {
  last4: string;
  permissions: CryptoCredentialPermissions | null;
  lastValidatedAt: string | null;
  onDisconnect: () => void;
  isDisconnecting: boolean;
  errorMessage: string | null;
}

function ConnectedView({
  last4,
  permissions,
  lastValidatedAt,
  onDisconnect,
  isDisconnecting,
  errorMessage,
}: ConnectedViewProps) {
  const { t, locale } = useTranslate();
  const safe = isPermissionsSafe(permissions);

  const formattedDate = lastValidatedAt
    ? new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(new Date(lastValidatedAt))
    : '—';

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
        <CheckCircle2 className="h-5 w-5 text-guard-success mt-0.5" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">{t('settings.crypto.connected-as', { last4 })}</p>
          <p className="text-xs text-guard-muted mt-0.5">
            {t('settings.crypto.last-validated', { at: formattedDate })}
          </p>
        </div>
      </div>

      {permissions && (
        <div>
          <p className="text-sm font-medium text-foreground mb-2">{t('settings.crypto.permissions-title')}</p>
          <div className="flex flex-wrap gap-2">
            <PermissionBadge
              active={permissions.enableReading}
              label={t('settings.crypto.permission.reading')}
              positive
            />
            <PermissionBadge
              active={permissions.ipRestrict}
              label={t('settings.crypto.permission.ip-restrict')}
              positive
            />
            <PermissionBadge
              active={permissions.enableWithdrawals}
              label={t('settings.crypto.permission.withdrawals')}
              positive={false}
            />
            <PermissionBadge
              active={permissions.enableSpotAndMarginTrading}
              label={t('settings.crypto.permission.spot-trading')}
              positive={false}
            />
            <PermissionBadge
              active={permissions.enableFutures}
              label={t('settings.crypto.permission.futures')}
              positive={false}
            />
            <PermissionBadge
              active={permissions.enableMargin}
              label={t('settings.crypto.permission.margin')}
              positive={false}
            />
          </div>
          <p className={`text-xs mt-2 ${safe ? 'text-guard-success' : 'text-guard-danger'}`}>
            {safe ? t('settings.crypto.permission-safe') : t('settings.crypto.permission-unsafe')}
          </p>
        </div>
      )}

      {errorMessage && <p className="text-sm text-guard-danger">{errorMessage}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDisconnect}
          disabled={isDisconnecting}
          className="btn-ghost text-guard-danger flex items-center gap-2"
        >
          {isDisconnecting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          )}
          {t('settings.crypto.actions.disconnect')}
        </button>
      </div>
    </div>
  );
}

function PermissionBadge({ active, label, positive }: { active: boolean; label: string; positive: boolean }) {
  // Tone reflects the *current state* of the permission, not whether the
  // current state is desirable:
  //   green  = positive permission ON  (e.g. "Reading" enabled)
  //   red    = negative permission ON  (e.g. "Withdrawals" enabled — danger)
  //   muted  = permission OFF           (regardless of polarity)
  const tone =
    positive && active
      ? 'border-guard-success/30 bg-guard-success/10 text-guard-success'
      : !positive && active
        ? 'border-guard-danger/30 bg-guard-danger/10 text-guard-danger'
        : 'border-border bg-muted text-guard-muted';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-current' : 'bg-current/40'}`} />
      {label}
    </span>
  );
}

function isPermissionsSafe(p: CryptoCredentialPermissions | null): boolean {
  if (!p) return false;
  return (
    p.enableReading && !p.enableWithdrawals && !p.enableSpotAndMarginTrading && !p.enableFutures && !p.enableMargin
  );
}
