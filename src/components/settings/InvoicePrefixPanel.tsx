'use client';

/**
 * BudgetGuard Invoice Prefix Panel
 * CRUD for numbering series in Settings → Billing.
 *
 * The prefix code and the next number are frozen after creation: changing the code would
 * invalidate the numbers already issued, and moving the counter backwards would collide
 * with an existing invoice. Only the description and the linked client can be edited.
 */

import { AlertTriangle, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { InlinePrefixForm } from '@/components/invoices/InlinePrefixForm';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { COMPANY_ROLE } from '@/constants/finance';
import { useCompanies } from '@/hooks/useCompanies';
import {
  useCreateInvoicePrefix,
  useDeleteInvoicePrefix,
  useInvoicePrefixes,
  useUpdateInvoicePrefix,
} from '@/hooks/useInvoices';
import { useTranslate } from '@/hooks/useTranslations';
import type { InvoicePrefix } from '@/types/finance';

interface EditState {
  prefixId: number;
  description: string;
  companyId: number;
}

export function InvoicePrefixPanel() {
  const { t } = useTranslate();
  const toast = useToast();
  const { data: prefixes, isLoading } = useInvoicePrefixes();
  const { data: clients } = useCompanies(COMPANY_ROLE.CLIENT);
  const createPrefix = useCreateInvoicePrefix();
  const updatePrefix = useUpdateInvoicePrefix();
  const deletePrefix = useDeleteInvoicePrefix();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const clientNameById = useMemo(() => new Map((clients ?? []).map((c) => [c.companyId, c.name])), [clients]);

  // A client owns at most one series, so offer only the free ones plus the current holder
  const assignableClients = useMemo(() => {
    const taken = new Set((prefixes ?? []).flatMap((p) => (p.companyId ? [p.companyId] : [])));
    return (clients ?? []).filter((c) => !taken.has(c.companyId) || c.companyId === edit?.companyId);
  }, [clients, prefixes, edit]);

  const handleCreate = async (prefix: string) => {
    try {
      await createPrefix.mutateAsync({ prefix, description: null, nextNumber: 1, companyId: null });
      setShowCreateForm(false);
      toast.success(t('settings.billing.prefix-created'));
    } catch {
      // Error handled by mutation state
    }
  };

  const handleSaveEdit = async () => {
    if (!edit) return;
    try {
      await updatePrefix.mutateAsync({
        prefixId: edit.prefixId,
        data: {
          description: edit.description.trim() || null,
          companyId: edit.companyId > 0 ? edit.companyId : null,
        },
      });
      setEdit(null);
    } catch {
      // Error handled by mutation state
    }
  };

  const handleDelete = async (prefixId: number) => {
    try {
      await deletePrefix.mutateAsync(prefixId);
      setPendingDeleteId(null);
      toast.success(t('settings.billing.prefix-deleted'));
    } catch {
      // A series with invoices answers 409; the message renders below the list
      setPendingDeleteId(null);
    }
  };

  const errorMessage = createPrefix.errorMessage ?? updatePrefix.errorMessage ?? deletePrefix.errorMessage;

  const renderRow = (prefix: InvoicePrefix) => {
    if (edit?.prefixId === prefix.prefixId) {
      return (
        <li key={prefix.prefixId} className="p-3 rounded-lg border border-guard-primary/40 bg-muted/20 space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-foreground">{prefix.prefix}</span>
            <span className="text-xs text-guard-muted">
              {t('settings.billing.next-number')}: {prefix.nextNumber}
            </span>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor={`prefix-description-${prefix.prefixId}`}
                className="block text-xs font-medium text-guard-muted mb-1"
              >
                {t('settings.billing.fields.description')}
              </label>
              <input
                id={`prefix-description-${prefix.prefixId}`}
                type="text"
                value={edit.description}
                onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                placeholder={t('settings.billing.description-placeholder')}
                maxLength={100}
                className="w-full input-sm"
              />
            </div>
            <div>
              <label
                htmlFor={`prefix-company-${prefix.prefixId}`}
                className="block text-xs font-medium text-guard-muted mb-1"
              >
                {t('companies.form.title-create-client')}
              </label>
              <Select
                id={`prefix-company-${prefix.prefixId}`}
                value={edit.companyId}
                onChange={(e) => setEdit({ ...edit, companyId: Number(e.target.value) })}
              >
                <option value={0}>{t('settings.billing.fields.no-company')}</option>
                {assignableClients.map((client) => (
                  <option key={client.companyId} value={client.companyId}>
                    {client.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEdit(null)} className="btn-ghost text-xs px-3 py-1.5">
              {t('common.buttons.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={updatePrefix.isPending}
              className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
            >
              {updatePrefix.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {t('common.buttons.save')}
            </button>
          </div>
        </li>
      );
    }

    if (pendingDeleteId === prefix.prefixId) {
      return (
        <li key={prefix.prefixId} className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-guard-danger shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm text-guard-danger font-medium">
                {t('settings.billing.delete-prefix-confirm', { prefix: prefix.prefix })}
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => handleDelete(prefix.prefixId)}
                  disabled={deletePrefix.isPending}
                  className="btn-primary text-xs px-3 py-1.5"
                >
                  {deletePrefix.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    t('common.buttons.delete')
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(null)}
                  className="btn-ghost text-xs px-3 py-1.5"
                >
                  {t('common.buttons.cancel')}
                </button>
              </div>
            </div>
          </div>
        </li>
      );
    }

    const clientName = prefix.companyId ? clientNameById.get(prefix.companyId) : null;

    return (
      <li
        key={prefix.prefixId}
        className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
      >
        <span className="font-mono font-semibold text-foreground w-20 shrink-0">{prefix.prefix}</span>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground truncate">{clientName ?? t('settings.billing.fields.no-company')}</p>
          {prefix.description && <p className="text-xs text-guard-muted truncate">{prefix.description}</p>}
        </div>

        <span className="text-xs text-guard-muted shrink-0 tabular-nums">
          {t('settings.billing.next-number')}: {prefix.nextNumber}
        </span>

        <button
          type="button"
          onClick={() =>
            setEdit({
              prefixId: prefix.prefixId,
              description: prefix.description ?? '',
              companyId: prefix.companyId ?? 0,
            })
          }
          className="p-2 text-guard-muted hover:text-guard-primary rounded-lg transition-colors shrink-0"
          aria-label={t('common.buttons.edit')}
          title={t('common.buttons.edit')}
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setPendingDeleteId(prefix.prefixId)}
          className="p-2 text-guard-muted hover:text-guard-danger rounded-lg transition-colors shrink-0"
          aria-label={t('common.buttons.delete')}
          title={t('common.buttons.delete')}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </li>
    );
  };

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">{t('settings.billing.prefixes-title')}</h3>
          <p className="text-sm text-guard-muted mt-0.5">{t('settings.billing.prefixes-subtitle')}</p>
        </div>
        {!showCreateForm && (
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="btn-primary flex items-center gap-1.5 shrink-0 text-sm"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('settings.billing.create-prefix')}
          </button>
        )}
      </div>

      {showCreateForm && (
        <div className="mb-4 p-3 rounded-lg border border-border bg-muted/20">
          <InlinePrefixForm
            inputId="settingsNewPrefixCode"
            isPending={createPrefix.isPending}
            onSubmit={handleCreate}
            onCancel={() => setShowCreateForm(false)}
          />
          <p className="text-xs text-guard-muted mt-2">{t('settings.billing.create-prefix-hint')}</p>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          <div className="h-14 bg-muted/50 rounded-lg animate-pulse" />
          <div className="h-14 bg-muted/50 rounded-lg animate-pulse" />
        </div>
      ) : !prefixes || prefixes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <X className="h-8 w-8 text-guard-muted" aria-hidden="true" />
          <p className="text-sm text-guard-muted">{t('settings.billing.no-prefixes')}</p>
        </div>
      ) : (
        <ul className="space-y-2">{prefixes.map(renderRow)}</ul>
      )}

      {errorMessage && (
        <p role="alert" className="text-sm text-guard-danger mt-3">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
