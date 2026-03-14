/**
 * BudgetGuard Invoice PDF API
 * GET /api/invoices/[id]/pdf - Generate and download invoice PDF
 */

import { INVOICE_STATUS } from '@/constants/finance';
import { getInvoiceById, refreshDraftSnapshot } from '@/services/database/InvoiceRepository';
import { notFound, parseIdParam, withApiHandler } from '@/utils/apiHandler';
import { generateInvoicePdfBuffer } from '@/utils/invoicePdf';

export const GET = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const invoiceId = parseIdParam(id);
  if (typeof invoiceId !== 'number') return invoiceId;

  let invoice = await getInvoiceById(invoiceId);
  if (!invoice) return notFound('Invoice not found');

  // Draft invoices: refresh biller + client snapshot before generating PDF
  if (invoice.status === INVOICE_STATUS.DRAFT) {
    const refreshed = await refreshDraftSnapshot(invoiceId);
    if (refreshed) invoice = refreshed;
  }

  const buffer = await generateInvoicePdfBuffer(invoice);

  const { NextResponse } = await import('next/server');
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(buffer.byteLength),
      'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
    },
  });
}, 'GET /api/invoices/[id]/pdf');
