/**
 * useApiMutation — wrapper over useMutation that auto-translates error messages.
 * Exposes `errorMessage` (already translated) so components don't need to call t() manually.
 */

import { type UseMutationOptions, type UseMutationResult, useMutation } from '@tanstack/react-query';
import { useTranslate } from '@/hooks/useTranslations';

type UseApiMutationResult<TData, TError, TVariables, TContext> = UseMutationResult<
  TData,
  TError,
  TVariables,
  TContext
> & {
  errorMessage: string | null;
};

export function useApiMutation<TData = unknown, TVariables = void, TContext = unknown>(
  options: UseMutationOptions<TData, Error, TVariables, TContext>,
): UseApiMutationResult<TData, Error, TVariables, TContext> {
  const { t } = useTranslate();
  const mutation = useMutation(options);

  const errorMessage = mutation.error ? t(mutation.error.message) : null;

  return { ...mutation, errorMessage };
}
