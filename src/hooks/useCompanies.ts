/**
 * BudgetGuard Companies Hooks
 * TanStack Query hooks for fetching and mutating companies
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CompanyRole } from '@/constants/finance';
import { API_ENDPOINT, CACHE_TIME, QUERY_KEY } from '@/constants/finance';
import type { CreateCompanyInput, UpdateCompanyInput } from '@/schemas/company';
import type { ApiResponse, Company } from '@/types/finance';
import { fetchApi } from '@/utils/fetchApi';

async function fetchCompanies(role?: CompanyRole): Promise<Company[]> {
  const params = new URLSearchParams({ isActive: 'true' });
  if (role) params.set('role', role);
  const response = await fetchApi(`${API_ENDPOINT.COMPANIES}?${params.toString()}`);

  if (!response.ok) {
    throw new Error('Error loading companies');
  }

  const data: ApiResponse<Company[]> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Unknown error');
  }

  return data.data;
}

async function fetchAllCompanies(role?: CompanyRole): Promise<Company[]> {
  const params = role ? `?role=${role}` : '';
  const response = await fetchApi(`${API_ENDPOINT.COMPANIES}${params}`);

  if (!response.ok) {
    throw new Error('Error loading companies');
  }

  const data: ApiResponse<Company[]> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Unknown error');
  }

  return data.data;
}

async function createCompanyRequest(input: CreateCompanyInput): Promise<Company> {
  const response = await fetchApi(API_ENDPOINT.COMPANIES, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(errorData.error ?? 'Error creating company');
  }

  const data: ApiResponse<Company> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Unknown error');
  }

  return data.data;
}

async function quickCreateCompanyRequest(name: string): Promise<Company> {
  const response = await fetchApi(API_ENDPOINT.COMPANIES, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(errorData.error ?? 'Error creating company');
  }

  const data: ApiResponse<Company> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Unknown error');
  }

  return data.data;
}

async function updateCompanyRequest(id: number, input: UpdateCompanyInput): Promise<Company> {
  const response = await fetchApi(`${API_ENDPOINT.COMPANIES}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(errorData.error ?? 'Error updating company');
  }

  const data: ApiResponse<Company> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error ?? 'Unknown error');
  }

  return data.data;
}

async function deleteCompanyRequest(id: number): Promise<void> {
  const response = await fetchApi(`${API_ENDPOINT.COMPANIES}/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(errorData.error ?? 'Error deleting company');
  }
}

/**
 * Hook to fetch active companies (for selectors)
 */
export function useCompanies(role?: CompanyRole) {
  return useQuery({
    queryKey: [QUERY_KEY.COMPANIES, role],
    queryFn: () => fetchCompanies(role),
    staleTime: CACHE_TIME.TEN_MINUTES,
  });
}

/**
 * Hook to fetch ALL companies including inactive (for management panel)
 */
export function useAllCompanies(role?: CompanyRole) {
  return useQuery({
    queryKey: [QUERY_KEY.COMPANIES, 'all', role],
    queryFn: () => fetchAllCompanies(role),
    staleTime: CACHE_TIME.TWO_MINUTES,
  });
}

/**
 * Hook to create a new company (full form)
 */
export function useCreateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCompanyRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.COMPANIES] });
    },
  });
}

/**
 * Hook to quick-create a company by name (for inline selector)
 */
export function useQuickCreateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: quickCreateCompanyRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.COMPANIES] });
    },
  });
}

/**
 * Hook to update an existing company
 */
export function useUpdateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateCompanyInput }) => updateCompanyRequest(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.COMPANIES] });
    },
  });
}

/**
 * Hook to delete (soft-delete) a company
 */
export function useDeleteCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCompanyRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.COMPANIES] });
    },
  });
}
