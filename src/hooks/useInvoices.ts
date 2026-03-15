/**
 * BudgetGuard Invoice Hooks
 * TanStack Query hooks for billing profile, prefixes, and invoice CRUD
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINT, API_ERROR, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import { useApiMutation } from '@/hooks/useApiMutation';
import type {
  BillingProfileInput,
  CreateInvoiceInput,
  CreateInvoicePrefixInput,
  UpdateInvoiceInput,
  UpdateInvoicePrefixInput,
  UpdateInvoiceStatusInput,
} from '@/schemas/invoice';
import type {
  ApiResponse,
  BillingProfile,
  Invoice,
  InvoiceListItem,
  InvoicePrefix,
  InvoiceStatus,
} from '@/types/finance';
import { extractApiErrorKey } from '@/utils/apiErrorHandler';
import { fetchApi } from '@/utils/fetchApi';

// ============================================================
// Fetch functions
// ============================================================

async function fetchBillingProfile(): Promise<BillingProfile | null> {
  const response = await fetchApi(API_ENDPOINT.BILLING_PROFILE);
  if (!response.ok) throw new Error('Error loading billing profile');
  const data: ApiResponse<BillingProfile | null> = await response.json();
  if (!data.success) throw new Error(data.error ?? 'Unknown error');
  return data.data ?? null;
}

async function updateBillingProfileRequest(input: BillingProfileInput): Promise<BillingProfile> {
  const response = await fetchApi(API_ENDPOINT.BILLING_PROFILE, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.UPDATE.BILLING_PROFILE));
  }
  const data: ApiResponse<BillingProfile> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
  return data.data;
}

async function fetchInvoicePrefixes(): Promise<InvoicePrefix[]> {
  const response = await fetchApi(API_ENDPOINT.INVOICE_PREFIXES);
  if (!response.ok) throw new Error('Error loading invoice prefixes');
  const data: ApiResponse<InvoicePrefix[]> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
  return data.data;
}

async function createInvoicePrefixRequest(input: CreateInvoicePrefixInput): Promise<InvoicePrefix> {
  const response = await fetchApi(API_ENDPOINT.INVOICE_PREFIXES, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.CREATE.PREFIX));
  }
  const data: ApiResponse<InvoicePrefix> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
  return data.data;
}

async function updateInvoicePrefixRequest(params: {
  prefixId: number;
  data: UpdateInvoicePrefixInput;
}): Promise<InvoicePrefix> {
  const response = await fetchApi(`${API_ENDPOINT.INVOICE_PREFIXES}/${params.prefixId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params.data),
  });
  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.UPDATE.PREFIX));
  }
  const data: ApiResponse<InvoicePrefix> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
  return data.data;
}

async function deleteInvoicePrefixRequest(prefixId: number): Promise<void> {
  const response = await fetchApi(`${API_ENDPOINT.INVOICE_PREFIXES}/${prefixId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.DELETE.PREFIX));
  }
}

async function fetchInvoices(filters?: { status?: InvoiceStatus; prefixId?: number }): Promise<InvoiceListItem[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.prefixId) params.set('prefixId', String(filters.prefixId));

  const url = params.toString() ? `${API_ENDPOINT.INVOICES}?${params}` : API_ENDPOINT.INVOICES;
  const response = await fetchApi(url);
  if (!response.ok) throw new Error('Error loading invoices');
  const data: ApiResponse<InvoiceListItem[]> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
  return data.data;
}

async function fetchInvoice(invoiceId: number): Promise<Invoice> {
  const response = await fetchApi(`${API_ENDPOINT.INVOICES}/${invoiceId}`);
  if (!response.ok) throw new Error('Error loading invoice');
  const data: ApiResponse<Invoice> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
  return data.data;
}

async function createInvoiceRequest(input: CreateInvoiceInput): Promise<Invoice> {
  const response = await fetchApi(API_ENDPOINT.INVOICES, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.CREATE.INVOICE));
  }
  const data: ApiResponse<Invoice> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
  return data.data;
}

async function updateInvoiceRequest(params: { invoiceId: number; data: UpdateInvoiceInput }): Promise<Invoice> {
  const response = await fetchApi(`${API_ENDPOINT.INVOICES}/${params.invoiceId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params.data),
  });
  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.UPDATE.INVOICE));
  }
  const data: ApiResponse<Invoice> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
  return data.data;
}

async function updateInvoiceStatusRequest(params: {
  invoiceId: number;
  data: UpdateInvoiceStatusInput;
}): Promise<Invoice> {
  const response = await fetchApi(`${API_ENDPOINT.INVOICES}/${params.invoiceId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params.data),
  });
  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.UPDATE.INVOICE));
  }
  const data: ApiResponse<Invoice> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
  return data.data;
}

async function deleteInvoiceRequest(invoiceId: number): Promise<void> {
  const response = await fetchApi(`${API_ENDPOINT.INVOICES}/${invoiceId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.DELETE.INVOICE));
  }
}

// ============================================================
// Hooks
// ============================================================

export function useBillingProfile() {
  return useQuery({
    queryKey: [QUERY_KEY.BILLING_PROFILE],
    queryFn: fetchBillingProfile,
    staleTime: CACHE_TIME.TEN_MINUTES,
  });
}

export function useUpdateBillingProfile() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: updateBillingProfileRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.BILLING_PROFILE] });
    },
  });
}

export function useInvoicePrefixes() {
  return useQuery({
    queryKey: [QUERY_KEY.INVOICE_PREFIXES],
    queryFn: fetchInvoicePrefixes,
    staleTime: CACHE_TIME.FIVE_MINUTES,
  });
}

export function useCreateInvoicePrefix() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: createInvoicePrefixRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.INVOICE_PREFIXES] });
    },
  });
}

export function useUpdateInvoicePrefix() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: updateInvoicePrefixRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.INVOICE_PREFIXES] });
    },
  });
}

export function useDeleteInvoicePrefix() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: deleteInvoicePrefixRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.INVOICE_PREFIXES] });
    },
  });
}

export function useInvoices(filters?: { status?: InvoiceStatus; prefixId?: number }) {
  return useQuery({
    queryKey: [QUERY_KEY.INVOICES, filters],
    queryFn: () => fetchInvoices(filters),
    staleTime: CACHE_TIME.TWO_MINUTES,
  });
}

export function useInvoice(invoiceId: number) {
  return useQuery({
    queryKey: [QUERY_KEY.INVOICES, invoiceId],
    queryFn: () => fetchInvoice(invoiceId),
    staleTime: CACHE_TIME.TWO_MINUTES,
    enabled: invoiceId > 0,
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: createInvoiceRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.INVOICES] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.INVOICE_PREFIXES] });
    },
  });
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: updateInvoiceRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.INVOICES] });
    },
  });
}

export function useUpdateInvoiceStatus() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: updateInvoiceStatusRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.INVOICES] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.TRANSACTIONS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.SUMMARY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.FISCAL_DOCUMENTS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.FISCAL_REPORT] });
    },
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: deleteInvoiceRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.INVOICES] });
    },
  });
}

export function useFinalizeInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: number) => {
      const response = await fetchApi(`${API_ENDPOINT.INVOICES}/${invoiceId}/finalize`, {
        method: 'POST',
      });
      if (!response.ok) {
        const err: ApiResponse<never> = await response.json();
        throw new Error(extractApiErrorKey(err as ApiResponse<never>, API_ERROR.MUTATION.FINALIZE.INVOICE));
      }

      // Extract filename from Content-Disposition header
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const fileNameMatch = disposition.match(/filename="?([^";\n]+)"?/);
      const fileName = fileNameMatch?.[1] ? decodeURIComponent(fileNameMatch[1]) : 'invoice.pdf';

      const blob = await response.blob();
      return { blob, fileName };
    },
    onSuccess: ({ blob, fileName }) => {
      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      // Invalidate caches
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.INVOICES] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.FISCAL_DOCUMENTS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.FISCAL_REPORT] });
    },
  });
}
