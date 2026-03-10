/**
 * BudgetGuard Billing Profile API
 * GET /api/billing-profile - Get current user's billing profile
 * PUT /api/billing-profile - Create or update billing profile
 */

import { BillingProfileSchema } from '@/schemas/invoice';
import { validateRequest } from '@/schemas/transaction';
import { getBillingProfile, upsertBillingProfile } from '@/services/database/InvoiceRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async () => {
  const profile = await getBillingProfile();
  return { data: profile };
}, 'GET /api/billing-profile');

export const PUT = withApiHandler(async (request) => {
  const body = await request.json();
  const validation = validateRequest(BillingProfileSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const profile = await upsertBillingProfile(validation.data);
  return { data: profile };
}, 'PUT /api/billing-profile');
