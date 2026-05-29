'use client';

/**
 * BudgetGuard Transaction Group Form
 * Form for creating and editing grouped transactions (e.g., outings with
 * multiple subcategory expenses). Lists all subcategories of the parent
 * category with amount inputs. When a `group` is provided it runs in edit
 * mode: fields are pre-filled and submitting reconciles the group's line items.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { AmountSumPopover } from '@/components/ui/AmountSumPopover';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { Select } from '@/components/ui/Select';
import { SHARED_EXPENSE, TRANSACTION_TYPE, VALIDATION_KEY } from '@/constants/finance';
import { useCategoriesHierarchical } from '@/hooks/useCategories';
import { useCreateTransactionGroup, useUpdateTransactionGroup } from '@/hooks/useTransactionGroups';
import { useTranslate } from '@/hooks/useTranslations';
import { TransactionTypeSchema } from '@/schemas/transaction';
import type { TransactionGroupDisplay, TransactionType } from '@/types/finance';
import { cn } from '@/utils/helpers';
import { centsToEuros, eurosToCents, formatCurrency } from '@/utils/money';

interface TransactionGroupFormProps {
  onClose: () => void;
  defaultType?: TransactionType;
  // When provided, the form runs in edit mode for this group
  group?: TransactionGroupDisplay;
}

// Form schema: description, date, parentCategoryId, and dynamic amounts per subcategory
const GroupFormSchema = z.object({
  description: z.string().min(1, VALIDATION_KEY.DESCRIPTION_REQUIRED).max(255),
  transactionDate: z.coerce.date({ message: VALIDATION_KEY.INVALID_DATE }),
  type: TransactionTypeSchema,
  isShared: z.boolean().optional().default(false),
  parentCategoryId: z.number().int().positive(VALIDATION_KEY.CATEGORY_REQUIRED),
});

type GroupFormValues = z.infer<typeof GroupFormSchema>;

export function TransactionGroupForm({
  onClose,
  defaultType = TRANSACTION_TYPE.EXPENSE,
  group,
}: TransactionGroupFormProps) {
  const { t } = useTranslate();
  const isEditMode = group != null;
  const type = group?.type ?? defaultType;
  const createGroup = useCreateTransactionGroup();
  const updateGroup = useUpdateTransactionGroup();
  const mutation = isEditMode ? updateGroup : createGroup;
  const { data: categories, isLoading: categoriesLoading } = useCategoriesHierarchical(type);

  // Parent category of the edited group (derived from its line items)
  const editParentId = group?.transactions[0]?.parentCategory?.categoryId;

  // Track amounts per subcategory (keyed by categoryId), pre-filled in edit mode
  const [subcategoryAmounts, setSubcategoryAmounts] = useState<Record<number, string>>(() => {
    if (!group) return {};
    return group.transactions.reduce<Record<number, string>>((acc, tx) => {
      // Show the full (original) amount for shared groups so users edit pre-split values
      const fullCents = group.isShared ? (tx.originalAmountCents ?? tx.amountCents) : tx.amountCents;
      acc[tx.categoryId] = String(centsToEuros(fullCents));
      return acc;
    }, {});
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    control,
    watch,
  } = useForm<GroupFormValues>({
    resolver: zodResolver(GroupFormSchema),
    defaultValues: {
      type,
      transactionDate: (group
        ? group.transactionDate.slice(0, 10)
        : new Date().toISOString().split('T')[0]) as unknown as Date,
      description: group?.description ?? '',
      isShared: group?.isShared ?? false,
      parentCategoryId: editParentId,
    },
  });

  const selectedParentId = watch('parentCategoryId');
  const watchedIsShared = useWatch({ control, name: 'isShared' });

  // Find the selected parent category and its subcategories
  const selectedParent = useMemo(
    () => categories?.find((c) => c.categoryId === selectedParentId) ?? null,
    [categories, selectedParentId],
  );

  const subcategories = useMemo(() => selectedParent?.subcategories ?? [], [selectedParent]);

  // Reset amounts when parent changes (create mode only; parent is locked when editing)
  const prevParentRef = useRef(selectedParentId);
  if (prevParentRef.current !== selectedParentId) {
    prevParentRef.current = selectedParentId;
    setSubcategoryAmounts({});
  }

  // Auto-set shared from parent's defaultShared (create mode only — keep the group's own value when editing)
  useEffect(() => {
    if (!isEditMode && selectedParent?.defaultShared) {
      setValue('isShared', true);
    }
  }, [isEditMode, selectedParent, setValue]);

  // Calculate running total from filled amounts
  const runningTotal = useMemo(() => {
    return Object.values(subcategoryAmounts).reduce((sum, val) => {
      const num = Number.parseFloat(val);
      return sum + (Number.isNaN(num) || num <= 0 ? 0 : eurosToCents(num));
    }, 0);
  }, [subcategoryAmounts]);

  // Calculate effective amount (after shared halving)
  const effectiveTotal = watchedIsShared ? Math.ceil(runningTotal / SHARED_EXPENSE.DIVISOR) : runningTotal;

  const handleAmountChange = (categoryId: number, value: string) => {
    setSubcategoryAmounts((prev) => ({ ...prev, [categoryId]: value }));
  };

  const handleParentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = Number(e.target.value);
    setValue('parentCategoryId', value, { shouldValidate: true });
  };

  const onSubmit = async (formData: GroupFormValues) => {
    // Build items from non-empty amounts
    const items = subcategories
      .map((sub) => {
        const rawAmount = subcategoryAmounts[sub.categoryId];
        const amount = Number.parseFloat(rawAmount ?? '');
        return { categoryId: sub.categoryId, amount };
      })
      .filter((item) => !Number.isNaN(item.amount) && item.amount > 0);

    if (items.length === 0) {
      return;
    }

    try {
      if (group) {
        await updateGroup.mutateAsync({
          groupId: group.transactionGroupId,
          data: {
            description: formData.description,
            transactionDate: formData.transactionDate,
            type: formData.type,
            isShared: formData.isShared,
            items,
          },
        });
      } else {
        await createGroup.mutateAsync({
          description: formData.description,
          transactionDate: formData.transactionDate,
          type: formData.type,
          isShared: formData.isShared,
          parentCategoryId: formData.parentCategoryId,
          items,
        });
      }
      onClose();
    } catch (_error) {
      // Error is handled by mutation state
    }
  };

  // Check if at least one subcategory has a valid amount
  const hasValidItems = Object.values(subcategoryAmounts).some((val) => {
    const num = Number.parseFloat(val);
    return !Number.isNaN(num) && num > 0;
  });

  // Auto-focus first input on mount
  const formContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const firstFocusable = formContainerRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea',
    );
    firstFocusable?.focus();
  }, []);

  return (
    <ModalBackdrop onClose={onClose} labelledBy="group-form-title">
      <div
        ref={formContainerRef}
        className="card w-full max-w-md lg:max-w-lg animate-modal-in max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="group-form-title" className="text-xl font-bold text-foreground">
            {t(isEditMode ? 'transactions.groups.edit-title' : 'transactions.groups.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            aria-label={t('common.buttons.close')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Row 1: Description + Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="groupDescription" className="block text-sm font-medium text-foreground mb-1.5">
                {t('transactions.form.fields.description')}
              </label>
              <input
                id="groupDescription"
                type="text"
                autoComplete="off"
                placeholder={t('transactions.groups.description-placeholder')}
                {...register('description')}
                className={cn(
                  'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground',
                  'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
                  'transition-colors duration-200 ease-out-quart',
                  errors.description ? 'border-guard-danger' : 'border-input',
                )}
              />
              {errors.description && (
                <p role="alert" className="mt-1 text-sm text-guard-danger">
                  {t(errors.description.message ?? '')}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="groupDate" className="block text-sm font-medium text-foreground mb-1.5">
                {t('transactions.form.fields.date')}
              </label>
              <input
                id="groupDate"
                type="date"
                {...register('transactionDate')}
                className={cn(
                  'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground',
                  'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
                  'transition-colors duration-200 ease-out-quart',
                  errors.transactionDate ? 'border-guard-danger' : 'border-input',
                )}
              />
              {errors.transactionDate && (
                <p role="alert" className="mt-1 text-sm text-guard-danger">
                  {t(errors.transactionDate.message ?? '')}
                </p>
              )}
            </div>
          </div>

          {/* Row 2: Category + Shared */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
            <div>
              <label htmlFor="groupParentCategory" className="block text-sm font-medium text-foreground mb-1.5">
                {t('transactions.groups.parent-category')}
              </label>
              <Select
                id="groupParentCategory"
                value={selectedParentId ?? ''}
                onChange={handleParentChange}
                disabled={categoriesLoading || isEditMode}
                className={cn(errors.parentCategoryId && 'border-guard-danger')}
              >
                <option value="">{t('transactions.form.fields.category-placeholder')}</option>
                {categories
                  ?.filter((cat) => (cat.subcategories?.length ?? 0) > 0)
                  .map((cat) => (
                    <option key={cat.categoryId} value={cat.categoryId}>
                      {cat.name}
                    </option>
                  ))}
              </Select>
              {errors.parentCategoryId && (
                <p role="alert" className="mt-1 text-sm text-guard-danger">
                  {t(errors.parentCategoryId.message ?? '')}
                </p>
              )}
            </div>

            <div>
              {/* Spacer to align checkbox with select input */}
              <span className="hidden sm:block text-sm mb-1.5">&nbsp;</span>
              <div className="flex items-center gap-2 h-[42px]">
                <input
                  id="groupIsShared"
                  type="checkbox"
                  {...register('isShared')}
                  className="h-4 w-4 rounded border-input text-guard-primary focus:ring-guard-primary"
                />
                <label
                  htmlFor="groupIsShared"
                  className="text-sm font-medium text-foreground flex items-center gap-2 whitespace-nowrap"
                >
                  <Users className="h-4 w-4 text-guard-primary" aria-hidden="true" />
                  {t('transactions.form.fields.shared')}
                </label>
              </div>
            </div>
          </div>

          {/* Subcategory Amount Inputs */}
          {subcategories.length > 0 && (
            <div className="space-y-2 animate-slide-up">
              <span className="block text-sm font-medium text-foreground">
                {t('transactions.groups.subcategories')}
              </span>
              <div className="space-y-2 rounded-lg border border-input p-3">
                {subcategories.map((sub) => {
                  const subColor = sub.color ?? selectedParent?.color ?? '#64748B';
                  return (
                    <div key={sub.categoryId} className="flex items-center gap-3">
                      <div className="flex-shrink-0 p-1 rounded" style={{ backgroundColor: `${subColor}15` }}>
                        <CategoryIcon icon={sub.icon} color={subColor} className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-sm text-foreground flex-1 min-w-0 truncate">{sub.name}</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0,00"
                        value={subcategoryAmounts[sub.categoryId] ?? ''}
                        onChange={(e) => handleAmountChange(sub.categoryId, e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className={cn(
                          'w-24 px-3 py-1.5 rounded-lg border bg-background text-foreground text-sm text-right',
                          'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
                          'transition-colors duration-200 ease-out-quart border-input',
                        )}
                      />
                      <AmountSumPopover onApply={(total) => handleAmountChange(sub.categoryId, String(total))} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Running Total */}
          {runningTotal > 0 && (
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50 animate-fade-in">
              <span className="text-sm font-medium text-foreground">
                {t('transactions.groups.running-total', { amount: formatCurrency(runningTotal) })}
              </span>
              {watchedIsShared && (
                <span className="text-xs text-guard-muted">
                  {t('transactions.form.fields.shared-hint', {
                    total: formatCurrency(runningTotal),
                    half: formatCurrency(effectiveTotal),
                  })}
                </span>
              )}
            </div>
          )}

          {/* Validation: min items */}
          {subcategories.length > 0 && !hasValidItems && (
            <p className="text-xs text-guard-muted">{t('transactions.groups.errors.min-items')}</p>
          )}

          {/* Error Message */}
          {mutation.isError && (
            <div role="alert" className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20">
              <p className="text-sm text-guard-danger">
                {t(isEditMode ? 'transactions.groups.errors.update' : 'transactions.groups.errors.create')}
              </p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || mutation.isPending || !hasValidItems}
            className={cn(
              'w-full py-3 rounded-lg font-semibold text-white transition-all duration-200 ease-out-quart',
              'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
              'bg-guard-danger hover:bg-guard-danger/90',
            )}
          >
            {isSubmitting || mutation.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
                {t(isEditMode ? 'transactions.groups.update-saving' : 'transactions.groups.saving')}
              </span>
            ) : (
              t(isEditMode ? 'transactions.groups.update-submit' : 'transactions.groups.submit')
            )}
          </button>
        </form>
      </div>
    </ModalBackdrop>
  );
}
