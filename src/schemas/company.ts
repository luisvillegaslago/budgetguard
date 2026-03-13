/**
 * BudgetGuard Company Schemas
 * Shared validation schemas for company forms and API endpoints
 */

import { z } from 'zod';

import { COMPANY_ROLE } from '@/constants/finance';

/**
 * Schema for creating a new company (full form)
 */
export const CreateCompanySchema = z.object({
  name: z.string().min(1, 'Name is required').max(150, 'Name is too long'),
  tradingName: z.string().max(150).nullable().optional().default(null),
  taxId: z.string().max(30).nullable().optional().default(null),
  address: z.string().max(250).nullable().optional().default(null),
  city: z.string().max(100).nullable().optional().default(null),
  postalCode: z.string().max(20).nullable().optional().default(null),
  country: z.string().max(100).nullable().optional().default(null),
  invoiceLanguage: z.string().max(5).nullable().optional().default(null),
  role: z.enum([COMPANY_ROLE.CLIENT, COMPANY_ROLE.PROVIDER]).default(COMPANY_ROLE.CLIENT),
});

export type CreateCompanyInput = z.infer<typeof CreateCompanySchema>;

/**
 * Schema for updating an existing company (all optional)
 */
export const UpdateCompanySchema = z.object({
  name: z.string().min(1).max(150).optional(),
  tradingName: z.string().max(150).nullable().optional(),
  taxId: z.string().max(30).nullable().optional(),
  address: z.string().max(250).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  postalCode: z.string().max(20).nullable().optional(),
  country: z.string().max(100).nullable().optional(),
  invoiceLanguage: z.string().max(5).nullable().optional(),
  role: z.enum([COMPANY_ROLE.CLIENT, COMPANY_ROLE.PROVIDER]).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateCompanyInput = z.infer<typeof UpdateCompanySchema>;

/**
 * Schema for quick company creation (name only, from inline selector)
 */
export const QuickCreateCompanySchema = z.object({
  name: z.string().min(1, 'Name is required').max(150, 'Name is too long'),
});

export type QuickCreateCompanyInput = z.infer<typeof QuickCreateCompanySchema>;
