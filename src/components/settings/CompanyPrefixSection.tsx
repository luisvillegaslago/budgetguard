'use client';

/**
 * BudgetGuard Company Prefix Section
 * 1:1 prefix assignment for clients — select an existing unassigned prefix or create a new one
 */

import { AlertTriangle, Loader2, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Select } from '@/components/ui/Select';
import { useCreateInvoicePrefix, useInvoicePrefixes, useUpdateInvoicePrefix } from '@/hooks/useInvoices';
import { useTranslate } from '@/hooks/useTranslations';

interface CompanyPrefixSectionProps {
  companyId: number;
}

type PendingAction = { type: 'change'; newPrefixId: number | null } | { type: 'create' } | null;

export function CompanyPrefixSection({ companyId }: CompanyPrefixSectionProps) {
  const { t } = useTranslate();
  const { data: allPrefixes, isLoading } = useInvoicePrefixes();
  const createPrefix = useCreateInvoicePrefix();
  const updatePrefix = useUpdateInvoicePrefix();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPrefixCode, setNewPrefixCode] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  // Current prefix assigned to this company
  const currentPrefix = useMemo(
    () => allPrefixes?.find((p) => p.companyId === companyId) ?? null,
    [allPrefixes, companyId],
  );

  // Available prefixes: unassigned ones + the current one (if any)
  const availablePrefixes = useMemo(() => {
    if (!allPrefixes) return [];
    return allPrefixes.filter((p) => p.companyId === null || p.companyId === companyId);
  }, [allPrefixes, companyId]);

  const unassignAndAssign = async (newPrefixId: number | null) => {
    // Unassign current prefix if changing
    if (currentPrefix) {
      await updatePrefix.mutateAsync({
        prefixId: currentPrefix.prefixId,
        data: { companyId: null },
      });
    }

    // Assign new prefix
    if (newPrefixId) {
      await updatePrefix.mutateAsync({
        prefixId: newPrefixId,
        data: { companyId },
      });
    }
  };

  const handleSelectPrefix = async (prefixId: string) => {
    const newId = prefixId ? Number(prefixId) : null;

    // If same prefix selected, do nothing
    if (newId === (currentPrefix?.prefixId ?? null)) return;

    // If there's a current prefix, ask for confirmation
    if (currentPrefix) {
      setPendingAction({ type: 'change', newPrefixId: newId });
      return;
    }

    await unassignAndAssign(newId);
  };

  const handleCreateClick = () => {
    // If there's a current prefix, ask for confirmation before showing create form
    if (currentPrefix) {
      setPendingAction({ type: 'create' });
      return;
    }

    setShowCreateForm(true);
  };

  const handleConfirm = async () => {
    if (!pendingAction) return;

    if (pendingAction.type === 'change') {
      await unassignAndAssign(pendingAction.newPrefixId);
      setPendingAction(null);
    } else if (pendingAction.type === 'create') {
      setPendingAction(null);
      setShowCreateForm(true);
    }
  };

  const handleCancelConfirm = () => {
    setPendingAction(null);
  };

  const handleCreatePrefix = async () => {
    if (!newPrefixCode.trim()) return;

    try {
      // Unassign current prefix first (maintain 1:1 relationship)
      if (currentPrefix) {
        await updatePrefix.mutateAsync({
          prefixId: currentPrefix.prefixId,
          data: { companyId: null },
        });
      }

      await createPrefix.mutateAsync({
        prefix: newPrefixCode.trim(),
        description: null,
        nextNumber: 1,
        companyId,
      });
      setNewPrefixCode('');
      setShowCreateForm(false);
    } catch {
      // Error handled by mutation state
    }
  };

  const isPending = updatePrefix.isPending || createPrefix.isPending;

  return (
    <div className="mt-6 pt-6 border-t border-border">
      <h3 className="text-sm font-semibold text-foreground mb-1">{t('companies.form.prefixes-title')}</h3>
      <p className="text-xs text-guard-muted mb-3">{t('companies.form.prefixes-hint')}</p>

      {isLoading ? (
        <div className="h-10 bg-muted/50 rounded-lg animate-pulse" />
      ) : pendingAction ? (
        /* Confirmation prompt */
        <div className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-guard-danger shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm text-guard-danger font-medium">
                {t('companies.form.prefix-replace-confirm', { prefix: currentPrefix?.prefix ?? '' })}
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isPending}
                  className="btn-primary text-xs px-3 py-1.5"
                >
                  {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    t('common.buttons.confirm')
                  )}
                </button>
                <button type="button" onClick={handleCancelConfirm} className="btn-ghost text-xs px-3 py-1.5">
                  {t('common.buttons.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : showCreateForm ? (
        /* Inline create form */
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="newPrefixCode" className="block text-xs font-medium text-guard-muted mb-1">
              {t('settings.billing.fields.prefix')}
            </label>
            <input
              id="newPrefixCode"
              type="text"
              value={newPrefixCode}
              onChange={(e) => setNewPrefixCode(e.target.value.toUpperCase())}
              placeholder="CREST"
              maxLength={10}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-guard-primary font-mono"
            />
          </div>
          <button
            type="button"
            onClick={handleCreatePrefix}
            disabled={createPrefix.isPending || !newPrefixCode.trim()}
            className="btn-primary flex items-center gap-1 shrink-0"
          >
            {createPrefix.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            {t('common.buttons.create')}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowCreateForm(false);
              setNewPrefixCode('');
            }}
            className="p-2 text-guard-muted hover:text-guard-danger rounded-lg transition-colors"
            aria-label={t('common.buttons.cancel')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        /* Select existing or create new */
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Select
              value={currentPrefix?.prefixId ?? ''}
              onChange={(e) => handleSelectPrefix(e.target.value)}
              disabled={isPending}
            >
              <option value="">{t('companies.form.no-prefix')}</option>
              {availablePrefixes.map((p) => (
                <option key={p.prefixId} value={p.prefixId}>
                  {p.prefix}
                  {p.description ? ` — ${p.description}` : ''}
                </option>
              ))}
            </Select>
          </div>
          <button
            type="button"
            onClick={handleCreateClick}
            className="btn-ghost flex items-center gap-1 shrink-0 text-sm"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('companies.form.create-prefix')}
          </button>
        </div>
      )}

      {(updatePrefix.isError || createPrefix.isError) && (
        <p className="text-sm text-guard-danger mt-2">{updatePrefix.error?.message ?? createPrefix.error?.message}</p>
      )}
    </div>
  );
}
