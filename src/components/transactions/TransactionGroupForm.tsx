'use client';

/**
 * BudgetGuard Transaction Group Form
 * Form for creating grouped transactions (e.g., outings with multiple subcategory expenses)
 * Lists all subcategories of the selected parent category with amount inputs
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { Select } from '@/components/ui/Select';
import { SHARED_EXPENSE, TRANSACTION_TYPE } from '@/constants/finance';
import { useCategoriesHierarchical } from '@/hooks/useCategories';
import { useCreateTransactionGroup } from '@/hooks/useTransactionGroups';
import { useTranslate } from '@/hooks/useTranslations';
import { TransactionTypeSchema } from '@/schemas/transaction';
import type { TransactionType } from '@/types/finance';
import { cn } from '@/utils/helpers';
import { eurosToCents, formatCurrency } from '@/utils/money';

interface TransactionGroupFormProps {
  onClose: () => void;
  defaultType?: TransactionType;
  defaultParentCategoryId?: number;
}

// Form schema: description, date, parentCategoryId, and dynamic amounts per subcategory
const GroupFormSchema = z.object({
  description: z.string().min(1, 'La descripción es requerida').max(255),
  transactionDate: z.coerce.date({ message: 'Fecha invalida' }),
  type: TransactionTypeSchema,
  isShared: z.boolean().optional().default(false),
  parentCategoryId: z.number().int().positive('Selecciona una categoría'),
});

type GroupFormValues = z.infer<typeof GroupFormSchema>;

export function TransactionGroupForm({
  onClose,
  defaultType = TRANSACTION_TYPE.EXPENSE,
  defaultParentCategoryId,
}: TransactionGroupFormProps) {
  const { t } = useTranslate();
  const createGroup = useCreateTransactionGroup();
  const { data: categories, isLoading: categoriesLoading } = useCategoriesHierarchical(defaultType);

  // Track amounts per subcategory (keyed by categoryId)
  const [subcategoryAmounts, setSubcategoryAmounts] = useState<Record<number, string>>({});

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
      type: defaultType,
      transactionDate: new Date().toISOString().split('T')[0] as unknown as Date,
      description: '',
      isShared: false,
      ...(defaultParentCategoryId ? { parentCategoryId: defaultParentCategoryId } : {}),
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

  // Reset amounts when parent changes
  const prevParentRef = useRef(selectedParentId);
  if (prevParentRef.current !== selectedParentId) {
    prevParentRef.current = selectedParentId;
    setSubcategoryAmounts({});
  }

  // Auto-set shared from parent's defaultShared
  useEffect(() => {
    if (selectedParent?.defaultShared) {
      setValue('isShared', true);
    }
  }, [selectedParent, setValue]);

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
      await createGroup.mutateAsync({
        description: formData.description,
        transactionDate: formData.transactionDate,
        type: formData.type,
        isShared: formData.isShared,
        parentCategoryId: formData.parentCategoryId,
        items,
      });
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
      <div ref={formContainerRef} className="card w-full max-w-md animate-modal-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="group-form-title" className="text-xl font-bold text-foreground">
            {t('transactions.groups.title')}
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
          {/* Description */}
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
                {errors.description.message}
              </p>
            )}
          </div>

          {/* Date */}
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
                {errors.transactionDate.message}
              </p>
            )}
          </div>

          {/* Parent Category Selector */}
          <div>
            <label htmlFor="groupParentCategory" className="block text-sm font-medium text-foreground mb-1.5">
              {t('transactions.groups.parent-category')}
            </label>
            <Select
              id="groupParentCategory"
              value={selectedParentId ?? ''}
              onChange={handleParentChange}
              disabled={categoriesLoading}
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
                {errors.parentCategoryId.message}
              </p>
            )}
          </div>

          {/* Shared Expense Toggle */}
          <div className="flex items-start gap-3">
            <div className="flex items-center h-6 mt-0.5">
              <input
                id="groupIsShared"
                type="checkbox"
                {...register('isShared')}
                className="h-4 w-4 rounded border-input text-guard-primary focus:ring-guard-primary"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="groupIsShared" className="text-sm font-medium text-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-guard-primary" aria-hidden="true" />
                {t('transactions.form.fields.shared')}
              </label>
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
          {createGroup.isError && (
            <div role="alert" className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20">
              <p className="text-sm text-guard-danger">{t('transactions.groups.errors.create')}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || createGroup.isPending || !hasValidItems}
            className={cn(
              'w-full py-3 rounded-lg font-semibold text-white transition-all duration-200 ease-out-quart',
              'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
              'bg-guard-danger hover:bg-guard-danger/90',
            )}
          >
            {isSubmitting || createGroup.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
                {t('transactions.groups.saving')}
              </span>
            ) : (
              t('transactions.groups.submit')
            )}
          </button>
        </form>
      </div>
    </ModalBackdrop>
  );
}
