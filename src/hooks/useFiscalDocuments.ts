/**
 * BudgetGuard Fiscal Documents Hooks
 * TanStack Query hooks for fiscal document CRUD operations.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import type { LinkTransactionInput } from '@/schemas/fiscal-document';
import type { ApiResponse, FiscalDocument } from '@/types/finance';
import { fetchApi } from '@/utils/fetchApi';

// ============================================================
// Fetch Functions
// ============================================================

async function fetchDocuments(year: number, quarter?: number, documentType?: string): Promise<FiscalDocument[]> {
  const params = new URLSearchParams({ year: String(year) });
  if (quarter != null) params.set('quarter', String(quarter));
  if (documentType) params.set('documentType', documentType);

  const response = await fetchApi(`${API_ENDPOINT.FISCAL_DOCUMENTS}?${params.toString()}`);
  if (!response.ok) throw new Error('Error loading fiscal documents');
  const data: ApiResponse<FiscalDocument[]> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
  return data.data;
}

// ============================================================
// Queries
// ============================================================

export function useFiscalDocuments(year: number, quarter?: number, documentType?: string) {
  return useQuery({
    queryKey: [QUERY_KEY.FISCAL_DOCUMENTS, year, quarter, documentType],
    queryFn: () => fetchDocuments(year, quarter, documentType),
    staleTime: CACHE_TIME.FIVE_MINUTES,
  });
}

// ============================================================
// Mutations
// ============================================================

export function useUploadFiscalDocument(year: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ file, metadata }: { file: File; metadata: Record<string, unknown> }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('metadata', JSON.stringify(metadata));

      const response = await fetchApi(API_ENDPOINT.FISCAL_DOCUMENTS, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? 'Upload failed');
      }

      const data: ApiResponse<FiscalDocument> = await response.json();
      if (!data.success || !data.data) throw new Error(data.error ?? 'Upload failed');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.FISCAL_DOCUMENTS, year] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.FISCAL_DEADLINES, year] });
    },
  });
}

interface BulkUploadResult {
  results: Array<{ fileName: string; success: boolean; error?: string; documentId?: number }>;
  total: number;
  succeeded: number;
  failed: number;
}

export function useBulkUploadDocuments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      files,
      metadata,
    }: {
      files: File[];
      metadata?: Record<string, unknown>[];
    }): Promise<BulkUploadResult> => {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });
      if (metadata) formData.append('metadata', JSON.stringify(metadata));

      const response = await fetchApi(`${API_ENDPOINT.FISCAL_DOCUMENTS}/bulk`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? 'Bulk upload failed');
      }

      const data: ApiResponse<BulkUploadResult> = await response.json();
      if (!data.success || !data.data) throw new Error(data.error ?? 'Bulk upload failed');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.FISCAL_DOCUMENTS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.FISCAL_DEADLINES] });
    },
  });
}

export function useUpdateDocumentStatus(year: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const response = await fetchApi(`${API_ENDPOINT.FISCAL_DOCUMENTS}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? 'Status update failed');
      }

      const data: ApiResponse<FiscalDocument> = await response.json();
      if (!data.success || !data.data) throw new Error(data.error ?? 'Status update failed');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.FISCAL_DOCUMENTS, year] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.FISCAL_DEADLINES, year] });
    },
  });
}

export function useDeleteFiscalDocument(year: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await fetchApi(`${API_ENDPOINT.FISCAL_DOCUMENTS}/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? 'Delete failed');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.FISCAL_DOCUMENTS, year] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.FISCAL_DEADLINES, year] });
    },
  });
}

// ============================================================
// OCR Extraction Mutations
// ============================================================

/**
 * Trigger OCR extraction for a fiscal document
 */
export function useExtractDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documentId: number): Promise<FiscalDocument> => {
      const response = await fetchApi(`${API_ENDPOINT.FISCAL_DOCUMENTS}/${documentId}/extract`, {
        method: 'POST',
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? 'Extraction failed');
      }

      const data: ApiResponse<FiscalDocument> = await response.json();
      if (!data.success || !data.data) throw new Error(data.error ?? 'Extraction failed');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.FISCAL_DOCUMENTS] });
    },
  });
}

/**
 * Create a transaction from extracted data and link it to the document.
 * Atomic triple cache invalidation on success.
 */
export function useLinkTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      documentId,
      data,
    }: {
      documentId: number;
      data: LinkTransactionInput;
    }): Promise<{ transactionId: number; documentId: number }> => {
      const response = await fetchApi(`${API_ENDPOINT.FISCAL_DOCUMENTS}/${documentId}/link-transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? 'Link transaction failed');
      }

      const result: ApiResponse<{ transactionId: number; documentId: number }> = await response.json();
      if (!result.success || !result.data) throw new Error(result.error ?? 'Link transaction failed');
      return result.data;
    },
    onSuccess: () => {
      // Atomic triple invalidation to avoid layout shift
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRANSACTIONS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SUMMARY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.FISCAL_DOCUMENTS] });
    },
  });
}
