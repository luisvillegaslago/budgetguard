/**
 * BudgetGuard Invoices API
 * GET /api/invoices - List invoices with optional filters
 * POST /api/invoices - Create a new invoice
 */

import type { InvoiceStatus } from '@/constants/finance';
import { CreateInvoiceSchema } from '@/schemas/invoice';
import { validateRequest } from '@/schemas/transaction';
import { createInvoice, getInvoices } from '@/services/database/InvoiceRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async (request) => {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') as InvoiceStatus | null;
  const prefixId = searchParams.get('prefixId');

  const filters = {
    ...(status ? { status } : {}),
    ...(prefixId ? { prefixId: Number(prefixId) } : {}),
  };

  const invoices = await getInvoices(filters);
  return { data: invoices, meta: { count: invoices.length } };
}, 'GET /api/invoices');

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const validation = validateRequest(CreateInvoiceSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const invoice = await createInvoice(validation.data);
  return { data: invoice, status: 201 };
}, 'POST /api/invoices');
