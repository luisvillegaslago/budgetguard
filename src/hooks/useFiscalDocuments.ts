/**
 * BudgetGuard Fiscal Documents Hooks
 * TanStack Query hooks for fiscal document CRUD operations.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINT, API_ERROR, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import { useApiMutation } from '@/hooks/useApiMutation';
import type { LinkTransactionInput } from '@/schemas/fiscal-document';
import type { ApiResponse, ExtractedInvoiceData, FiscalDocument } from '@/types/finance';
import { extractApiErrorKey } from '@/utils/apiErrorHandler';
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

  return useApiMutation({
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
        throw new Error(extractApiErrorKey(err as ApiResponse<never>, API_ERROR.MUTATION.UPLOAD.FISCAL_DOCUMENT));
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

  return useApiMutation({
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
        throw new Error(extractApiErrorKey(err as ApiResponse<never>, API_ERROR.MUTATION.UPLOAD.FISCAL_BULK));
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

  return useApiMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const response = await fetchApi(`${API_ENDPOINT.FISCAL_DOCUMENTS}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(extractApiErrorKey(err as ApiResponse<never>, API_ERROR.MUTATION.UPDATE.FISCAL_STATUS));
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

  return useApiMutation({
    mutationFn: async ({ id, deleteTransaction = false }: { id: number; deleteTransaction?: boolean }) => {
      const params = deleteTransaction ? '?deleteTransaction=true' : '';
      const response = await fetchApi(`${API_ENDPOINT.FISCAL_DOCUMENTS}/${id}${params}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(extractApiErrorKey(err as ApiResponse<never>, API_ERROR.MUTATION.DELETE.FISCAL_DOCUMENT));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.FISCAL_DOCUMENTS, year] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.FISCAL_DEADLINES, year] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRANSACTIONS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SUMMARY] });
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

  return useApiMutation({
    mutationFn: async ({
      documentId,
      locale,
    }: {
      documentId: number;
      locale: string;
    }): Promise<ExtractedInvoiceData> => {
      const response = await fetchApi(
        `${API_ENDPOINT.FISCAL_DOCUMENTS}/${documentId}/extract?locale=${encodeURIComponent(locale)}`,
        { method: 'POST' },
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(extractApiErrorKey(err as ApiResponse<never>, API_ERROR.FISCAL.EXTRACTION_FAILED));
      }

      const data: ApiResponse<ExtractedInvoiceData> = await response.json();
      if (!data.success || !data.data) throw new Error(data.error ?? 'extraction_failed');
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

  return useApiMutation({
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
        throw new Error(extractApiErrorKey(err as ApiResponse<never>, API_ERROR.MUTATION.LINK.FISCAL_TRANSACTION));
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
