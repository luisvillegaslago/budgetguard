/**
 * BudgetGuard Invoices API - Single Resource
 * GET /api/invoices/[id] - Get invoice with line items
 * PUT /api/invoices/[id] - Edit draft invoice (date, line items, notes)
 * PATCH /api/invoices/[id] - Update invoice status
 * DELETE /api/invoices/[id] - Delete draft invoice
 */

import { API_ERROR, INVOICE_STATUS } from '@/constants/finance';
import { UpdateInvoiceSchema, UpdateInvoiceStatusSchema } from '@/schemas/invoice';
import { validateRequest } from '@/schemas/transaction';
import {
  deleteInvoice,
  getInvoiceById,
  updateInvoice,
  updateInvoiceStatus,
} from '@/services/database/InvoiceRepository';
import { notFound, parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const invoiceId = parseIdParam(id);
  if (typeof invoiceId !== 'number') return invoiceId;

  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) return notFound(API_ERROR.NOT_FOUND.INVOICE);

  return { data: invoice };
}, 'GET /api/invoices/[id]');

export const PUT = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const invoiceId = parseIdParam(id);
  if (typeof invoiceId !== 'number') return invoiceId;

  const body = await request.json();
  const validation = validateRequest(UpdateInvoiceSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const invoice = await updateInvoice(invoiceId, validation.data);
  return { data: invoice };
}, 'PUT /api/invoices/[id]');

export const PATCH = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const invoiceId = parseIdParam(id);
  if (typeof invoiceId !== 'number') return invoiceId;

  const body = await request.json();
  const validation = validateRequest(UpdateInvoiceStatusSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const { status, categoryId, bankFeeCents } = validation.data;

  // categoryId required when marking as paid
  if (status === INVOICE_STATUS.PAID && !categoryId) {
    return validationError({ categoryId: ['categoryId is required when marking as paid'] });
  }

  const invoice = await updateInvoiceStatus(invoiceId, status, { categoryId, bankFeeCents });
  return { data: invoice };
}, 'PATCH /api/invoices/[id]');

export const DELETE = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const invoiceId = parseIdParam(id);
  if (typeof invoiceId !== 'number') return invoiceId;

  const deleted = await deleteInvoice(invoiceId);
  if (!deleted) return notFound(API_ERROR.NOT_FOUND.INVOICE);

  return { data: { deleted: true } };
}, 'DELETE /api/invoices/[id]');
