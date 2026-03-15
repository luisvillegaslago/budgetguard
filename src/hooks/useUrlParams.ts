/**
 * Shared hook for persisting filters in URL query params.
 * Extracts the updateParams pattern used across pages (Documents, Invoices, Fiscal).
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export function useUrlParams(basePath: string) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
      const qs = params.toString();
      router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
    },
    [router, searchParams, basePath],
  );

  return { searchParams, updateParams };
}
