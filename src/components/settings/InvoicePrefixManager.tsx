'use client';

/**
 * BudgetGuard Invoice Prefix Manager
 * Settings component for managing invoice numbering prefixes (create, edit, delete)
 * Each prefix can be associated with a company (client)
 */

import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Select } from '@/components/ui/Select';
import { useCompanies } from '@/hooks/useCompanies';
import {
  useCreateInvoicePrefix,
  useDeleteInvoicePrefix,
  useInvoicePrefixes,
  useUpdateInvoicePrefix,
} from '@/hooks/useInvoices';
import { useTranslate } from '@/hooks/useTranslations';
import type { InvoicePrefix } from '@/types/finance';

interface EditingState {
  prefixId: number;
  description: string;
  nextNumber: number;
  companyId: number | null;
}

export function InvoicePrefixManager() {
  const { t } = useTranslate();
  const { data: prefixes, isLoading } = useInvoicePrefixes();
  const { data: companies } = useCompanies();
  const createPrefix = useCreateInvoicePrefix();
  const updatePrefix = useUpdateInvoicePrefix();
  const deletePrefix = useDeleteInvoicePrefix();

  const [newPrefix, setNewPrefix] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newStartNumber, setNewStartNumber] = useState(1);
  const [newCompanyId, setNewCompanyId] = useState<number | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);

  const getCompanyName = (companyId: number | null): string | null => {
    if (!companyId || !companies) return null;
    return companies.find((c) => c.companyId === companyId)?.name ?? null;
  };

  const handleCreate = async () => {
    if (!newPrefix.trim()) return;

    try {
      await createPrefix.mutateAsync({
        prefix: newPrefix.trim(),
        description: newDescription.trim() || null,
        nextNumber: newStartNumber,
        companyId: newCompanyId,
      });
      setNewPrefix('');
      setNewDescription('');
      setNewStartNumber(1);
      setNewCompanyId(null);
    } catch {
      // Error handled by mutation state
    }
  };

  const handleEdit = (prefix: InvoicePrefix) => {
    setEditing({
      prefixId: prefix.prefixId,
      description: prefix.description ?? '',
      nextNumber: prefix.nextNumber,
      companyId: prefix.companyId,
    });
  };

  const handleSaveEdit = async () => {
    if (!editing) return;

    try {
      await updatePrefix.mutateAsync({
        prefixId: editing.prefixId,
        data: {
          description: editing.description.trim() || null,
          nextNumber: editing.nextNumber,
          companyId: editing.companyId,
        },
      });
      setEditing(null);
    } catch {
      // Error handled by mutation state
    }
  };

  const handleCancelEdit = () => {
    setEditing(null);
  };

  const handleDelete = async (prefixId: number) => {
    try {
      await deletePrefix.mutateAsync(prefixId);
    } catch {
      // Error handled by mutation state
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border p-6 mt-6">
      <h3 className="text-base font-semibold text-foreground mb-4">{t('settings.billing.prefixes-title')}</h3>

      {/* Existing prefixes */}
      {isLoading ? (
        <div className="h-20 bg-muted/50 rounded-lg animate-pulse mb-4" />
      ) : (
        <div className="space-y-2 mb-4">
          {prefixes?.length === 0 && (
            <p className="text-sm text-guard-muted py-3">{t('settings.billing.no-prefixes')}</p>
          )}
          {prefixes?.map((prefix) =>
            editing?.prefixId === prefix.prefixId ? (
              <div
                key={prefix.prefixId}
                className="flex items-center gap-2 px-4 py-3 rounded-lg bg-guard-primary/10 border border-guard-primary/30"
              >
                <span className="font-mono font-bold text-guard-primary shrink-0">{prefix.prefix}</span>
                <Select
                  value={editing.companyId ?? ''}
                  onChange={(e) =>
                    setEditing({ ...editing, companyId: e.target.value ? Number(e.target.value) : null })
                  }
                  className="w-40 py-1"
                >
                  <option value="">{t('settings.billing.fields.no-company')}</option>
                  {companies?.map((c) => (
                    <option key={c.companyId} value={c.companyId}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <div className="flex-1">
                  <input
                    type="text"
                    value={editing.description}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    placeholder={t('settings.billing.fields.description')}
                    className="w-full px-2 py-1 rounded border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-guard-primary"
                  />
                </div>
                <div className="w-20">
                  <input
                    type="number"
                    min={1}
                    value={editing.nextNumber}
                    onChange={(e) => setEditing({ ...editing, nextNumber: Number(e.target.value) })}
                    className="w-full px-2 py-1 rounded border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-guard-primary"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={updatePrefix.isPending}
                  className="p-1.5 text-guard-success hover:text-guard-success/80 transition-colors"
                  aria-label={t('common.buttons.save')}
                >
                  {updatePrefix.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="p-1.5 text-guard-muted hover:text-guard-danger transition-colors"
                  aria-label={t('common.buttons.cancel')}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div key={prefix.prefixId} className="flex items-center justify-between px-4 py-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-4">
                  <span className="font-mono font-bold text-guard-primary">{prefix.prefix}</span>
                  {getCompanyName(prefix.companyId) && (
                    <span className="text-sm text-foreground font-medium">{getCompanyName(prefix.companyId)}</span>
                  )}
                  <span className="text-sm text-guard-muted">
                    {t('settings.billing.next-number')}: {prefix.nextNumber}
                  </span>
                  {prefix.description && <span className="text-sm text-guard-muted">— {prefix.description}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleEdit(prefix)}
                    className="p-1.5 text-guard-muted hover:text-guard-primary transition-colors"
                    aria-label={t('common.buttons.edit')}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(prefix.prefixId)}
                    disabled={deletePrefix.isPending}
                    className="p-1.5 text-guard-muted hover:text-guard-danger transition-colors"
                    aria-label={t('common.buttons.delete')}
                  >
                    {deletePrefix.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {/* Create new prefix */}
      <div className="grid grid-cols-[1fr_1fr_1fr_80px_auto] gap-2 items-end">
        <div>
          <label htmlFor="newPrefix" className="block text-xs font-medium text-guard-muted mb-1">
            {t('settings.billing.fields.prefix')}
          </label>
          <input
            id="newPrefix"
            type="text"
            value={newPrefix}
            onChange={(e) => setNewPrefix(e.target.value.toUpperCase())}
            placeholder="DW"
            maxLength={10}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-guard-primary font-mono"
          />
        </div>
        <div>
          <label htmlFor="newCompanyId" className="block text-xs font-medium text-guard-muted mb-1">
            {t('invoices.form.fields.client')}
          </label>
          <Select
            id="newCompanyId"
            value={newCompanyId ?? ''}
            onChange={(e) => setNewCompanyId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{t('settings.billing.fields.no-company')}</option>
            {companies?.map((c) => (
              <option key={c.companyId} value={c.companyId}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="newDescription" className="block text-xs font-medium text-guard-muted mb-1">
            {t('settings.billing.fields.description')}
          </label>
          <input
            id="newDescription"
            type="text"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder={t('common.labels.optional')}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-guard-primary"
          />
        </div>
        <div>
          <label htmlFor="newStartNumber" className="block text-xs font-medium text-guard-muted mb-1">
            {t('settings.billing.fields.start-number')}
          </label>
          <input
            id="newStartNumber"
            type="number"
            min={1}
            value={newStartNumber}
            onChange={(e) => setNewStartNumber(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-guard-primary"
          />
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={createPrefix.isPending || !newPrefix.trim()}
          className="btn-primary flex items-center gap-1 shrink-0"
        >
          {createPrefix.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="h-4 w-4" aria-hidden="true" />
          )}
          {t('common.buttons.create')}
        </button>
      </div>

      {(createPrefix.isError || deletePrefix.isError || updatePrefix.isError) && (
        <p className="text-sm text-guard-danger mt-2">
          {createPrefix.error?.message ?? updatePrefix.error?.message ?? deletePrefix.error?.message}
        </p>
      )}
    </div>
  );
}
